"""
Nether — Shared Utilities
"""

import re
import time
from functools import wraps


def sanitize_filename(name: str, max_length: int = 100) -> str:
    """Replace characters that are invalid in filenames."""
    sanitized = re.sub(r'[/\\:*?"<>|]', "_", name)
    sanitized = sanitized.strip(". ")
    return sanitized[:max_length]


def timer(label: str):
    """Decorator that prints execution time for a function."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            print(f"  ✔ {label} ({elapsed:.1f}s)")
            return result
        return wrapper
    return decorator


def is_text_file(file_path: str) -> bool:
    """Check if a file is readable as UTF-8 text."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            f.read(1024)
        return True
    except (UnicodeDecodeError, PermissionError):
        return False


def truncate(text: str, max_lines: int = 30, max_chars_per_line: int = 1000) -> str:
    """Truncate text to a reasonable size for embedding."""
    lines = text.splitlines()[:max_lines]
    lines = [line[:max_chars_per_line] for line in lines]
    result = "\n".join(lines)
    if len(text.splitlines()) > max_lines:
        result += "\n# ... (truncated)"
    return result
