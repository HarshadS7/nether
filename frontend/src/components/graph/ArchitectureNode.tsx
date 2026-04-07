"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Server, Database, Activity, FileJson, AlertTriangle, Code, FileCode, Boxes, Plug, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export type ArchitectureNodeType = "SERVICE" | "DATABASE" | "API" | "ADR" | "INCIDENT" | "FUNCTION" | "FILE" | "CLASS" | "ENDPOINT" | "Service" | "Database" | "API" | "ADR" | "Incident";

interface ArchitectureNodeProps {
    data: {
        label: string;
        type: ArchitectureNodeType;
        owner?: string;
        risk?: "low" | "medium" | "high";
        status?: string;
        description?: string;
        language?: string;
        path?: string;
        color?: string;
    };
    selected?: boolean;
}

const iconMap: Record<string, any> = {
    SERVICE: Server,
    Service: Server,
    DATABASE: Database,
    Database: Database,
    API: Activity,
    Api: Activity,
    ADR: FileJson,
    Adr: FileJson,
    INCIDENT: AlertTriangle,
    Incident: AlertTriangle,
    FUNCTION: Code,
    Function: Code,
    FILE: FileCode,
    File: FileCode,
    CLASS: Boxes,
    Class: Boxes,
    ENDPOINT: Plug,
    Endpoint: Plug,
    FOLDER: Folder,
    Folder: Folder,
};

const colorMap: Record<string, string> = {
    SERVICE: "text-[#38a838] border-[#C4F3C4] bg-[#C4F3C4]/30",
    Service: "text-[#38a838] border-[#C4F3C4] bg-[#C4F3C4]/30",
    DATABASE: "text-emerald-700 border-emerald-300 bg-emerald-50",
    Database: "text-emerald-700 border-emerald-300 bg-emerald-50",
    API: "text-purple-700 border-purple-300 bg-purple-50",
    Api: "text-purple-700 border-purple-300 bg-purple-50",
    ADR: "text-amber-700 border-amber-300 bg-amber-50",
    Adr: "text-amber-700 border-amber-300 bg-amber-50",
    INCIDENT: "text-red-700 border-red-300 bg-red-50",
    Incident: "text-red-700 border-red-300 bg-red-50",
    FUNCTION: "text-blue-700 border-blue-300 bg-blue-50",
    Function: "text-blue-700 border-blue-300 bg-blue-50",
    FILE: "text-slate-700 border-slate-300 bg-slate-50",
    File: "text-slate-700 border-slate-300 bg-slate-50",
    CLASS: "text-cyan-700 border-cyan-300 bg-cyan-50",
    Class: "text-cyan-700 border-cyan-300 bg-cyan-50",
    ENDPOINT: "text-violet-700 border-violet-300 bg-violet-50",
    Endpoint: "text-violet-700 border-violet-300 bg-violet-50",
};

export const ArchitectureNode = memo(({ data, selected }: ArchitectureNodeProps) => {
    const Icon = iconMap[data.type] || Server;
    const colors = colorMap[data.type] || "text-slate-700 border-slate-300 bg-slate-50";
    const isHighRisk = data.risk === "high" || data.type === "INCIDENT" || data.type === "Incident";

    return (
        <div
            className={cn(
                "relative flex min-w-[180px] max-w-[240px] flex-col rounded-lg border-2 p-3 backdrop-blur-md transition-all",
                colors,
                selected ? "ring-2 ring-primary scale-105 z-10 shadow-xl" : "hover:border-primary/50 shadow-lg",
                isHighRisk ? "shadow-[0_0_15px_rgba(255,50,50,0.4)]" : ""
            )}
        >
            <Handle type="target" position={Position.Top} className="!bg-muted-foreground w-2.5 h-2.5 rounded-full border-2 border-background" />
            <Handle type="target" position={Position.Left} className="!bg-muted-foreground w-2.5 h-2.5 rounded-full border-2 border-background" />

            <div className="flex items-center gap-2.5 mb-1">
                <div className="p-1.5 rounded-md bg-background/60 shadow-sm">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
                        {data.type}
                    </span>
                    <span className="text-sm font-bold text-foreground truncate" title={data.label}>
                        {data.label}
                    </span>
                </div>
            </div>

            {(data.owner || data.language) && (
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    {data.owner && <span>@{data.owner}</span>}
                    {data.language && <span className="px-1.5 py-0.5 rounded bg-background/50">{data.language}</span>}
                </div>
            )}

            {data.description && (
                <div className="mt-1.5 text-[10px] text-muted-foreground line-clamp-2">
                    {data.description}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground w-2.5 h-2.5 rounded-full border-2 border-background" />
            <Handle type="source" position={Position.Right} className="!bg-muted-foreground w-2.5 h-2.5 rounded-full border-2 border-background" />
        </div>
    );
});

ArchitectureNode.displayName = "ArchitectureNode";
