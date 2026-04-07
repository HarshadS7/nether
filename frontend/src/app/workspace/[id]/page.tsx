"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Search, GitBranch, Settings, CheckCircle2, AlertTriangle, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "mock-api-key";

export default function WorkspacePage() {
    const router = useRouter();
    const params = useParams();
    const workspaceId = params.id as string;

    const [workspace, setWorkspace] = useState<any>(null);
    const [repositories, setRepositories] = useState<any[]>([]);
    const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setCurrentUser(JSON.parse(storedUser));
            } catch (e) {
                console.error('Failed to parse stored user:', e);
            }
        }
    }, []);

    const fetchWorkspaceDetails = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/workspace/${workspaceId}`, {
                headers: { "Authorization": `Bearer ${API_KEY}` }
            });
            const data = await res.json();

            if (data.success && data.data) {
                setWorkspace(data.data.workspace);

                const mappedRepos = data.data.repositories.map((r: any) => {
                    const nameParts = r.repoUrl.split('/');
                    const name = nameParts.length > 0 ? nameParts[nameParts.length - 1] : r.repoUrl;

                    return {
                        id: r._id,
                        repoUrl: r.repoUrl,
                        name: r.metadata?.repoName || name,
                        status: "Healthy",
                        branch: r.metadata?.branch || "main",
                        type: r.metadata?.type || "Repository",
                        risk: "Low",
                        lastScan: new Date(r.updatedAt).toLocaleString()
                    }
                });
                setRepositories(mappedRepos);
            }
        } catch (err) {
            console.error("Failed to fetch workspace:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (workspaceId) {
            fetchWorkspaceDetails();
        }
    }, [workspaceId]);

    const handleSelectRepo = (id: string) => {
        setSelectedRepos(prev =>
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        );
    };

    const handleAnalyzeArchitecture = () => {
        if (selectedRepos.length > 0) {
            // Pass multiple repo IDs as query parameters
            const queryParams = selectedRepos.map(id => `repoId=${id}`).join('&');
            router.push(`/graph?${queryParams}`);
        }
    };

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-y-auto relative">
            {/* Top Navbar */}
            <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 shrink-0 relative z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="text-muted-foreground hover:text-foreground mr-2">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Network className="h-6 w-6 text-primary" />
                    <span className="font-bold text-lg tracking-wide">Nether<span className="text-primary">.ai</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                        <Settings className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3 pl-4 border-l border-border">
                        <span className="text-sm font-medium">{currentUser?.username || currentUser?.login || currentUser?.email || 'User'}</span>
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 text-primary font-bold text-xs">
                            {(currentUser?.username || currentUser?.login || currentUser?.email || 'U').slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 w-full max-w-6xl mx-auto p-8 flex flex-col gap-8 relative z-10">

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    </div>
                ) : (
                    <>
                        {/* Welcome Section */}
                        <section className="flex flex-col gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">{workspace?.name || "Workspace"}</h1>
                            <p className="text-muted-foreground text-lg">Select repositories from this workspace to investigate architecture.</p>
                        </section>

                        {/* Action Bar */}
                        <section className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full sm:max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Search repositories in workspace..."
                                    className="pl-9 bg-background border-border"
                                />
                            </div>
                        </section>

                        {/* Repository Grid */}
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {repositories.length === 0 ? (
                                <div className="col-span-full text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                                    No repositories found in this workspace.
                                </div>
                            ) : (
                                repositories.map((repo) => (
                                    <Card
                                        key={repo.id}
                                        onClick={() => handleSelectRepo(repo.id)}
                                        className={`cursor-pointer transition-all duration-200 border-2 ${selectedRepos.includes(repo.id)
                                            ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(0,240,255,0.1)] scale-[1.02]"
                                            : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                                            }`}
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                                <CardTitle className="text-lg flex items-center gap-2 overflow-hidden">
                                                    <span className="font-mono truncate" title={repo.name}>{repo.name}</span>
                                                </CardTitle>
                                                <Badge variant="outline" className={
                                                    repo.status === "Healthy" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
                                                        repo.status === "Syncing" ? "bg-blue-500/10 text-blue-500 border-blue-500/30" :
                                                            "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse"
                                                }>
                                                    {repo.status === "Healthy" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                                    {repo.status === "Syncing" && <Network className="w-3 h-3 mr-1 animate-spin" />}
                                                    {repo.status === "Incident" && <AlertTriangle className="w-3 h-3 mr-1" />}
                                                    {repo.status}
                                                </Badge>
                                            </div>
                                            <CardDescription className="flex items-center gap-4 mt-2">
                                                <span className="flex items-center text-xs"><GitBranch className="w-3 h-3 mr-1" /> {repo.branch}</span>
                                                <span className="text-xs text-muted-foreground">{repo.type}</span>
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="pb-4">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Architectural Risk:</span>
                                                <span className={`font-semibold ${repo.risk === "Low" ? "text-emerald-500" :
                                                    repo.risk === "Medium" ? "text-yellow-500" : "text-red-500"
                                                    }`}>{repo.risk}</span>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="pt-0 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 bg-muted/10 px-6 py-3">
                                            Last synchronized: {repo.lastScan}
                                        </CardFooter>
                                    </Card>
                                ))
                            )}
                        </section>

                        {/* Enter Workspace Footer action */}
                        <div className="mt-auto pt-8 flex justify-end">
                            <Button
                                onClick={handleAnalyzeArchitecture}
                                disabled={selectedRepos.length === 0}
                                className={`px-8 h-12 text-base transition-all ${selectedRepos.length > 0
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                                    : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                                    }`}
                            >
                                Analyze Architecture {selectedRepos.length > 0 && `(${selectedRepos.length})`} <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
