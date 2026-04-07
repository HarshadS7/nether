"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hammer, Download, CheckCircle2, FileJson } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function BlueprintsPage() {
    const adrs = [
        { id: "ADR-001", title: "Move to React Flow for interactive graphs", date: "2023-11-04", status: "Accepted", tags: ["Frontend", "UX"] },
        { id: "ADR-002", title: "Use Neo4j as primary Knowledge Graph store", date: "2023-10-12", status: "Accepted", tags: ["Database", "Backend"] },
        { id: "ADR-003", title: "Event-driven ingestion via Kafka", date: "2023-09-28", status: "Proposed", tags: ["Infrastructure", "Data"] },
    ];

    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Architecture Blueprints</h1>
                    <p className="text-muted-foreground mt-1">Review system architecture decisions and auto-generate scaffolding.</p>
                </div>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Hammer className="w-4 h-4 mr-2" />
                    Scaffold Infrastructure
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-3 mb-6">
                <Card className="bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Current Stack</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Frontend</span>
                            <span className="font-semibold text-foreground">Next.js + React Flow</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Backend API</span>
                            <span className="font-semibold text-foreground">Go Fiber</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Database</span>
                            <span className="font-semibold text-foreground">Neo4j Cluster</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Messaging</span>
                            <span className="font-semibold text-foreground">Kafka</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card md:col-span-2 border border-[#C4F3C4]/20 shadow-[0_0_15px_rgba(196,243,196,0.07)]">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center">
                            <FileJson className="w-4 h-4 mr-2 text-primary" />
                            Latest Decision Rationale
                        </CardTitle>
                        <CardDescription className="text-xs">ADR-001 extracted from graph context</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-muted p-4 rounded-lg font-mono text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {`Context:
Standard charting libraries lack the interactivity needed to explore deep architectural relations.

Decision:
We will use React Flow for all dynamic graph visualizations across the Engineering Brain platform. It provides sufficient customizability for custom node types (Service, DB, etc.) and integrates cleanly with our React-based frontend.

Trade-offs:
- PRO: High interactivity, React-native architecture.
- CON: Larger bundle size compared to D3 or raw Canvas.`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <h2 className="text-xl font-bold mb-4 tracking-tight">Recent Architectural Decision Records (ADRs)</h2>
            <Card className="bg-[#FFF2AE]/25 border border-border">
                <ScrollArea className="h-[300px]">
                    <div className="divide-y divide-border">
                        {adrs.map((adr) => (
                            <div key={adr.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-muted/50 transition-colors">
                                <div className="flex flex-col gap-1 mb-2 sm:mb-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{adr.id}</span>
                                        <span className="font-semibold">{adr.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {adr.tags.map((tag) => (
                                            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                                        ))}
                                        <span className="text-xs text-muted-foreground ml-2">{adr.date}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-xs font-medium">
                                        {adr.status === "Accepted" ? (
                                            <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Accepted</span>
                                        ) : (
                                            <span className="text-yellow-500">Proposed</span>
                                        )}
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8">
                                        <Download className="w-4 h-4 mr-2" />
                                        Export
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </Card>
        </div>
    );
}
