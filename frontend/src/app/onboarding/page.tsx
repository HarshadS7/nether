"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronRight, Server, Database, Globe } from "lucide-react";

export default function OnboardingPage() {
    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">Contextual Onboarding Engine</h1>
                <p className="text-muted-foreground mt-1">Accelerate ramp-up time via auto-generated, graph-driven learning paths.</p>
            </div>


            <div className="grid gap-6 md:grid-cols-3 mb-8">
                <Card className="bg-[#C4F3C4]/30 border-[#C4F3C4] cursor-pointer hover:bg-[#C4F3C4]/50 transition-colors text-[#231F20]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center text-primary">
                            <Server className="w-5 h-5 mr-2" /> Backend Engineer
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-[#231F20]/70 mb-4">Focus on core APIs, Kafka events, and Neo4j graph schemas.</p>
                        <Badge className="bg-primary/20 text-primary border-primary/50">Selected Path</Badge>
                    </CardContent>
                </Card>

                <Card className="bg-card hover:bg-muted/50 transition-colors cursor-pointer border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center">
                            <Globe className="w-5 h-5 mr-2" /> Frontend Engineer
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Focus on UI components, React frameworks, and API consumption.</p>
                    </CardContent>
                </Card>

                <Card className="bg-card hover:bg-muted/50 transition-colors cursor-pointer border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center">
                            <Database className="w-5 h-5 mr-2" /> SRE / Data
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Focus on infrastructure, pipelines, and CI/CD operations.</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-card border-border mb-6">
                <CardHeader>
                    <CardTitle>Your Learning Path: Backend Core</CardTitle>
                    <CardDescription>Generated based on recent merged PRs and core architecture nodes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-6">
                        <div className="flex justify-between items-center text-sm font-medium mb-2">
                            <span>Overall Progress</span>
                            <span className="text-primary font-bold">30%</span>
                        </div>
                        <Progress value={30} className="h-2" />
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold">1. Local Setup & Repositories</h4>
                                <p className="text-xs text-muted-foreground mt-1">Clone main backend repo and configure Docker environments.</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-muted border border-border flex items-start gap-4 relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold">2. Explore the Ingestion Service</h4>
                                <p className="text-xs text-muted-foreground mt-1">Understand how data flows into the knowledge graph via Kafka topics.</p>
                                <div className="mt-3">
                                    <Button variant="secondary" size="sm" className="h-8">
                                        View in Graph <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-card border border-border flex items-start gap-4 opacity-70">
                            <div className="w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold">3. Starter Task: Fix API Spec Typo</h4>
                                <p className="text-xs text-muted-foreground mt-1">Submit your first PR to the `graph-api` repository.</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
