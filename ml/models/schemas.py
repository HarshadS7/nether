"""
Pydantic models defining the data contracts for the entire ML pipeline.

These schemas are the single source of truth for data flowing through:
  Push input → Parser → Versioning → Graph → Vector → Context → LLM → Output
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════
# 1. Push Input
# ═══════════════════════════════════════════════════════════════════

class PushType(str, Enum):
    NEW = "new"
    UPDATE = "update"


class PushRequest(BaseModel):
    """Incoming push event from the frontend / CI pipeline."""
    file_name: str = Field(..., description="Name of the file being pushed, e.g. 'app.cpp'")
    code: str = Field(..., description="Full source code content of the file")
    push_type: PushType = Field(..., description="'new' for first push, 'update' for subsequent")
    project_id: str = Field(default="default", description="Project identifier for multi-project support")

class ChatRequest(BaseModel):
    """Chat query from user."""
    question: str = Field(..., description="Natural language question from the user")
    project_id: str = Field(default="default", description="Project identifier")

class ChatResponse(BaseModel):
    """Answer from the AI."""
    answer: str
    sources: list[dict] = Field(default_factory=list, description="Vector/Graph sources used")


# ═══════════════════════════════════════════════════════════════════
# 2. Parser Output
# ═══════════════════════════════════════════════════════════════════

class FunctionInfo(BaseModel):
    """A parsed function/method."""
    name: str
    parameters: list[str] = Field(default_factory=list)
    return_type: Optional[str] = None
    start_line: int = 0
    end_line: int = 0
    body_hash: str = ""  # Hash of function body for change detection


class ClassInfo(BaseModel):
    """A parsed class."""
    name: str
    methods: list[str] = Field(default_factory=list)
    bases: list[str] = Field(default_factory=list)  # Parent classes
    start_line: int = 0
    end_line: int = 0


class ApiEndpoint(BaseModel):
    """A detected API endpoint (Express, FastAPI, Spring, etc.)."""
    method: str = Field(..., description="HTTP method: GET, POST, PUT, DELETE, PATCH")
    path: str = Field(..., description="Route path, e.g. '/payments'")
    handler: str = Field(default="", description="Function that handles this route")


class CallerCallee(BaseModel):
    """A caller → callee relationship within or across files."""
    caller: str = Field(..., description="Function/method making the call")
    callee: str = Field(..., description="Function/method being called")


class ParseResult(BaseModel):
    """Deterministic structural extraction from source code."""
    file_name: str
    language: str
    functions: list[FunctionInfo] = Field(default_factory=list)
    classes: list[ClassInfo] = Field(default_factory=list)
    calls: list[str] = Field(default_factory=list, description="Function/method calls made in this file")
    imports: list[str] = Field(default_factory=list, description="Imported modules/files")
    global_variables: list[str] = Field(default_factory=list)
    api_endpoints: list[ApiEndpoint] = Field(default_factory=list, description="Detected HTTP API endpoints")
    caller_callee_pairs: list[CallerCallee] = Field(default_factory=list, description="Caller→callee relationships")


# ═══════════════════════════════════════════════════════════════════
# 3. Versioning
# ═══════════════════════════════════════════════════════════════════

class VersionMetadata(BaseModel):
    """Metadata for a stored file version."""
    file_name: str
    version: int
    timestamp: str
    code_hash: str
    parse_result: ParseResult


class DiffResult(BaseModel):
    """Structural diff between two versions of a file."""
    file_name: str
    old_version: int
    new_version: int
    added_functions: list[str] = Field(default_factory=list)
    removed_functions: list[str] = Field(default_factory=list)
    modified_functions: list[str] = Field(default_factory=list)
    added_classes: list[str] = Field(default_factory=list)
    removed_classes: list[str] = Field(default_factory=list)
    added_imports: list[str] = Field(default_factory=list)
    removed_imports: list[str] = Field(default_factory=list)
    added_calls: list[str] = Field(default_factory=list)
    removed_calls: list[str] = Field(default_factory=list)
    has_changes: bool = True


# ═══════════════════════════════════════════════════════════════════
# 4. Graph
# ═══════════════════════════════════════════════════════════════════

class GraphNodeType(str, Enum):
    FILE = "File"
    FUNCTION = "Function"
    CLASS = "Class"
    MODULE = "Module"


class GraphEdgeType(str, Enum):
    DEFINES = "DEFINES"
    CALLS = "CALLS"
    IMPORTS = "IMPORTS"
    INHERITS = "INHERITS"
    CONTAINS = "CONTAINS"  # class contains method


class GraphNode(BaseModel):
    """A node in the dependency graph."""
    id: str
    label: str
    node_type: GraphNodeType
    file_name: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """An edge in the dependency graph."""
    source: str
    target: str
    edge_type: GraphEdgeType
    metadata: dict = Field(default_factory=dict)


class GraphUpdate(BaseModel):
    """A batch of graph operations for a single file push."""
    file_name: str
    nodes_to_add: list[GraphNode] = Field(default_factory=list)
    edges_to_add: list[GraphEdge] = Field(default_factory=list)
    nodes_to_remove: list[str] = Field(default_factory=list, description="Node IDs to remove")


# ═══════════════════════════════════════════════════════════════════
# 5. Context (LLM Input)
# ═══════════════════════════════════════════════════════════════════

class StructuredContext(BaseModel):
    """The carefully constructed context sent to the LLM."""
    file_name: str
    language: str
    push_type: PushType
    code_snippet: str = Field(default="", description="Truncated code for context, not full file")

    # Structural info
    functions: list[str] = Field(default_factory=list)
    classes: list[str] = Field(default_factory=list)
    imports: list[str] = Field(default_factory=list)
    calls: list[str] = Field(default_factory=list)

    # Graph relationships
    depended_on_by: list[str] = Field(default_factory=list, description="Files that depend on this file")
    depends_on: list[str] = Field(default_factory=list, description="Files this file depends on")

    # Diff (for updates)
    diff: Optional[DiffResult] = None

    # Semantic retrieval
    related_files: list[str] = Field(default_factory=list, description="Semantically similar files from vector DB")
    related_snippets: list[str] = Field(default_factory=list, description="Related code snippets from vector DB")


# ═══════════════════════════════════════════════════════════════════
# 6. Reasoning Output (LLM Response)
# ═══════════════════════════════════════════════════════════════════

class ReasoningOutput(BaseModel):
    """Structured LLM output — documentation, explanation, suggestions."""
    documentation: str = Field(..., description="What this file does, its purpose and architecture role")
    change_explanation: str = Field(
        default="",
        description="Explanation of what changed and why it matters (empty for new files)"
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Actionable improvement suggestions"
    )
    impact_analysis: str = Field(
        default="",
        description="Potential impact on dependent files/systems"
    )
    risk_level: str = Field(
        default="low",
        description="Risk assessment: low / medium / high"
    )


# ═══════════════════════════════════════════════════════════════════
# 7. Final Push Response (API Output)
# ═══════════════════════════════════════════════════════════════════

class PushResponse(BaseModel):
    """Complete response returned to the frontend after processing a push."""
    file_name: str
    push_type: PushType
    version: int
    parse_result: ParseResult
    diff: Optional[DiffResult] = None
    reasoning: ReasoningOutput
    graph_update_summary: dict = Field(default_factory=dict)
    status: str = "success"
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
# 8. Ingest API (richer input/output format)
# ═══════════════════════════════════════════════════════════════════

class IngestRequest(BaseModel):
    """POST /ingest — richer input format with service context."""
    language: str = Field(..., description="Language of the file: javascript, python, cpp, java")
    file_path: str = Field(..., description="Full path within the repo, e.g. 'services/payment/controller.js'")
    service: str = Field(default="", description="Microservice this file belongs to")
    code: str = Field(..., description="Full updated file contents")
    project_id: str = Field(default="default", description="Project identifier")


class SymbolInfo(BaseModel):
    """A symbol (function/class) in vector DB format."""
    type: str = Field(..., description="'function' or 'class'")
    name: str
    line_start: int = 0
    line_end: int = 0


class VectorDocument(BaseModel):
    """The rich vector DB document format for a file."""
    file: str
    language: str
    service: str = ""
    symbols: list[SymbolInfo] = Field(default_factory=list)
    imports: list[str] = Field(default_factory=list)
    api_endpoints: list[ApiEndpoint] = Field(default_factory=list)
    calls: list[CallerCallee] = Field(default_factory=list)


class IngestResponse(BaseModel):
    """Response from POST /ingest."""
    status: str = "success"
    file_path: str
    service: str = ""
    version: int
    vector_document: VectorDocument
    graph_update_summary: dict = Field(default_factory=dict)
    reasoning: ReasoningOutput
    diff: Optional[DiffResult] = None
    error: Optional[str] = None
