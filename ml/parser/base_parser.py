"""
Abstract base parser.

Every language-specific parser inherits from this and implements `parse()`.
Parsing is *always* deterministic — no LLM calls, no heuristics.
"""

from abc import ABC, abstractmethod
from models.schemas import ParseResult


class BaseParser(ABC):
    """Base class for all language parsers."""

    @abstractmethod
    def parse(self, file_name: str, code: str) -> ParseResult:
        """
        Parse source code and return a structured ParseResult.

        Args:
            file_name: Name of the file (used for context)
            code: Full source code string

        Returns:
            ParseResult with functions, classes, imports, calls
        """
        ...

    @staticmethod
    def _detect_language(file_name: str) -> str:
        """Detect language from file extension."""
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".cpp": "cpp",
            ".cc": "cpp",
            ".cxx": "cpp",
            ".c": "c",
            ".h": "cpp",
            ".hpp": "cpp",
            ".java": "java",
        }
        for ext, lang in ext_map.items():
            if file_name.endswith(ext):
                return lang
        return "unknown"
