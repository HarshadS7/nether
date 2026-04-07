"""
Version store — persists file snapshots to disk so we can compare versions.

Each version is stored as a JSON file:
  version_store/<project_id>/<file_name>/v<N>.json

For a production system this would be backed by a database (Postgres, etc.).
"""

import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import settings
from models.schemas import ParseResult, VersionMetadata


class VersionStore:
    """File-based version storage for code snapshots."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or settings.VERSION_STORE_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    # ──────────────────────────────────────────────
    # Path helpers
    # ──────────────────────────────────────────────

    def _file_dir(self, project_id: str, file_name: str) -> Path:
        """Directory for all versions of a specific file."""
        safe_name = file_name.replace("/", "__").replace("\\", "__")
        d = self.base_dir / project_id / safe_name
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _version_path(self, project_id: str, file_name: str, version: int) -> Path:
        return self._file_dir(project_id, file_name) / f"v{version}.json"

    # ──────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────

    def get_latest_version(self, project_id: str, file_name: str) -> int:
        """Return the latest version number for a file, or 0 if none."""
        d = self._file_dir(project_id, file_name)
        versions = [
            int(f.stem.lstrip("v"))
            for f in d.glob("v*.json")
            if f.stem.lstrip("v").isdigit()
        ]
        return max(versions) if versions else 0

    def get_version(self, project_id: str, file_name: str, version: int) -> Optional[VersionMetadata]:
        """Load a specific version's metadata."""
        path = self._version_path(project_id, file_name, version)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return VersionMetadata(**data)

    def get_latest(self, project_id: str, file_name: str) -> Optional[VersionMetadata]:
        """Load the latest version metadata."""
        v = self.get_latest_version(project_id, file_name)
        if v == 0:
            return None
        return self.get_version(project_id, file_name, v)

    def store_version(
        self,
        project_id: str,
        file_name: str,
        code: str,
        parse_result: ParseResult,
    ) -> VersionMetadata:
        """
        Create a new version snapshot.

        Returns the VersionMetadata with the new version number.
        """
        current = self.get_latest_version(project_id, file_name)
        new_version = current + 1

        metadata = VersionMetadata(
            file_name=file_name,
            version=new_version,
            timestamp=datetime.now(timezone.utc).isoformat(),
            code_hash=hashlib.sha256(code.encode()).hexdigest(),
            parse_result=parse_result,
        )

        path = self._version_path(project_id, file_name, new_version)
        path.write_text(
            metadata.model_dump_json(indent=2),
            encoding="utf-8",
        )

        # Also store the raw code alongside
        code_path = path.with_suffix(".code")
        code_path.write_text(code, encoding="utf-8")

        return metadata

    def get_code(self, project_id: str, file_name: str, version: int) -> Optional[str]:
        """Retrieve the raw code for a specific version."""
        code_path = self._version_path(project_id, file_name, version).with_suffix(".code")
        if not code_path.exists():
            return None
        return code_path.read_text(encoding="utf-8")

    def list_files(self, project_id: str) -> list[str]:
        """List all tracked files for a project."""
        project_dir = self.base_dir / project_id
        if not project_dir.exists():
            return []
        return [
            d.name.replace("__", "/")
            for d in project_dir.iterdir()
            if d.is_dir()
        ]

    def get_version_history(self, project_id: str, file_name: str) -> list[VersionMetadata]:
        """Return all versions for a file, ordered by version number."""
        latest = self.get_latest_version(project_id, file_name)
        history = []
        for v in range(1, latest + 1):
            meta = self.get_version(project_id, file_name, v)
            if meta:
                history.append(meta)
        return history
