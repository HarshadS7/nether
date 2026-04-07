"use client";

import { useCallback, useState, useEffect } from "react";
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Panel,
    MarkerType,
    Node,
    Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArchitectureNode } from "./ArchitectureNode";
import { Search, RefreshCw, ZoomIn, Filter, Loader2 } from "lucide-react";

const nodeTypes = {
    architectureFunc: ArchitectureNode,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";

interface GraphProps {
    onNodeClick?: (nodeId: string | null, nodeData?: any) => void;
}

// Node type colors for minimap
const nodeTypeColors: Record<string, string> = {
    SERVICE: "#C4F3C4",
    DATABASE: "#10b981",
    API: "#a78bfa",
    INCIDENT: "#ef4444",
    ADR: "#f59e0b",
    FUNCTION: "#60a5fa",
    FILE: "#94a3b8",
    CLASS: "#06b6d4",
    ENDPOINT: "#8b5cf6",
};

export function ArchitectureGraph({ onNodeClick }: GraphProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // Fetch graph data
    const fetchGraphData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterType) params.set("type", filterType);

            const res = await fetch(`/api/graph?${params.toString()}`);
            const data = await res.json();

            // Transform backend nodes to ReactFlow nodes
            const rfNodes: Node[] = data.nodes.map((n: any) => ({
                ...n,
                type: "architectureFunc",
            }));

            // Transform backend edges to ReactFlow edges with proper styling
            const rfEdges: Edge[] = data.edges.map((e: any) => ({
                ...e,
                markerEnd: { type: MarkerType.ArrowClosed, color: e.style?.stroke || "hsl(var(--muted-foreground))" },
            }));

            setNodes(rfNodes);
            setEdges(rfEdges);
        } catch (error) {
            console.error("Failed to fetch graph data", error);
        } finally {
            setLoading(false);
        }
    }, [setNodes, setEdges, filterType]);

    useEffect(() => {
        fetchGraphData();
    }, [fetchGraphData]);

    // Expand node to show its connections
    const handleExpandNode = useCallback(async (nodeId: string) => {
        if (expandedNodes.has(nodeId)) return;

        try {
            const res = await fetch(`${API_BASE}/architecture/node/${nodeId}/expand`);
            const data = await res.json();

            if (data.success && data.expansion) {
                const { children, dependencies, dependents } = data.expansion;
                const parentNode = nodes.find(n => n.id === nodeId);
                if (!parentNode) return;

                const newNodes: Node[] = [];
                const newEdges: Edge[] = [];
                let yOffset = 0;

                // Add child nodes
                children?.forEach((child: any, i: number) => {
                    if (!nodes.find(n => n.id === child.id)) {
                        newNodes.push({
                            id: child.id,
                            position: { x: parentNode.position.x + 250, y: parentNode.position.y + (i * 80) },
                            type: "architectureFunc",
                            data: {
                                label: child.label || child.name,
                                type: child.type,
                                ...child.data
                            }
                        });
                        newEdges.push({
                            id: `${nodeId}->${child.id}`,
                            source: nodeId,
                            target: child.id,
                            animated: true,
                            style: { stroke: "#60a5fa", strokeWidth: 2 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: "#60a5fa" }
                        });
                    }
                });

                // Add dependency nodes
                dependencies?.forEach((dep: any, i: number) => {
                    if (!nodes.find(n => n.id === dep.id)) {
                        newNodes.push({
                            id: dep.id,
                            position: { x: parentNode.position.x - 250, y: parentNode.position.y + (i * 80) },
                            type: "architectureFunc",
                            data: {
                                label: dep.label || dep.name,
                                type: dep.type,
                                ...dep.data
                            }
                        });
                    }
                    if (!edges.find(e => e.id === `${nodeId}->${dep.id}`)) {
                        newEdges.push({
                            id: `${nodeId}->${dep.id}`,
                            source: nodeId,
                            target: dep.id,
                            style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
                            markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" }
                        });
                    }
                });

                if (newNodes.length > 0 || newEdges.length > 0) {
                    setNodes(nds => [...nds, ...newNodes]);
                    setEdges(eds => [...eds, ...newEdges]);
                    setExpandedNodes(prev => new Set([...prev, nodeId]));
                }
            }
        } catch (error) {
            console.error("Failed to expand node:", error);
        }
    }, [nodes, edges, expandedNodes, setNodes, setEdges]);

    const onNodeClickInternal = useCallback(
        (_: React.MouseEvent, node: Node) => {
            if (onNodeClick) {
                onNodeClick(node.id, node.data);
            }
        },
        [onNodeClick]
    );

    const onNodeDoubleClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            handleExpandNode(node.id);
        },
        [handleExpandNode]
    );

    const onPaneClick = useCallback(() => {
        if (onNodeClick) {
            onNodeClick(null);
        }
    }, [onNodeClick]);

    // Filter nodes based on search
    const filteredNodes = searchQuery
        ? nodes.filter(n => {
            const label = (n.data?.label || "").toLowerCase();
            const type = (n.data?.type || "").toLowerCase();
            const query = searchQuery.toLowerCase();
            return label.includes(query) || type.includes(query);
        })
        : nodes;

    // Filter edges to only show those connecting visible nodes
    const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e =>
        visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center flex-col gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading architecture graph...</span>
            </div>
        );
    }

    return (
        <ReactFlow
            nodes={filteredNodes}
            edges={filteredEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClickInternal}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-background/50"
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2}
        >
            <Background color="var(--border)" gap={24} size={1} />
            <Controls className="fill-foreground !bg-card border-border" />
            <MiniMap
                nodeColor={(n) => nodeTypeColors[n.data?.type?.toUpperCase()] || "#6b7280"}
                maskColor="hsl(var(--background) / 0.6)"
                className="!bg-card border border-border rounded-lg shadow-lg"
            /> 

            {/* Search & Filter Panel */}
            <Panel position="top-left" className="bg-card p-3 rounded-lg border border-border shadow-md space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search nodes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <button
                        onClick={fetchGraphData}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title="Refresh graph"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>

                <div className="flex flex-wrap gap-1">
                    <FilterButton
                        label="All"
                        active={filterType === null}
                        onClick={() => setFilterType(null)}
                    />
                    <FilterButton
                        label="Services"
                        active={filterType === "SERVICE"}
                        onClick={() => setFilterType("SERVICE")}
                        color="#C4F3C4"
                    />
                    <FilterButton
                        label="APIs"
                        active={filterType === "API"}
                        onClick={() => setFilterType("API")}
                        color="#a78bfa"
                    />
                    <FilterButton
                        label="DBs"
                        active={filterType === "DATABASE"}
                        onClick={() => setFilterType("DATABASE")}
                        color="#10b981"
                    />
                </div>
            </Panel>

            {/* Legend Panel */}
            <Panel position="bottom-left" className="bg-card p-3 rounded-lg border border-border text-xs shadow-md">
                <h3 className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Legend</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <LegendItem color="#C4F3C4" label="Service" />
                    <LegendItem color="#a78bfa" label="API" />
                    <LegendItem color="#10b981" label="Database" />
                    <LegendItem color="#60a5fa" label="Function" />
                    <LegendItem color="#8b5cf6" label="Endpoint" />
                    <LegendItem color="#ef4444" label="Incident" />
                    <LegendItem color="#f59e0b" label="ADR" />
                    <LegendItem color="#06b6d4" label="Class" />
                </div>
                <div className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground">
                    <p>💡 Double-click a node to expand</p>
                </div>
            </Panel>

            {/* Stats Panel */}
            <Panel position="top-right" className="bg-card px-3 py-2 rounded-lg border border-border text-xs shadow-md">
                <div className="flex items-center gap-4">
                    <span><strong>{filteredNodes.length}</strong> nodes</span>
                    <span><strong>{filteredEdges.length}</strong> edges</span>
                </div>
            </Panel>
        </ReactFlow>
    );
}

function FilterButton({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
            }`}
        >
            {color && <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: color }} />}
            {label}
        </button>
    );
}

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
            <span>{label}</span>
        </div>
    );
}
