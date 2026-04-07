"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, FastForward, GitCommit } from "lucide-react";

export default function TimelinePage() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [timelineIndex, setTimelineIndex] = useState(80);

    const timelineEvents = [
        { date: "Oct 12", label: "Neo4j Integrated" },
        { date: "Oct 28", label: "Auth v2 Deployed" },
        { date: "Nov 04", label: "React Flow ADR" },
        { date: "Today", label: "INC-142 Active" },
    ];

    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">Temporal Architecture Timeline</h1>
                <p className="text-muted-foreground mt-1">Rewind the knowledge graph to investigate past states and failure propagation.</p>
            </div>

            <div className="flex-1 flex flex-col gap-6">
                {/* Graph Preview Area (Placeholder for actual ReactFlow) */}
                <Card className="flex-1 bg-[#FFF2AE]/27 border-border overflow-hidden flex flex-col">
                    <CardHeader className="border-b border-border bg-muted/30 py-3 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <GitCommit className="w-4 h-4 text-primary" />
                                State: {timelineIndex < 25 ? "Oct" : timelineIndex < 75 ? "Nov" : "Present"}
                            </CardTitle>
                        </div>
                        {timelineIndex >= 75 && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Incident Detected
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1 p-0 relative">
                        {/* Fake Graph Background Pattern */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-background/80 to-background z-10 pointer-events-none" />
                        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(hsl(var(--muted-foreground)/0.2) 1px, transparent 0)', backgroundSize: '24px 24px' }} />

                        {/* Animated Nodes visualization based on timeline */}
                        <div className="absolute inset-0 flex items-center justify-center p-8 z-20">
                            <div className="relative w-full max-w-2xl h-full">

                                {/* Core DB */}
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 p-3 bg-emerald-500/10 border border-emerald-500/50 rounded-lg text-center backdrop-blur shadow-lg">
                                    <div className="w-4 h-4 bg-emerald-500 rounded text-emerald-500 mb-1 mx-auto" />
                                    <span className="text-xs font-bold text-foreground">Neo4j</span>
                                </div>

                                {/* API appearing later */}
                                <div className={`absolute left-1/4 top-1/4 w-32 p-3 bg-purple-500/10 border border-purple-500/50 rounded-lg text-center backdrop-blur shadow-lg transition-all duration-700 ${timelineIndex < 30 ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
                                    <div className="w-4 h-4 bg-purple-500 rounded text-purple-500 mb-1 mx-auto" />
                                    <span className="text-xs font-bold text-foreground">Graph API</span>
                                </div>

                                {/* Connecting Line */}
                                <svg className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${timelineIndex < 30 ? 'opacity-0' : 'opacity-100'}`}>
                                    <line x1="25%" y1="25%" x2="50%" y2="50%" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="4 4" />
                                </svg>

                                {/* Blinking Incident marking current state */}
                                <div className={`absolute right-1/4 bottom-1/4 w-32 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-center backdrop-blur shadow-[0_0_20px_rgba(255,50,50,0.3)] transition-all duration-700 ${timelineIndex < 75 ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
                                    <div className="w-4 h-4 bg-red-500 animate-pulse rounded text-red-500 mb-1 mx-auto" />
                                    <span className="text-xs font-bold text-foreground">INC-142</span>
                                </div>

                                <svg className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${timelineIndex < 75 ? 'opacity-0' : 'opacity-100'}`}>
                                    <line x1="50%" y1="50%" x2="75%" y2="75%" stroke="hsl(var(--red-500))" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
                                </svg>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Playback Controls */}
                <Card className="bg-card border-border">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    className="w-12 h-12 rounded-full border-primary/50 text-primary hover:bg-primary/10"
                                >
                                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="text-muted-foreground w-10 h-10 rounded-full">
                                    <FastForward className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="flex-1 px-4 relative">
                                <Slider
                                    defaultValue={[80]}
                                    max={100}
                                    step={1}
                                    value={[timelineIndex]}
                                    onValueChange={(v: number[]) => setTimelineIndex(v[0])}
                                    className="my-6"
                                />

                                {/* Timeline Markers */}
                                <div className="absolute w-full flex justify-between px-4 bottom-0 left-0 translate-y-4">
                                    {timelineEvents.map((evt, i) => (
                                        <div key={i} className="flex flex-col items-center">
                                            <div className="w-1 h-2 bg-border mb-1" />
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{evt.date}</span>
                                            <span className="text-[10px] text-muted-foreground max-w-[60px] text-center leading-tight mt-0.5">{evt.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="h-8" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
