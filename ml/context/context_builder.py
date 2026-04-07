"""
Context builder — merges all data sources into a structured LLM input.

This is the critical bridge between deterministic extraction and LLM reasoning.
It ensures the LLM never receives raw messy code — only a carefully curated context.

Sources merged:
  1. Parsed structure (functions, classes, imports, calls)
  2. Graph relationships (dependents, dependencies)
  3. Change diff (what was added/removed/modified)
  4. Semantic retrieval (related files from vector DB)

Output: StructuredContext (Pydantic model) + formatted prompt string
"""

import logging
from typing import Optional

from models.schemas import (
    ParseResult,
    DiffResult,
    PushType,
    StructuredContext,
)
from integrations.graph_client import GraphClient
from integrations.vector_client import VectorClient

logger = logging.getLogger(__name__)


class ContextBuilder:
    """Builds structured context for the LLM from all available data sources."""

    def __init__(self, graph_client: GraphClient, vector_client: VectorClient):
        self.graph = graph_client
        self.vector = vector_client

    def build(
        self,
        file_name: str,
        code: str,
        push_type: PushType,
        parse_result: ParseResult,
        diff: Optional[DiffResult] = None,
        project_id: str = "default",
    ) -> StructuredContext:
        """
        Build a StructuredContext from all sources.

        Args:
            file_name: Name of the pushed file
            code: Full source code
            push_type: "new" or "update"
            parse_result: Output from the parser
            diff: Structural diff (None for new files)
            project_id: Project identifier

        Returns:
            StructuredContext with all merged data
        """

        # 1. Structural data (from parser)
        functions = [f.name for f in parse_result.functions]
        classes = [c.name for c in parse_result.classes]
        imports = parse_result.imports
        calls = parse_result.calls

        # 2. Graph relationships
        depended_on_by = self.graph.get_dependents(file_name)
        depends_on = self.graph.get_dependencies(file_name)

        # 3. Semantic retrieval (related files)
        related = self.vector.find_related_files(
            code=code,
            project_id=project_id,
            top_k=5,
            exclude_file=file_name,
        )
        related_files = [r["file_name"] for r in related]
        related_snippets = [r.get("snippet", "") for r in related if r.get("snippet")]

        # 4. Truncate code for context (don't send entire file to LLM)
        code_snippet = self._truncate_code(code, max_lines=100)

        return StructuredContext(
            file_name=file_name,
            language=parse_result.language,
            push_type=push_type,
            code_snippet=code_snippet,
            functions=functions,
            classes=classes,
            imports=imports,
            calls=calls,
            depended_on_by=depended_on_by,
            depends_on=depends_on,
            diff=diff,
            related_files=related_files,
            related_snippets=related_snippets,
        )

    def format_prompt(self, ctx: StructuredContext) -> str:
        """
        Format the StructuredContext into a human-readable prompt for the LLM.

        This is what the LLM actually sees — structured, clean, no noise.
        """
        sections: list[str] = []

        # Header
        sections.append(f"## File: {ctx.file_name}")
        sections.append(f"Language: {ctx.language}")
        sections.append(f"Push type: {ctx.push_type.value}")
        sections.append("")

        # Code snippet
        if ctx.code_snippet:
            sections.append("### Source Code (truncated)")
            sections.append(f"```{ctx.language}")
            sections.append(ctx.code_snippet)
            sections.append("```")
            sections.append("")

        # Structure
        if ctx.functions:
            sections.append("### Functions")
            for f in ctx.functions:
                sections.append(f"- {f}")
            sections.append("")

        if ctx.classes:
            sections.append("### Classes")
            for c in ctx.classes:
                sections.append(f"- {c}")
            sections.append("")

        if ctx.imports:
            sections.append("### Imports / Dependencies")
            for i in ctx.imports:
                sections.append(f"- {i}")
            sections.append("")

        if ctx.calls:
            sections.append("### External Calls")
            for c in ctx.calls:
                sections.append(f"- {c}")
            sections.append("")

        # Graph relationships
        if ctx.depended_on_by:
            sections.append("### Used By (dependents)")
            for d in ctx.depended_on_by:
                sections.append(f"- {d}")
            sections.append("")

        if ctx.depends_on:
            sections.append("### Depends On")
            for d in ctx.depends_on:
                sections.append(f"- {d}")
            sections.append("")

        # Diff (for updates)
        if ctx.diff and ctx.diff.has_changes:
            sections.append("### Changes (diff)")
            if ctx.diff.added_functions:
                sections.append(f"Added functions: {', '.join(ctx.diff.added_functions)}")
            if ctx.diff.removed_functions:
                sections.append(f"Removed functions: {', '.join(ctx.diff.removed_functions)}")
            if ctx.diff.modified_functions:
                sections.append(f"Modified functions: {', '.join(ctx.diff.modified_functions)}")
            if ctx.diff.added_classes:
                sections.append(f"Added classes: {', '.join(ctx.diff.added_classes)}")
            if ctx.diff.removed_classes:
                sections.append(f"Removed classes: {', '.join(ctx.diff.removed_classes)}")
            if ctx.diff.added_imports:
                sections.append(f"Added imports: {', '.join(ctx.diff.added_imports)}")
            if ctx.diff.removed_imports:
                sections.append(f"Removed imports: {', '.join(ctx.diff.removed_imports)}")
            if ctx.diff.added_calls:
                sections.append(f"Added calls: {', '.join(ctx.diff.added_calls)}")
            if ctx.diff.removed_calls:
                sections.append(f"Removed calls: {', '.join(ctx.diff.removed_calls)}")
            sections.append("")

        # Related files (semantic)
        if ctx.related_files:
            sections.append("### Semantically Related Files")
            for rf in ctx.related_files:
                sections.append(f"- {rf}")
            sections.append("")

        return "\n".join(sections)

    @staticmethod
    def _truncate_code(code: str, max_lines: int = 100) -> str:
        """Truncate code to a max number of lines for LLM context."""
        lines = code.split("\n")
        if len(lines) <= max_lines:
            return code
        # Take first 60 + last 40 lines with a marker
        head = lines[:60]
        tail = lines[-40:]
        return "\n".join(head + [f"\n... ({len(lines) - 100} lines omitted) ...\n"] + tail)
