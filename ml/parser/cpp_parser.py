"""
C/C++ parser — regex-based extraction.

Handles functions, classes/structs, #include directives, and function calls.
For production use, tree-sitter-cpp would provide better accuracy.
"""

import re
import hashlib
from models.schemas import ParseResult, FunctionInfo, ClassInfo
from .base_parser import BaseParser


class CppParser(BaseParser):
    """Deterministic parser for C and C++ source files."""

    # ── Regex patterns ──

    # #include <header> or #include "header"
    _INCLUDE_PATTERN = re.compile(
        r'#\s*include\s+[<"]([^>"]+)[>"]', re.MULTILINE
    )

    # Function: return_type name(params) {
    # Handles pointer returns, namespaces, templates loosely
    _FUNC_PATTERN = re.compile(
        r"(?:(?:static|inline|virtual|extern|const|unsigned|signed|volatile)\s+)*"
        r"([\w:*&<>,\s]+?)\s+"  # return type
        r"((?:\w+::)*\w+)\s*"   # function name (possibly with namespace)
        r"\(([^)]*)\)\s*"       # parameters
        r"(?:const\s*)?"
        r"(?:override\s*)?"
        r"(?:noexcept\s*)?"
        r"\{",
        re.MULTILINE,
    )

    # class/struct Name : public Base {
    _CLASS_PATTERN = re.compile(
        r"(?:class|struct)\s+(\w+)"
        r"(?:\s*:\s*(?:public|protected|private)\s+(\w+))?"
        r"\s*\{",
        re.MULTILINE,
    )

    # Method inside class body: return_type name(params) {
    _METHOD_PATTERN = re.compile(
        r"(?:(?:static|virtual|inline|const)\s+)*"
        r"[\w:*&<>,\s]+?\s+"
        r"(\w+)\s*\([^)]*\)\s*"
        r"(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?"
        r"\{",
        re.MULTILINE,
    )

    # Function calls: name(
    _CALL_PATTERN = re.compile(r"\b(\w+)\s*\(", re.MULTILINE)

    # C/C++ keywords to exclude from call detection
    _KEYWORDS = {
        "if", "for", "while", "switch", "catch", "return", "throw",
        "new", "delete", "sizeof", "typeid", "static_cast", "dynamic_cast",
        "const_cast", "reinterpret_cast", "class", "struct", "enum",
        "namespace", "using", "typedef", "template", "typename",
        "int", "char", "float", "double", "void", "bool", "long",
        "short", "unsigned", "signed", "auto", "register", "extern",
        "static", "inline", "virtual", "explicit", "friend", "operator",
        "public", "private", "protected", "const", "volatile", "mutable",
        "include", "define", "ifdef", "ifndef", "endif", "pragma",
    }

    def parse(self, file_name: str, code: str) -> ParseResult:
        language = "c" if file_name.endswith(".c") else "cpp"
        functions = self._extract_functions(code)
        classes = self._extract_classes(code)
        imports = self._extract_imports(code)
        calls = self._extract_calls(code, functions, classes)

        return ParseResult(
            file_name=file_name,
            language=language,
            functions=functions,
            classes=classes,
            calls=calls,
            imports=imports,
        )

    def _extract_functions(self, code: str) -> list[FunctionInfo]:
        functions: list[FunctionInfo] = []
        seen: set[str] = set()

        for match in self._FUNC_PATTERN.finditer(code):
            return_type = match.group(1).strip()
            name = match.group(2).strip()
            params_str = match.group(3).strip()

            if name in seen or name in self._KEYWORDS:
                continue
            seen.add(name)

            params = []
            if params_str and params_str != "void":
                for param in params_str.split(","):
                    param = param.strip()
                    # Extract parameter name (last word)
                    parts = param.replace("*", " ").replace("&", " ").split()
                    if parts:
                        params.append(parts[-1])

            line_no = code[:match.start()].count("\n") + 1
            body_hash = hashlib.md5(match.group(0).encode()).hexdigest()

            functions.append(FunctionInfo(
                name=name,
                parameters=params,
                return_type=return_type,
                start_line=line_no,
                end_line=line_no,
                body_hash=body_hash,
            ))

        return functions

    def _extract_classes(self, code: str) -> list[ClassInfo]:
        classes: list[ClassInfo] = []

        for match in self._CLASS_PATTERN.finditer(code):
            name = match.group(1)
            bases = [match.group(2)] if match.group(2) else []
            line_no = code[:match.start()].count("\n") + 1

            # Find class body
            start = match.end()
            brace_count = 1
            pos = start
            while pos < len(code) and brace_count > 0:
                if code[pos] == "{":
                    brace_count += 1
                elif code[pos] == "}":
                    brace_count -= 1
                pos += 1

            class_body = code[start:pos]
            methods = [m.group(1) for m in self._METHOD_PATTERN.finditer(class_body)
                       if m.group(1) not in self._KEYWORDS]

            end_line = code[:pos].count("\n") + 1

            classes.append(ClassInfo(
                name=name,
                methods=methods,
                bases=bases,
                start_line=line_no,
                end_line=end_line,
            ))

        return classes

    def _extract_imports(self, code: str) -> list[str]:
        return list(dict.fromkeys(
            m.group(1) for m in self._INCLUDE_PATTERN.finditer(code)
        ))

    def _extract_calls(
        self,
        code: str,
        functions: list[FunctionInfo],
        classes: list[ClassInfo],
    ) -> list[str]:
        calls: list[str] = []
        seen: set[str] = set()

        for match in self._CALL_PATTERN.finditer(code):
            name = match.group(1)
            if name in self._KEYWORDS or name in seen:
                continue
            seen.add(name)
            calls.append(name)

        return calls
