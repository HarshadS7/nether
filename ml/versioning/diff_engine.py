"""
Diff engine — computes structural differences between two ParseResult snapshots.

This is purely deterministic: it compares function/class names, imports, and calls
between two versions and produces a DiffResult.

No LLM. No heuristics. Just set operations.
"""

from models.schemas import ParseResult, DiffResult, FunctionInfo


class DiffEngine:
    """Computes structural diffs between two parsed file versions."""

    @staticmethod
    def compute_diff(
        old_parse: ParseResult,
        new_parse: ParseResult,
        old_version: int,
        new_version: int,
    ) -> DiffResult:
        """
        Compare two ParseResult snapshots and return a DiffResult.

        This detects:
        - Added / removed / modified functions
        - Added / removed classes
        - Added / removed imports
        - Added / removed calls
        """

        # ── Functions ──
        old_funcs = {f.name: f for f in old_parse.functions}
        new_funcs = {f.name: f for f in new_parse.functions}

        old_func_names = set(old_funcs.keys())
        new_func_names = set(new_funcs.keys())

        added_functions = sorted(new_func_names - old_func_names)
        removed_functions = sorted(old_func_names - new_func_names)

        # Modified = exists in both but body hash changed
        modified_functions = sorted(
            name for name in (old_func_names & new_func_names)
            if old_funcs[name].body_hash != new_funcs[name].body_hash
        )

        # ── Classes ──
        old_class_names = {c.name for c in old_parse.classes}
        new_class_names = {c.name for c in new_parse.classes}

        added_classes = sorted(new_class_names - old_class_names)
        removed_classes = sorted(old_class_names - new_class_names)

        # ── Imports ──
        old_imports = set(old_parse.imports)
        new_imports = set(new_parse.imports)

        added_imports = sorted(new_imports - old_imports)
        removed_imports = sorted(old_imports - new_imports)

        # ── Calls ──
        old_calls = set(old_parse.calls)
        new_calls = set(new_parse.calls)

        added_calls = sorted(new_calls - old_calls)
        removed_calls = sorted(old_calls - new_calls)

        # ── Has changes? ──
        has_changes = bool(
            added_functions or removed_functions or modified_functions
            or added_classes or removed_classes
            or added_imports or removed_imports
            or added_calls or removed_calls
        )

        return DiffResult(
            file_name=new_parse.file_name,
            old_version=old_version,
            new_version=new_version,
            added_functions=added_functions,
            removed_functions=removed_functions,
            modified_functions=modified_functions,
            added_classes=added_classes,
            removed_classes=removed_classes,
            added_imports=added_imports,
            removed_imports=removed_imports,
            added_calls=added_calls,
            removed_calls=removed_calls,
            has_changes=has_changes,
        )

    @staticmethod
    def empty_diff(file_name: str, version: int) -> DiffResult:
        """Return an empty diff for new files (no previous version to compare)."""
        return DiffResult(
            file_name=file_name,
            old_version=0,
            new_version=version,
            has_changes=False,
        )
