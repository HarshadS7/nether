"""Versioning package — file snapshots and structural diffing."""

from .version_store import VersionStore
from .diff_engine import DiffEngine

__all__ = ["VersionStore", "DiffEngine"]
