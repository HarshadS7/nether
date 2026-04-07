import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { query } = await req.json();

    // Mock response delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // A basic mock response that matches a likely user question about the architecture
    let text = "I found several components related to your query. The core ingestion flow starts at the `Ingestion Service` which calls the `Graph API`.";
    let citations = [
        { text: "Ingestion Service", nodeId: "ingest-service", type: "Service" },
        { text: "Graph API", nodeId: "graph-api", type: "API" }
    ];
    let artifacts = [
        { title: "ingestion/worker.ts", type: "file", snippet: "export class IngestionWorker {...}" },
        { title: "ADR-001", type: "doc", snippet: "Decision: Use React Flow for graph visualization." }
    ];

    if (query && query.toLowerCase().includes("auth")) {
        text = "The authentication service handles JWT validation. It is a high-risk service currently experiencing latency issues due to INC-142.";
        citations = [
            { text: "Auth Service", nodeId: "auth-service", type: "Service" },
            { text: "INC-142", nodeId: "incident-142", type: "Incident" }
        ];
        artifacts = [
            { title: "auth/jwt.ts", type: "file", snippet: "function validateToken(token: string) {...}" }
        ];
    }

    return NextResponse.json({
        id: "msg-" + Math.random().toString(36).substr(2, 9),
        role: "assistant",
        content: text,
        citations,
        artifacts
    });

}
