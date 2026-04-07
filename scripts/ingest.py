"""
Nether — Repository Ingestion

Handles cloning repos and extracting structured data from source files.
by Team Kittens 🐱
"""

import os
import re
from pathlib import Path
from urllib.parse import urlparse

import git
from tqdm import tqdm

from config import (
    CLONE_DIR,
    IGNORED_DIRS,
    MAX_FILE_SIZE_BYTES,
    SUPPORTED_EXTENSIONS,
)
from utils import is_text_file


# ── Regex patterns ─────────────────────────────────────

# Python imports
_PY_IMPORT = re.compile(
    r"^\s*import\s+([\w.]+)", re.MULTILINE
)
_PY_FROM_IMPORT = re.compile(
    r"^\s*from\s+(\.{0,3}[\w.]*)\s+import", re.MULTILINE
)

# JS / TS imports
_JS_IMPORT_FROM = re.compile(
    r"""^\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]""", re.MULTILINE
)
_JS_REQUIRE = re.compile(
    r"""(?:^|=\s*)require\s*\(\s*['"]([^'"]+)['"]\s*\)""", re.MULTILINE
)

# Python definitions
_PY_FUNC = re.compile(
    r"^(\s*)def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:", re.MULTILINE
)
_PY_CLASS = re.compile(
    r"^(\s*)class\s+(\w+)\s*(?:\([^)]*\))?\s*:", re.MULTILINE
)

# JS / TS definitions
_JS_FUNC = re.compile(
    r"(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(", re.MULTILINE
)
_JS_ARROW = re.compile(
    r"(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?[^)]*\)?\s*=>",
    re.MULTILINE,
)
_JS_FUNC_EXPR = re.compile(
    r"(?:const|let|var)\s+(\w+)\s*=\s*function", re.MULTILINE
)
_JS_CLASS = re.compile(
    r"(?:export\s+)?(?:default\s+)?class\s+(\w+)", re.MULTILINE
)

# Language detection
_PYTHON_EXTS = {".py"}
_JS_TS_EXTS = {".js", ".jsx", ".ts", ".tsx"}


# ── Helper: detect language from extension ──────────────

def _detect_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext in _PYTHON_EXTS:
        return "python"
    if ext in _JS_TS_EXTS:
        return "javascript"
    lang_map = {
        ".java": "java", ".go": "go", ".rs": "rust",
        ".rb": "ruby", ".cpp": "cpp", ".c": "c", ".h": "c",
    }
    return lang_map.get(ext, "unknown")


# ── 1. clone_repo ───────────────────────────────────────

def clone_repo(repo_url: str) -> str:
    """Clone a GitHub repo into CLONE_DIR. Skip if already present."""
    # Extract repo name from URL
    parsed = urlparse(repo_url.rstrip("/"))
    repo_name = Path(parsed.path).stem  # e.g. "markupsafe"

    dest = CLONE_DIR / repo_name
    CLONE_DIR.mkdir(parents=True, exist_ok=True)

    if dest.exists() and any(dest.iterdir()):
        print(f"  ⏩ Repo already cloned at {dest}")
        return str(dest)

    print(f"  ⬇  Cloning {repo_url} → {dest}")
    try:
        git.Repo.clone_from(repo_url, str(dest), depth=1)
        print(f"  ✔ Clone complete")
    except git.exc.GitCommandError as e:
        raise RuntimeError(f"Failed to clone {repo_url}: {e}") from e

    return str(dest)


# ── 2. scan_files ───────────────────────────────────────

def scan_files(repo_path: str) -> list[str]:
    """Walk directory tree and return list of source file paths."""
    source_files: list[str] = []

    for root, dirs, files in os.walk(repo_path):
        # Prune ignored directories (modifying dirs in-place)
        dirs[:] = [
            d for d in dirs
            if d not in IGNORED_DIRS and not os.path.islink(os.path.join(root, d))
        ]

        for fname in files:
            fpath = os.path.join(root, fname)

            # Skip symlinks
            if os.path.islink(fpath):
                continue

            # Check extension
            if Path(fname).suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            # Check size
            try:
                if os.path.getsize(fpath) > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                continue

            # Check if text (UTF-8 readable)
            if not is_text_file(fpath):
                continue

            source_files.append(fpath)

    return sorted(source_files)


# ── 3. extract_imports ──────────────────────────────────

def extract_imports(file_path: str, content: str) -> list[str]:
    """Extract import module names from file content using regex."""
    lang = _detect_language(file_path)
    imports: list[str] = []

    if lang == "python":
        # `import foo.bar` → "foo.bar"
        for m in _PY_IMPORT.finditer(content):
            imports.append(m.group(1))
        # `from foo.bar import baz` → "foo.bar"
        for m in _PY_FROM_IMPORT.finditer(content):
            module = m.group(1)
            if module:  # skip empty (shouldn't happen with regex but be safe)
                imports.append(module)

    elif lang == "javascript":
        for m in _JS_IMPORT_FROM.finditer(content):
            imports.append(m.group(1))
        for m in _JS_REQUIRE.finditer(content):
            imports.append(m.group(1))

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for imp in imports:
        if imp not in seen:
            seen.add(imp)
            unique.append(imp)
    return unique


# ── 4. extract_definitions ─────────────────────────────

def _extract_docstring(lines: list[str], start_line: int) -> str | None:
    """Try to grab the docstring/comment right after a def/class line."""
    # Look at the line immediately after the definition
    idx = start_line  # 0-indexed position of the line after the def/class
    if idx >= len(lines):
        return None

    line = lines[idx].strip()

    # Python triple-quote docstring
    for quote in ('"""', "'''"):
        if line.startswith(quote):
            # Single-line docstring
            if line.count(quote) >= 2:
                return line.strip(quote).strip()
            # Multi-line docstring
            doc_lines = [line[len(quote):]]
            for j in range(idx + 1, min(idx + 20, len(lines))):
                l = lines[j]
                if quote in l:
                    doc_lines.append(l.strip().rstrip(quote).strip())
                    break
                doc_lines.append(l.strip())
            return " ".join(doc_lines).strip()

    # JS/TS: // comment after function
    if line.startswith("//"):
        return line.lstrip("/ ").strip()

    return None


def extract_definitions(file_path: str, content: str) -> list[dict]:
    """Extract function and class definitions from file content."""
    lang = _detect_language(file_path)
    defs: list[dict] = []
    lines = content.splitlines()

    if lang == "python":
        for m in _PY_FUNC.finditer(content):
            line_num = content[:m.start()].count("\n") + 1
            docstring = _extract_docstring(lines, line_num)  # line after def
            defs.append({
                "name": m.group(2),
                "type": "function",
                "line_number": line_num,
                "signature": m.group(0).strip(),
                "docstring": docstring,
            })
        for m in _PY_CLASS.finditer(content):
            line_num = content[:m.start()].count("\n") + 1
            docstring = _extract_docstring(lines, line_num)
            defs.append({
                "name": m.group(2),
                "type": "class",
                "line_number": line_num,
                "signature": m.group(0).strip(),
                "docstring": docstring,
            })

    elif lang == "javascript":
        for pattern, def_type in [
            (_JS_FUNC, "function"),
            (_JS_ARROW, "function"),
            (_JS_FUNC_EXPR, "function"),
            (_JS_CLASS, "class"),
        ]:
            for m in pattern.finditer(content):
                line_num = content[:m.start()].count("\n") + 1
                defs.append({
                    "name": m.group(1),
                    "type": def_type,
                    "line_number": line_num,
                    "signature": m.group(0).strip(),
                    "docstring": None,
                })

    # Sort definitions by line number
    defs.sort(key=lambda d: d["line_number"])
    return defs


# ── 5. extract_function_calls ───────────────────────────

def extract_function_calls(
    content: str, known_functions: list[str]
) -> list[str]:
    """Find which known functions are called in this content.

    Approximate: checks if `funcname(` appears anywhere in the content.
    """
    calls: list[str] = []
    for fname in known_functions:
        # Simple heuristic: function name followed by `(`
        # Use word boundary to avoid partial matches (e.g. "get" matching "get_user")
        pattern = re.compile(rf"\b{re.escape(fname)}\s*\(")
        if pattern.search(content):
            calls.append(fname)
    return calls


# ── 6. parse_file ───────────────────────────────────────

def parse_file(file_path: str, repo_root: str) -> dict:
    """Parse a single source file and return structured data."""
    rel_path = os.path.relpath(file_path, repo_root)
    language = _detect_language(file_path)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except (UnicodeDecodeError, PermissionError, OSError):
        # Return minimal entry for unreadable files
        return {
            "path": rel_path,
            "absolute_path": file_path,
            "language": language,
            "imports": [],
            "definitions": [],
            "content": "",
            "line_count": 0,
        }

    # Truncate extremely long lines
    lines = content.splitlines()
    lines = [line[:1000] for line in lines]
    content = "\n".join(lines)

    imports = extract_imports(file_path, content)
    definitions = extract_definitions(file_path, content)

    return {
        "path": rel_path,
        "absolute_path": file_path,
        "language": language,
        "imports": imports,
        "definitions": definitions,
        "content": content,
        "line_count": len(lines),
    }


# ── Shared pipeline ─────────────────────────────────────

def _run_pipeline(repo_path: str) -> list[dict]:
    """Scan → parse → detect calls. Shared by ingest_repo and ingest_folder."""
    files = scan_files(repo_path)
    print(f"  ✔ Found {len(files)} source files")

    if not files:
        print("  ⚠ No source files found. Check SUPPORTED_EXTENSIONS in config.")
        return []

    parsed: list[dict] = []
    for fpath in tqdm(files, desc="  Parsing", unit="file"):
        result = parse_file(fpath, repo_path)
        if result["line_count"] > 0:
            parsed.append(result)

    # Collect all known function names for call detection
    all_functions: list[str] = []
    for pf in parsed:
        for defn in pf["definitions"]:
            if defn["type"] == "function":
                all_functions.append(defn["name"])

    # Second pass: detect function calls
    for pf in parsed:
        own_funcs = {d["name"] for d in pf["definitions"]}
        external_funcs = [f for f in all_functions if f not in own_funcs]
        pf["calls"] = extract_function_calls(pf["content"], external_funcs)

    return parsed


def summarize(parsed: list[dict]) -> dict:
    """Return summary stats dict for the parsed results."""
    total_defs = sum(len(pf["definitions"]) for pf in parsed)
    total_classes = sum(
        1 for pf in parsed for d in pf["definitions"] if d["type"] == "class"
    )
    total_funcs = total_defs - total_classes
    total_imports = sum(len(pf["imports"]) for pf in parsed)
    total_calls = sum(len(pf.get("calls", [])) for pf in parsed)
    total_lines = sum(pf["line_count"] for pf in parsed)
    return {
        "files": len(parsed),
        "classes": total_classes,
        "functions": total_funcs,
        "imports": total_imports,
        "calls": total_calls,
        "total_lines": total_lines,
    }


# ── 7. ingest_repo ─────────────────────────────────────

def ingest_repo(repo_url: str) -> list[dict]:
    """Top-level ingestion: clone → scan → parse all files."""
    print("\n[1/2] Cloning repository...")
    repo_path = clone_repo(repo_url)

    print("\n[2/2] Scanning & parsing files...")
    parsed = _run_pipeline(repo_path)

    stats = summarize(parsed)
    print(f"\n  ✔ Parsed {stats['files']} files: "
          f"{stats['classes']} classes, {stats['functions']} functions, "
          f"{stats['imports']} imports")
    return parsed


# ── 8. ingest_folder ───────────────────────────────────

def ingest_folder(folder_path: str) -> list[dict]:
    """Ingest a local folder (no cloning needed)."""
    folder = Path(folder_path).resolve()
    if not folder.is_dir():
        raise FileNotFoundError(f"Folder not found: {folder}")

    print(f"\n  📂 Source: {folder}")
    print("\n  Scanning & parsing files...")
    parsed = _run_pipeline(str(folder))

    stats = summarize(parsed)
    print(f"\n  ✔ Parsed {stats['files']} files: "
          f"{stats['classes']} classes, {stats['functions']} functions, "
          f"{stats['imports']} imports")
    return parsed
