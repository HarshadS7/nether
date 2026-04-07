"""
Parser factory — selects the correct language parser based on file extension.

Usage:
    parser = ParserFactory.get_parser("app.cpp")
    result = parser.parse("app.cpp", code)
"""

from models.schemas import ParseResult
from .base_parser import BaseParser
from .cpp_parser import CppParser


class _FallbackParser(BaseParser):
    """Returns an empty ParseResult for unsupported languages."""

    def parse(self, file_name: str, code: str) -> ParseResult:
        return ParseResult(
            file_name=file_name,
            language=self._detect_language(file_name),
        )


from .remote_parser import RemoteBackendParser

# Single instance of the backend parser to reuse
_backend_parser = RemoteBackendParser(backend_url="http://localhost:3000/pipeline")

class ParserFactory:
    """Factory that maps file extensions to the appropriate parser."""

    _parsers: dict[str, BaseParser] = {
        "python": _backend_parser,
        "javascript": _backend_parser,
        "typescript": _backend_parser,  # TS uses the same AST route in backend
        "java": _backend_parser,
        "go": _backend_parser,
        # Backend doesn't support C/C++, use local fallback Regex parser
        "cpp": CppParser(),
        "c": CppParser(),
    }

    _fallback = _FallbackParser()

    @classmethod
    def get_parser(cls, file_name: str) -> BaseParser:
        """Return the parser for a given file name."""
        lang = BaseParser._detect_language(file_name)
        return cls._parsers.get(lang, cls._fallback)

    @classmethod
    def parse(cls, file_name: str, code: str) -> ParseResult:
        """Convenience method: detect language, parse, and return result."""
        parser = cls.get_parser(file_name)
        return parser.parse(file_name, code)
