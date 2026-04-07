"""
Configuration for the ML service.
Loads from environment variables with sensible defaults.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # ── Server ──
    HOST: str = os.getenv("ML_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("ML_PORT", "8000"))

    # ── Generic LLM (OpenAI-compatible) ──
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "")

    # ── LLM (Gemini) ──
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", os.getenv("LLM_API_KEY", ""))
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", os.getenv("LLM_MODEL", "gemini-2.5-flash"))
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.6"))

    # ── Neo4j ──
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "password")

    # ── ChromaDB ──
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
    CHROMA_COLLECTION: str = os.getenv("CHROMA_COLLECTION", "code_embeddings")

    # ── Embeddings ──
    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "all-MiniLM-L6-v2"
    )

    # ── Versioning ──
    VERSION_STORE_DIR: str = os.getenv("VERSION_STORE_DIR", "./version_store")


settings = Settings()
