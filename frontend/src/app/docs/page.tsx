"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Sparkles, Loader2, Download, Copy, Check } from "lucide-react";

export default function DocumentationPage() {
    const searchParams = useSearchParams();
    const repoIds = searchParams.getAll('repoId');

    const [isLoading, setIsLoading] = useState(false);
    const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    const handleGenerateDocs = async () => {
        if (repoIds.length === 0) {
            alert("No repositories selected! Please select repositories from the Dashboard first.");
            return;
        }

        setIsLoading(true);
        setGeneratedDoc(null);

        try {
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";
            const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "mock-api-key";

            const res = await fetch(`${API_BASE}/docs/generate-docs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({ repositories: repoIds })
            });

            if (!res.ok) {
                throw new Error(`ML API responded with status: ${res.status}`);
            }

            const data = await res.json();

            if (data && data.documentation) {
                setGeneratedDoc(data.documentation);
            } else {
                throw new Error("Invalid response format from ML backend.");
            }

        } catch (error) {
            console.error("Failed to generate documentation:", error);
            alert("Error communicating with the ML backend.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (generatedDoc) {
            navigator.clipboard.writeText(generatedDoc);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    return (
        <div className="flex h-full w-full flex-col p-6 lg:p-10 bg-background overflow-y-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                    <BookOpen className="w-8 h-8 text-primary" />
                    Documentation Generator
                </h1>
                <p className="text-muted-foreground mt-1 text-lg max-w-2xl">
                    Utilize our ML Backend to instantly synthesize comprehensive technical documentation for all the repositories selected in your workspace.
                </p>
            </div>

            <div className="grid gap-8 grid-cols-1 lg:grid-cols-12">
                {/* Controls Section */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <Card className="bg-card shadow-sm border-border">
                        <CardHeader>
                            <CardTitle className="text-xl">Context</CardTitle>
                            <CardDescription>Selected workspace repositories</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-3">
                                {repoIds.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {repoIds.map(id => (
                                            <span key={id} className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded-md border border-border shrink-0">
                                                {id.split('/').pop() || id}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-yellow-600 bg-yellow-100/50 dark:bg-yellow-900/20 px-3 py-2 rounded-lg border border-yellow-200/50 w-fit">
                                        No repositories selected in context.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2">
                            <Button
                                onClick={handleGenerateDocs}
                                disabled={isLoading || repoIds.length === 0}
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                                        Synthesizing Context...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5 mr-2" />
                                        Generate Documentation
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Output Section */}
                <div className="lg:col-span-8 flex flex-col h-full min-h-[500px]">
                    <Card className="flex-1 flex flex-col bg-card shadow-sm border-border overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/20 flex flex-row items-center justify-between py-4">
                            <div>
                                <CardTitle className="text-lg">Generated Output</CardTitle>
                                <CardDescription>Markdown formatted technical doc</CardDescription>
                            </div>

                            {generatedDoc && (
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={handleCopy} className="h-8">
                                        {isCopied ? <Check className="w-4 h-4 mr-2 text-emerald-500" /> : <Copy className="w-4 h-4 mr-2" />}
                                        {isCopied ? 'Copied!' : 'Copy'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <Download className="w-4 h-4 mr-2" />
                                        Export
                                    </Button>
                                </div>
                            )}
                        </CardHeader>

                        <div className="flex-1 relative">
                            {isLoading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10 transition-all">
                                    <div className="w-16 h-16 relative flex items-center justify-center">
                                        <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
                                        <div className="absolute inset-2 rounded-full border-b-2 border-emerald-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                                        <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                                    </div>
                                    <p className="mt-4 text-sm font-medium animate-pulse text-muted-foreground">ML Backend Analysis in progress...</p>
                                </div>
                            ) : null}

                            <ScrollArea className="h-full absolute inset-0 p-6">
                                {generatedDoc ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border font-sans leading-relaxed whitespace-pre-wrap">
                                        {generatedDoc}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 pt-20">
                                        <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                                        <p>Click Generate Documentation to invoke the ML backend.</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
