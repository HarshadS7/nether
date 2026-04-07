"""
Vector sync client — interface to ChromaDB for storing and retrieving embeddings.

Stores:
  - Code embeddings (for semantic search of similar code)
  - Documentation embeddings (for RAG-style context retrieval)

Current implementation: uses ChromaDB in-memory / persistent mode.
Embeddings are generated using sentence-transformers (local, no API key).
"""

import logging
from typing import Optional

from config import settings
from models.schemas import (
    ParseResult,
    VectorDocument,
    SymbolInfo,
    ApiEndpoint,
    CallerCallee,
)

logger = logging.getLogger(__name__)

# Lazy imports — these are optional heavy dependencies
_chroma_client = None
_embedding_model = None


def _get_embedding_model():
    """Lazily load the sentence-transformers model."""
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
            logger.info(f"Loaded embedding model: {settings.EMBEDDING_MODEL}")
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. "
                "Using stub embeddings. Run: pip install sentence-transformers"
            )
            _embedding_model = _StubEmbeddingModel()
    return _embedding_model


class _StubEmbeddingModel:
    """Fallback embedding model that produces zero vectors."""

    def encode(self, texts: list[str], **kwargs) -> list[list[float]]:
        return [[0.0] * 384 for _ in texts]


class VectorClient:
    """
    Vector database sync client.

    Uses ChromaDB for persistent storage.
    Falls back to in-memory stub if ChromaDB is unavailable.
    """

    def __init__(self):
        self._collection = None
        self._stub_store: dict[str, dict] = {}  # Fallback in-memory store
        self._init_collection()

    def _init_collection(self):
        """Initialize ChromaDB collection."""
        try:
            import chromadb
            client = chromadb.Client()  # In-memory for prototype
            self._collection = client.get_or_create_collection(
                name=settings.CHROMA_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )
            logger.info(f"ChromaDB collection ready: {settings.CHROMA_COLLECTION}")
        except ImportError:
            logger.warning(
                "chromadb not installed. Using in-memory stub. "
                "Run: pip install chromadb"
            )
        except Exception as e:
            logger.warning(f"ChromaDB init failed: {e}. Using in-memory stub.")

    # ══════════════════════════════════════════════════
    # Store embeddings
    # ══════════════════════════════════════════════════

    def store_code_embedding(
        self,
        file_name: str,
        code: str,
        version: int,
        project_id: str = "default",
    ) -> None:
        """
        Generate and store an embedding for a code file.

        The embedding captures the semantic meaning of the code
        for similarity search later.
        """
        doc_id = f"{project_id}::{file_name}::code::v{version}"
        metadata = {
            "file_name": file_name,
            "project_id": project_id,
            "version": version,
            "type": "code",
        }

        # Truncate code to fit embedding model context
        truncated = code[:8000] if len(code) > 8000 else code

        if self._collection is not None:
            model = _get_embedding_model()
            embedding = model.encode([truncated])[0]
            self._collection.upsert(
                ids=[doc_id],
                embeddings=[embedding.tolist() if hasattr(embedding, "tolist") else embedding],
                documents=[truncated],
                metadatas=[metadata],
            )
        else:
            # Stub store
            self._stub_store[doc_id] = {
                "document": truncated,
                "metadata": metadata,
            }

        logger.info(f"Stored code embedding: {doc_id}")

    def store_doc_embedding(
        self,
        file_name: str,
        documentation: str,
        version: int,
        project_id: str = "default",
    ) -> None:
        """Store an embedding for generated documentation."""
        doc_id = f"{project_id}::{file_name}::doc::v{version}"
        metadata = {
            "file_name": file_name,
            "project_id": project_id,
            "version": version,
            "type": "documentation",
        }

        if self._collection is not None:
            model = _get_embedding_model()
            embedding = model.encode([documentation])[0]
            self._collection.upsert(
                ids=[doc_id],
                embeddings=[embedding.tolist() if hasattr(embedding, "tolist") else embedding],
                documents=[documentation],
                metadatas=[metadata],
            )
        else:
            self._stub_store[doc_id] = {
                "document": documentation,
                "metadata": metadata,
            }

        logger.info(f"Stored doc embedding: {doc_id}")

    # ══════════════════════════════════════════════════
    # Query / Retrieve
    # ══════════════════════════════════════════════════

    def find_related_files(
        self,
        code: str,
        project_id: str = "default",
        top_k: int = 5,
        exclude_file: Optional[str] = None,
    ) -> list[dict]:
        """
        Find files semantically related to the given code.

        Returns list of {"file_name": ..., "score": ..., "snippet": ...}
        """
        if self._collection is None:
            return self._stub_search(code, project_id, exclude_file)

        model = _get_embedding_model()
        truncated = code[:8000] if len(code) > 8000 else code
        query_embedding = model.encode([truncated])[0]

        where_filter = {"project_id": project_id}

        try:
            results = self._collection.query(
                query_embeddings=[query_embedding.tolist() if hasattr(query_embedding, "tolist") else query_embedding],
                n_results=top_k + 1,  # +1 to account for self-match
                where=where_filter,
            )
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")
            return []

        related = []
        if results and results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                fname = meta.get("file_name", "")
                if exclude_file and fname == exclude_file:
                    continue
                related.append({
                    "file_name": fname,
                    "score": 1.0 - (results["distances"][0][i] if results["distances"] else 0),
                    "snippet": (results["documents"][0][i] or "")[:200],
                })

        return related[:top_k]

    def _stub_search(
        self,
        code: str,
        project_id: str,
        exclude_file: Optional[str],
    ) -> list[dict]:
        """Fallback search when ChromaDB is not available."""
        results = []
        for doc_id, data in self._stub_store.items():
            meta = data["metadata"]
            if meta.get("project_id") != project_id:
                continue
            if meta.get("type") != "code":
                continue
            fname = meta.get("file_name", "")
            if exclude_file and fname == exclude_file:
                continue
            results.append({
                "file_name": fname,
                "score": 0.5,  # Stub always returns moderate relevance
                "snippet": data["document"][:200],
            })
        return results[:5]

    def semantic_search(
        self,
        query: str,
        project_id: str = "default",
        top_k: int = 3,
    ) -> list[dict]:
        """Search the vector database for a natural language query."""
        if self._collection is None:
            # Fallback stub search
            results = []
            for doc_id, data in self._stub_store.items():
                meta = data["metadata"]
                if meta.get("project_id") != project_id:
                    continue
                results.append({
                    "document": data["document"][:500],
                    "metadata": meta,
                    "score": 0.5,
                })
            return results[:top_k]

        model = _get_embedding_model()
        query_embedding = model.encode([query])[0]
        where_filter = {"project_id": project_id}

        try:
            res = self._collection.query(
                query_embeddings=[query_embedding.tolist() if hasattr(query_embedding, "tolist") else query_embedding],
                n_results=top_k,
                where=where_filter,
            )
        except Exception as e:
            logger.warning(f"Semantic search failed: {e}")
            return []

        results = []
        if res and res.get("ids") and res["ids"][0]:
            for i, doc_id in enumerate(res["ids"][0]):
                results.append({
                    "document": res["documents"][0][i] if res["documents"] else "",
                    "metadata": res["metadatas"][0][i] if res["metadatas"] else {},
                    "score": 1.0 - (res["distances"][0][i] if res["distances"] else 0),
                })
        return results

    def get_stats(self) -> dict:
        """Return collection statistics."""
        if self._collection is not None:
            return {"count": self._collection.count(), "backend": "chromadb"}
        return {"count": len(self._stub_store), "backend": "in-memory-stub"}

    # ════════════════════════════════════════════════
    # Rich Ingest Document
    # ════════════════════════════════════════════════

    @staticmethod
    def build_vector_document(
        file_path: str,
        parse_result: ParseResult,
        service: str = "",
    ) -> VectorDocument:
        """
        Build a VectorDocument from a ParseResult.

        This is the rich metadata format stored alongside embeddings.
        """
        symbols: list[SymbolInfo] = []
        for f in parse_result.functions:
            symbols.append(SymbolInfo(
                type="function",
                name=f.name,
                line_start=f.start_line,
                line_end=f.end_line,
            ))
        for c in parse_result.classes:
            symbols.append(SymbolInfo(
                type="class",
                name=c.name,
                line_start=c.start_line,
                line_end=c.end_line,
            ))

        return VectorDocument(
            file=file_path,
            language=parse_result.language,
            service=service,
            symbols=symbols,
            imports=parse_result.imports,
            api_endpoints=parse_result.api_endpoints,
            calls=parse_result.caller_callee_pairs,
        )

    def store_ingest_document(
        self,
        file_path: str,
        code: str,
        vector_doc: VectorDocument,
        version: int,
        project_id: str = "default",
    ) -> None:
        """
        Store the rich vector document alongside the embedding.
        """
        doc_id = f"{project_id}::{file_path}::ingest::v{version}"
        metadata = {
            "file_path": file_path,
            "project_id": project_id,
            "version": version,
            "type": "ingest",
            "service": vector_doc.service,
            "language": vector_doc.language,
            "symbols_count": len(vector_doc.symbols),
            "endpoints_count": len(vector_doc.api_endpoints),
        }

        truncated = code[:8000] if len(code) > 8000 else code

        if self._collection is not None:
            model = _get_embedding_model()
            embedding = model.encode([truncated])[0]
            self._collection.upsert(
                ids=[doc_id],
                embeddings=[embedding.tolist() if hasattr(embedding, "tolist") else embedding],
                documents=[truncated],
                metadatas=[metadata],
            )
        else:
            self._stub_store[doc_id] = {
                "document": truncated,
                "metadata": metadata,
                "vector_document": vector_doc.model_dump(),
            }

        logger.info(f"Stored ingest document: {doc_id} ({len(vector_doc.symbols)} symbols, {len(vector_doc.api_endpoints)} endpoints)")
