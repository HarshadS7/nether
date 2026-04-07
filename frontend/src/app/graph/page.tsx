"use client";

import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider } from "reactflow";
import { ArchitectureGraph } from "@/components/graph/ArchitectureGraph";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
    Server, 
    Database, 
    AlertTriangle, 
    FileText, 
    Code, 
    Plug, 
    Boxes, 
    ArrowRight, 
    ArrowLeft,
    Loader2,
    ExternalLink,
    GitBranch
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";

interface NodeData {
    label: string;
    type: string;
    description?: string;
    language?: string;
    filePath?: string;
    metrics?: Record<string, number | string>;
}

interface NodeDetails {
    id: string;
    data: NodeData;
    connections?: {
        incoming: Array<{ id: string; label: string; type: string; relationshipType?: string }>;
        outgoing: Array<{ id: string; label: string; type: string; relationshipType?: string }>;
    };
}

const typeConfig: Record<string, { icon: any; color: string; bgColor: string; border: string }> = {
    SERVICE: { icon: Server, color: "text-green-700", bgColor: "bg-green-50", border: "border-green-200" },
    DATABASE: { icon: Database, color: "text-emerald-700", bgColor: "bg-emerald-50", border: "border-emerald-200" },
    API: { icon: Plug, color: "text-violet-700", bgColor: "bg-violet-50", border: "border-violet-200" },
    INCIDENT: { icon: AlertTriangle, color: "text-red-700", bgColor: "bg-red-50", border: "border-red-200" },
    ADR: { icon: FileText, color: "text-amber-700", bgColor: "bg-amber-50", border: "border-amber-200" },
    FUNCTION: { icon: Code, color: "text-blue-700", bgColor: "bg-blue-50", border: "border-blue-200" },
    CLASS: { icon: Boxes, color: "text-cyan-700", bgColor: "bg-cyan-50", border: "border-cyan-200" },
    ENDPOINT: { icon: Plug, color: "text-purple-700", bgColor: "bg-purple-50", border: "border-purple-200" },
    FILE: { icon: FileText, color: "text-slate-700", bgColor: "bg-slate-50", border: "border-slate-200" },
};

export default function GraphPage() {
    const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const handleNodeClick = useCallback(async (nodeId: string | null, nodeData?: NodeData) => {
        if (!nodeId) {
            setSelectedNode(null);
            return;
        }

        // Set basic info immediately
        setSelectedNode({
            id: nodeId,
            data: nodeData || { label: nodeId, type: "UNKNOWN" },
        });

        // Fetch additional details from backend
        setLoadingDetails(true);
        try {
            const res = await fetch(`${API_BASE}/architecture/node/${nodeId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.node) {
                    setSelectedNode(prev => prev ? {
                        ...prev,
                        data: { ...prev.data, ...data.node },
                        connections: data.connections,
                    } : null);
                }
            }
        } catch (error) {
            console.error("Failed to fetch node details:", error);
        } finally {
            setLoadingDetails(false);
        }
    }, []);

    const nodeType = selectedNode?.data?.type?.toUpperCase() || "SERVICE";
    const config = typeConfig[nodeType] || typeConfig.SERVICE;
    const TypeIcon = config.icon;

    return (
        <div className="flex h-full w-full">
            {/* Main Canvas */}
            <div className="flex-1 flex flex-col p-6 rounded-l-2xl border-r border-border">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Architecture Graph</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Interactive knowledge graph of your codebase
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant="outline" className="bg-[#C4F3C4]/30 text-[#38a838] border-[#C4F3C4]">Services</Badge>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Databases</Badge>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">APIs</Badge>
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Incidents</Badge>
                    </div>
                </div>
                <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden relative">
                    <ReactFlowProvider>
                        <ArchitectureGraph onNodeClick={handleNodeClick} />
                    </ReactFlowProvider>
                </div>
            </div>

            {/* Detail Sidebar */}
            <div className="w-96 bg-sidebar border-l border-border p-6 overflow-y-auto">
                {selectedNode ? (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-lg ${config.bgColor} ${config.border} border`}>
                                <TypeIcon className={`h-5 w-5 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-bold break-words leading-tight">
                                    {selectedNode.data.label}
                                </h2>
                                <Badge variant="outline" className={`mt-1.5 ${config.bgColor} ${config.color} ${config.border}`}>
                                    {selectedNode.data.type}
                                </Badge>
                            </div>
                        </div>

                        {/* Description */}
                        {selectedNode.data.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {selectedNode.data.description}
                            </p>
                        )}

                        <Separator />

                        {/* Metadata */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Properties
                            </h3>
                            <div className="space-y-2 text-sm">
                                {selectedNode.data.language && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Language</span>
                                        <Badge variant="secondary" className="font-mono text-xs">
                                            {selectedNode.data.language}
                                        </Badge>
                                    </div>
                                )}
                                {selectedNode.data.filePath && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">File</span>
                                        <span className="font-mono text-xs truncate max-w-[180px]" title={selectedNode.data.filePath}>
                                            {selectedNode.data.filePath.split('/').pop()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Node ID</span>
                                    <span className="font-mono text-xs truncate max-w-[150px]" title={selectedNode.id}>
                                        {selectedNode.id.substring(0, 20)}...
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Connections */}
                        {loadingDetails ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : selectedNode.connections && (
                            <div className="space-y-4">
                                <Separator />
                                
                                {/* Incoming */}
                                {selectedNode.connections.incoming?.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <ArrowLeft className="h-3 w-3" />
                                            Incoming ({selectedNode.connections.incoming.length})
                                        </h3>
                                        <div className="space-y-1.5">
                                            {selectedNode.connections.incoming.slice(0, 5).map((conn) => (
                                                <ConnectionItem key={conn.id} connection={conn} />
                                            ))}
                                            {selectedNode.connections.incoming.length > 5 && (
                                                <span className="text-xs text-muted-foreground">
                                                    +{selectedNode.connections.incoming.length - 5} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Outgoing */}
                                {selectedNode.connections.outgoing?.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <ArrowRight className="h-3 w-3" />
                                            Outgoing ({selectedNode.connections.outgoing.length})
                                        </h3>
                                        <div className="space-y-1.5">
                                            {selectedNode.connections.outgoing.slice(0, 5).map((conn) => (
                                                <ConnectionItem key={conn.id} connection={conn} />
                                            ))}
                                            {selectedNode.connections.outgoing.length > 5 && (
                                                <span className="text-xs text-muted-foreground">
                                                    +{selectedNode.connections.outgoing.length - 5} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <Separator />

                        {/* Actions */}
                        <Card className="bg-card/50 border-dashed">
                            <CardHeader className="pb-2 pt-3">
                                <CardTitle className="text-sm text-primary flex items-center gap-1.5">
                                    <GitBranch className="h-3.5 w-3.5" />
                                    Quick Actions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-3 space-y-2">
                                <a 
                                    href={`/chat?context=${encodeURIComponent(selectedNode.data.label)}`} 
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Ask about this in Chat
                                </a>
                                <a 
                                    href={`/impact?node=${encodeURIComponent(selectedNode.id)}`} 
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Analyze Impact
                                </a>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground px-4">
                        <div className="p-4 rounded-full bg-muted/50 mb-4">
                            <Server className="h-6 w-6" />
                        </div>
                        <p className="font-medium">No node selected</p>
                        <p className="text-sm mt-1">
                            Click on a node to view its details and connections.
                            Double-click to expand.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ConnectionItem({ connection }: { connection: { id: string; label: string; type: string; relationshipType?: string } }) {
    const config = typeConfig[connection.type?.toUpperCase()] || typeConfig.SERVICE;
    const TypeIcon = config.icon;

    return (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
            <TypeIcon className={`h-3.5 w-3.5 ${config.color}`} />
            <span className="text-sm truncate flex-1">{connection.label}</span>
            {connection.relationshipType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {connection.relationshipType}
                </Badge>
            )}
        </div>
    );
}
