"""
FastAPI entry point — the ML service API.

Endpoints:
  POST /push           — Process a code push (main workflow)
  GET  /graph          — Get current dependency graph
  GET  /graph/file     — Get graph data for a specific file
  GET  /versions       — Get version history for a file
  GET  /health         — Health check
  GET  /stats          — Service statistics
"""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ── Ensure the ml/ directory is on the Python path ──
sys.path.insert(0, str(Path(__file__).parent))

from config import settings
from models.schemas import (
    PushRequest,
    PushResponse,
    IngestRequest,
    IngestResponse,
    PushType,
    GraphNode,
    GraphEdge,
    ChatRequest,
    ChatResponse,
)
from parser import ParserFactory
from versioning.version_store import VersionStore
from versioning.diff_engine import DiffEngine
from integrations.graph_client import GraphClient
from integrations.vector_client import VectorClient
from context.context_builder import ContextBuilder
from llm.reasoning import ReasoningEngine
from orchastrater.push_orchestrator import PushOrchestrator

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("ml_service")

# ──────────────────────────────────────────────
# Service singletons (initialized at startup)
# ──────────────────────────────────────────────
version_store: VersionStore = None  # type: ignore
graph_client: GraphClient = None    # type: ignore
vector_client: VectorClient = None  # type: ignore
context_builder: ContextBuilder = None  # type: ignore
reasoning_engine: ReasoningEngine = None  # type: ignore
orchestrator: PushOrchestrator = None     # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all services on startup."""
    global version_store, graph_client, vector_client
    global context_builder, reasoning_engine, orchestrator

    logger.info("Initializing ML service...")

    version_store = VersionStore()
    graph_client = GraphClient()
    vector_client = VectorClient()
    context_builder = ContextBuilder(graph_client, vector_client)
    reasoning_engine = ReasoningEngine()
    orchestrator = PushOrchestrator(
        version_store=version_store,
        graph_client=graph_client,
        vector_client=vector_client,
        context_builder=context_builder,
        reasoning_engine=reasoning_engine,
    )

    logger.info("ML service ready")
    yield
    logger.info("ML service shutting down")


# ══════════════════════════════════════════════════
# FastAPI app
# ══════════════════════════════════════════════════

app = FastAPI(
    title="Architecture Intelligence Engine",
    description="Incremental code analysis with dependency graph, versioning, and LLM reasoning",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════

@app.post("/push", response_model=PushResponse)
async def process_push(push: PushRequest):
    """
    Process a code push — the main intelligence pipeline.

    Accepts a file with its code and push type ('new' or 'update').
    Returns documentation, change explanation, suggestions, and graph updates.
    """
    result = await orchestrator.process_push(push)
    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error)
    return result


@app.post("/ingest", response_model=IngestResponse)
async def ingest_file(req: IngestRequest):
    """
    POST /ingest — richer ingestion endpoint.

    Accepts service context alongside code. Returns:
      - Rich vector document (symbols, endpoints, caller/callee)
      - Graph update summary
      - LLM reasoning output
    """
    # Determine if this is a new file or an update
    existing = version_store.get_latest(req.project_id, req.file_path)
    push_type = PushType.UPDATE if existing else PushType.NEW

    # Delegate to the orchestrator via a PushRequest
    push = PushRequest(
        file_name=req.file_path,
        code=req.code,
        push_type=push_type,
        project_id=req.project_id,
    )
    result = await orchestrator.process_push(push)
    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error)

    # Build the rich vector document
    vec_doc = vector_client.build_vector_document(
        file_path=req.file_path,
        parse_result=result.parse_result,
        service=req.service,
    )

    # Store the rich document
    vector_client.store_ingest_document(
        file_path=req.file_path,
        code=req.code,
        vector_doc=vec_doc,
        version=result.version,
        project_id=req.project_id,
    )

    return IngestResponse(
        status="success",
        file_path=req.file_path,
        service=req.service,
        version=result.version,
        vector_document=vec_doc,
        graph_update_summary=result.graph_update_summary,
        reasoning=result.reasoning,
        diff=result.diff,
    )


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    RAG Chat endpoint. Answers architecture questions using vector + graph context.
    """
    try:
        # 1. Semantic search
        results = vector_client.semantic_search(
            query=req.question,
            project_id=req.project_id,
            top_k=3
        )

        sources = []
        context_parts = []
        
        # 2. Extract structural data
        for i, match in enumerate(results):
            meta = match["metadata"]
            file_name = meta.get("file_name", f"match_{i}")
            
            sources.append({
                "type": "vector",
                "file": file_name,
                "score": match.get("score", 0.0)
            })

            # Get graph dependencies if file is known
            dependents = graph_client.get_dependents(file_name)
            dependencies = graph_client.get_dependencies(file_name)

            context_parts.append(
                f"File: {file_name}\n"
                f"Content Snippet:\n{match['document']}\n"
                f"Graph: depends on {dependencies}, depended on by {dependents}"
            )
            
        full_context = "\n\n---\n\n".join(context_parts)
        
        # 3. LLM Reasoning
        answer = reasoning_engine.chat(
            question=req.question,
            context=full_context
        )

        return ChatResponse(
            answer=answer,
            sources=sources
        )
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/graph")
async def get_graph():
    """
    Return the full dependency graph as nodes and edges.

    Designed to be consumed directly by React Flow on the frontend.
    """
    nodes = graph_client.get_all_nodes()
    edges = graph_client.get_all_edges()

    # Transform to React Flow compatible format
    rf_nodes = []
    for i, node in enumerate(nodes):
        rf_nodes.append({
            "id": node.id,
            "position": {"x": (i % 5) * 250, "y": (i // 5) * 150},
            "data": {
                "label": node.label,
                "type": node.node_type.value,
                "file_name": node.file_name,
                **node.metadata,
            },
        })

    rf_edges = []
    for i, edge in enumerate(edges):
        rf_edges.append({
            "id": f"e-{i}",
            "source": edge.source,
            "target": edge.target,
            "data": {"type": edge.edge_type.value},
            "label": edge.edge_type.value,
        })

    return {"nodes": rf_nodes, "edges": rf_edges}


@app.get("/graph/file/{file_name:path}")
async def get_file_graph(file_name: str):
    """Get graph relationships for a specific file."""
    dependents = graph_client.get_dependents(file_name)
    dependencies = graph_client.get_dependencies(file_name)

    return {
        "file_name": file_name,
        "depended_on_by": dependents,
        "depends_on": dependencies,
    }


@app.get("/versions/{file_name:path}")
async def get_versions(file_name: str, project_id: str = "default"):
    """Get version history for a file."""
    history = version_store.get_version_history(project_id, file_name)
    if not history:
        raise HTTPException(status_code=404, detail=f"No versions found for {file_name}")
    return {
        "file_name": file_name,
        "versions": [v.model_dump() for v in history],
    }


@app.get("/versions/{file_name:path}/{version}")
async def get_version(file_name: str, version: int, project_id: str = "default"):
    """Get a specific version of a file."""
    meta = version_store.get_version(project_id, file_name, version)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Version {version} not found for {file_name}")
    code = version_store.get_code(project_id, file_name, version)
    return {
        "metadata": meta.model_dump(),
        "code": code,
    }


@app.get("/files")
async def list_files(project_id: str = "default"):
    """List all tracked files for a project."""
    files = version_store.list_files(project_id)
    return {"project_id": project_id, "files": files}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ml-architecture-engine",
        "version": "0.1.0",
    }


@app.get("/stats")
async def get_stats():
    """Return service statistics."""
    return {
        "graph": graph_client.get_graph_summary(),
        "vector": vector_client.get_stats(),
        "supported_languages": ["python", "javascript", "typescript", "c", "cpp", "java"],
    }


# ══════════════════════════════════════════════════
# Run with: python main.py
# ══════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info",
    )
