"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, MinusCircle, PlusCircle, AlertTriangle } from "lucide-react";
import Editor from "@monaco-editor/react";

export default function ImpactPage() {
    const [target, setTarget] = useState("auth-service");
    const [isSimulating, setIsSimulating] = useState(false);
    const [result, setResult] = useState<any>(null);

    const simulateImpact = () => {
        setIsSimulating(true);
        setResult(null);

        // Fake simulation delay
        setTimeout(() => {
            setResult({
                riskScore: 82,
                affectedServices: ["user-profile-api", "billing-worker", "graph-api"],
                propagationChain: "auth-service -> user-profile-api -> billing-worker",
                diff: `- function validateToken(token: string) {
+ function validateToken(token: string, audience: string) {`
            });
            setIsSimulating(false);
        }, 1500);
    };

    return (
        <div className="flex h-full w-full flex-col p-6 overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-2xl font-bold tracking-tight">What-If Impact Simulator</h1>
                <p className="text-muted-foreground mt-1">Predict the blast radius of schema or dependency changes before they merge.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 h-[calc(100vh-200px)]">
                {/* Simulation Controls */}
                <div className="flex flex-col gap-6">
                    <Card className="bg-card">
                        <CardHeader>
                            <CardTitle>Simulation Parameters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block text-muted-foreground">Target Service / Schema</label>
                                <Input
                                    value={target}
                                    onChange={(e) => setTarget(e.target.value)}
                                    className="bg-muted border-border"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium mb-1 block text-muted-foreground">Simulated Change</label>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between p-2 rounded border border-border bg-background">
                                        <span className="text-xs font-mono">auth/jwt.ts</span>
                                        <Badge variant="outline" className="text-[#C4F3C4] border-[#C4F3C4]/50 bg-[#C4F3C4]/10">Method Signature Change</Badge>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={simulateImpact}
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-4 h-12"
                                disabled={isSimulating}
                            >
                                {isSimulating ? (
                                    <span className="flex items-center gap-2"><span className="animate-spin h-4 w-4 border-2 border-primary-foreground border-b-transparent rounded-full"></span> Running Simulation...</span>
                                ) : (
                                    <span className="flex items-center gap-2"><Play className="w-4 h-4" /> Run Blast Radius Analysis</span>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Result Stats */}
                    {result && (
                        <Card className="bg-card border-red-500/30 animate-in fade-in slide-in-from-bottom-4">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center justify-between">
                                    Risk Score
                                    <span className={`text-xl font-bold ${result.riskScore > 75 ? "text-red-500" : "text-yellow-500"}`}>{result.riskScore}/100</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm mt-2">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <p>High risk! This change breaks downstream token validation in 3 critical services.</p>
                                </div>

                                <div className="mt-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Propagation Chain</h4>
                                    <div className="text-sm font-mono bg-muted p-2 rounded text-foreground overflow-x-auto whitespace-nowrap">
                                        {result.propagationChain}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Diff & Affected Services Viewer */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    <Card className="flex-1 bg-card flex flex-col overflow-hidden">
                        <CardHeader className="py-4 border-b border-border bg-muted/30">
                            <CardTitle className="text-base">Proposed Change Diff</CardTitle>
                            <CardDescription>Code modifications analyzed</CardDescription>
                        </CardHeader>
                        <div className="flex-1 relative">
                            <Editor
                                height="100%"
                                defaultLanguage="typescript"
                                theme="vs-dark"
                                value={result ? result.diff : "// Run simulation to view code difference"}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 13,
                                    fontFamily: "var(--font-mono)",
                                }}
                            />
                        </div>
                    </Card>

                    {result && (
                        <Card className="bg-card animate-in fade-in delay-150">
                            <CardHeader className="py-3">
                                <CardTitle className="text-base">Directly Affected Services</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2">
                                    {result.affectedServices.map((svc: string) => (
                                        <Badge key={svc} variant="outline" className="bg-red-500/10 text-red-500 border-red-500/50 px-3 py-1">
                                            {svc}
                                        </Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!result && !isSimulating && (
                        <div className="h-32 flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground bg-muted/20">
                            Run simulation to view affected downstream services.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
