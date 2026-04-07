"""
Nether — Shared Configuration
by Team Kittens 🐱
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ directory
load_dotenv(Path(__file__).parent / ".env")

# ── Paths ──────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
CLONE_DIR = BASE_DIR / "cloned_repos"
VAULT_DIR = BASE_DIR / "vault"
CHROMA_DIR = BASE_DIR / "chroma_db"
GRAPH_PATH = BASE_DIR / "graph.json"

# ── Models ─────────────────────────────────────────────
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

# ── File Scanning ──────────────────────────────────────
SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".go", ".rs", ".rb",
    ".cpp", ".c", ".h",
}

IGNORED_DIRS = {
    "node_modules", ".git", "__pycache__", "venv",
    "dist", "build", ".next", ".venv", "env",
    ".tox", ".mypy_cache", ".pytest_cache",
}

MAX_FILE_SIZE_BYTES = 100_000  # 100 KB
