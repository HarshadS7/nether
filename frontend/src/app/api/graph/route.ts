import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";

// Color mapping for node types
const NODE_COLORS: Record<string, string> = {
    SERVICE: "#C4F3C4",
    API: "#a78bfa",
    DATABASE: "#10b981",
    FUNCTION: "#60a5fa",
    FILE: "#94a3b8",
    INCIDENT: "#ef4444",
    ADR: "#f59e0b",
    ENDPOINT: "#8b5cf6",
    CLASS: "#06b6d4",
    DEFAULT: "#6b7280"
};

// Edge style mapping
const EDGE_STYLES: Record<string, { color: string; animated: boolean; dashed: boolean }> = {
    calls: { color: "#60a5fa", animated: true, dashed: false },
    imports: { color: "#a78bfa", animated: false, dashed: false },
    depends_on: { color: "#f59e0b", animated: false, dashed: true },
    writes_to: { color: "#10b981", animated: true, dashed: false },
    reads_from: { color: "#06b6d4", animated: false, dashed: false },
    affects: { color: "#ef4444", animated: true, dashed: false },
    governs: { color: "#f59e0b", animated: false, dashed: true },
    contains: { color: "#94a3b8", animated: false, dashed: false },
    exposes: { color: "#8b5cf6", animated: false, dashed: false },
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const workspace = searchParams.get("workspace");

    try {
        // Try to fetch from backend architecture service
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (workspace) params.set("workspace", workspace);

        const res = await fetch(`${API_BASE}/architecture/graph?${params.toString()}`, {
            headers: { "Content-Type": "application/json" },
            cache: "no-store"
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success && data.graph) {
                // Transform backend graph to ReactFlow format
                const nodes = data.graph.nodes.map((n: any, index: number) => {
                    const row = Math.floor(index / 4);
                    const col = index % 4;
                    return {
                        id: n.id,
                        position: n.position || { x: 100 + col * 250, y: 100 + row * 180 },
                        data: {
                            label: n.label || n.data?.name || n.id,
                            type: n.type,
                            owner: n.data?.owner,
                            risk: n.data?.risk || "low",
                            description: n.data?.description,
                            language: n.data?.language,
                            path: n.data?.path,
                            status: n.data?.status,
                            color: NODE_COLORS[n.type?.toUpperCase()] || NODE_COLORS.DEFAULT,
                            ...n.data
                        }
                    };
                });

                const edges = data.graph.edges.map((e: any) => {
                    const edgeType = e.data?.type || e.type || "depends_on";
                    const style = EDGE_STYLES[edgeType] || EDGE_STYLES.depends_on;
                    return {
                        id: e.id,
                        source: e.source,
                        target: e.target,
                        animated: style.animated,
                        style: {
                            stroke: style.color,
                            strokeWidth: 2,
                            strokeDasharray: style.dashed ? "5,5" : undefined
                        },
                        data: { type: edgeType, label: e.data?.label }
                    };
                });

                return NextResponse.json({
                    nodes,
                    edges,
                    metadata: data.graph.metadata
                });
            }
        }
    } catch (error) {
        console.warn("Failed to fetch from backend, using fallback data:", error);
    }

    // Fallback mock data if backend is unavailable
    return NextResponse.json(getFallbackGraphData());
}

function getFallbackGraphData() {
    const nodes = [
        {
            id: "ingest-service",
            position: { x: 250, y: 100 },
            data: {
                label: "Ingestion Service",
                type: "SERVICE",
                owner: "team-platform",
                risk: "low",
                description: "Standard data ingestion worker.",
                color: NODE_COLORS.SERVICE
            },
        },
        {
            id: "graph-api",
            position: { x: 250, y: 250 },
            data: {
                label: "Graph API",
                type: "API",
                owner: "team-graph",
                risk: "low",
                description: "Primary interface for querying the knowledge graph.",
                color: NODE_COLORS.API
            },
        },
        {
            id: "neo4j-db",
            position: { x: 250, y: 400 },
            data: {
                label: "Knowledge Graph DB",
                type: "DATABASE",
                owner: "team-data",
                risk: "low",
                description: "Core Neo4j cluster for storing architectural relationships.",
                color: NODE_COLORS.DATABASE
            },
        },
        {
            id: "auth-service",
            position: { x: 50, y: 250 },
            data: {
                label: "Auth Service",
                type: "SERVICE",
                owner: "team-security",
                risk: "high",
                description: "Handles JWT validation and API token generation.",
                color: NODE_COLORS.SERVICE
            },
        },
        {
            id: "chroma-db",
            position: { x: 450, y: 400 },
            data: {
                label: "Vector Store",
                type: "DATABASE",
                owner: "team-ml",
                risk: "medium",
                description: "ChromaDB for semantic code search and embeddings.",
                color: NODE_COLORS.DATABASE
            },
        },
        {
            id: "llm-service",
            position: { x: 450, y: 250 },
            data: {
                label: "LLM Service",
                type: "SERVICE",
                owner: "team-ml",
                risk: "medium",
                description: "Gemini integration for code analysis and documentation.",
                color: NODE_COLORS.SERVICE
            },
        },
        {
            id: "pipeline-service",
            position: { x: 650, y: 100 },
            data: {
                label: "Pipeline Service",
                type: "SERVICE",
                owner: "team-platform",
                risk: "low",
                description: "Orchestrates code parsing, graph building, and vector indexing.",
                color: NODE_COLORS.SERVICE
            },
        },
        {
            id: "github-service",
            position: { x: 50, y: 100 },
            data: {
                label: "GitHub Integration",
                type: "SERVICE",
                owner: "team-platform",
                risk: "medium",
                description: "OAuth and commit monitoring for repositories.",
                color: NODE_COLORS.SERVICE
            },
        },
        {
            id: "incident-142",
            position: { x: 650, y: 250 },
            data: {
                label: "INC-142: Graph latency spike",
                type: "INCIDENT",
                risk: "high",
                description: "High CPU utilization caused by unindexed recursive queries.",
                color: NODE_COLORS.INCIDENT
            },
        },
        {
            id: "adr-001",
            position: { x: 650, y: 400 },
            data: {
                label: "ADR-001: React Flow for graphs",
                type: "ADR",
                owner: "team-frontend",
                risk: "low",
                description: "Decision to use React Flow for all dynamic interactive graphs.",
                color: NODE_COLORS.ADR
            },
        },
    ];

    const edges = [
        { id: "e1", source: "ingest-service", target: "graph-api", data: { type: "calls" } },
        { id: "e2", source: "graph-api", target: "neo4j-db", data: { type: "writes_to" } },
        { id: "e3", source: "graph-api", target: "auth-service", data: { type: "depends_on" } },
        { id: "e4", source: "incident-142", target: "graph-api", data: { type: "affects" } },
        { id: "e5", source: "adr-001", target: "graph-api", data: { type: "governs" } },
        { id: "e6", source: "llm-service", target: "chroma-db", data: { type: "reads_from" } },
        { id: "e7", source: "pipeline-service", target: "neo4j-db", data: { type: "writes_to" } },
        { id: "e8", source: "pipeline-service", target: "chroma-db", data: { type: "writes_to" } },
        { id: "e9", source: "pipeline-service", target: "llm-service", data: { type: "calls" } },
        { id: "e10", source: "github-service", target: "ingest-service", data: { type: "calls" } },
        { id: "e11", source: "github-service", target: "auth-service", data: { type: "depends_on" } },
        { id: "e12", source: "ingest-service", target: "pipeline-service", data: { type: "calls" } },
    ].map(e => {
        const edgeType = e.data?.type || "depends_on";
        const style = EDGE_STYLES[edgeType] || EDGE_STYLES.depends_on;
        return {
            ...e,
            animated: style.animated,
            style: {
                stroke: style.color,
                strokeWidth: 2,
                strokeDasharray: style.dashed ? "5,5" : undefined
            }
        };
    });

    return { nodes, edges, metadata: { source: "fallback", lastBuilt: new Date().toISOString() } };
}
