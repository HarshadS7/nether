"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Search, GitBranch, Settings, Github, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Link2, Building2, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";

// Minimal API URL default
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9056";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "mock-api-key";

export default function DashboardPage() {
    const router = useRouter();
    const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
    const [workspaces, setWorkspaces] = useState<any[]>([]);
    const [isFetchingWorkspaces, setIsFetchingWorkspaces] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Import Modal State
    const [workspaceName, setWorkspaceName] = useState("");

    // Import Modal State
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importMode, setImportMode] = useState<"link" | "org" | "mine">("mine");
    const [importLoading, setImportLoading] = useState(false);

    // My Repos Import State
    const [myRepos, setMyRepos] = useState<any[]>([]);
    const [selectedMyRepos, setSelectedMyRepos] = useState<Set<string>>(new Set());
    const [isFetchingMyRepos, setIsFetchingMyRepos] = useState(false);

    // Org Import State
    const [orgName, setOrgName] = useState("");
    const [orgRepos, setOrgRepos] = useState<any[]>([]);
    const [selectedOrgRepos, setSelectedOrgRepos] = useState<Set<string>>(new Set());
    const [isFetchingOrg, setIsFetchingOrg] = useState(false);

    // Link Import State
    const [repoLink, setRepoLink] = useState("");

    // Fetch existing workspaces
    const fetchWorkspaces = async () => {
        setIsFetchingWorkspaces(true);
        try {
            // Get owner from stored user data
            const storedUser = localStorage.getItem('user');
            const owner = storedUser ? JSON.parse(storedUser).username || JSON.parse(storedUser).login || JSON.parse(storedUser).email : null;
            
            if (!owner) {
                console.warn('No user found in localStorage, skipping workspace fetch');
                setWorkspaces([]);
                setIsFetchingWorkspaces(false);
                return;
            }
            
            const res = await fetch(`${API_BASE}/workspace?owner=${encodeURIComponent(owner)}`, {
                headers: { "Authorization": `Bearer ${API_KEY}` }
            });
            const data = await res.json();
            if (data.success) {
                const mappedWorkspaces = data.data.map((w: any) => ({
                    id: w._id,
                    name: w.name,
                    repoCount: w.repositories?.length || 0,
                    status: "Healthy",
                    risk: "Low",
                    lastScan: new Date(w.updatedAt).toLocaleString()
                }));
                setWorkspaces(mappedWorkspaces);
            }
        } catch (err) {
            console.error("Failed to fetch workspaces:", err);
            setWorkspaces([]);
        } finally {
            setIsFetchingWorkspaces(false);
        }
    };

    useEffect(() => {
        // Load user from localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setCurrentUser(JSON.parse(storedUser));
            } catch (e) {
                console.error('Failed to parse stored user:', e);
            }
        }
        fetchWorkspaces();
    }, []);

    const handleSelectWorkspace = (id: string) => {
        setSelectedWorkspace(id);
    };

    const handleEnterWorkspace = () => {
        if (selectedWorkspace) {
            router.push(`/workspace/${selectedWorkspace}`);
        }
    };

    // --- IMPORT LOGIC ---

    const handleFetchMyRepos = async () => {
        const token = localStorage.getItem('rawGithubToken');
        if (!token) {
            alert("No GitHub token found. Please log in using GitHub to view your repositories.");
            return;
        }

        setIsFetchingMyRepos(true);
        try {
            const res = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (res.ok) {
                const data = await res.json();
                setMyRepos(data);
                setSelectedMyRepos(new Set());
            } else {
                alert("Failed to fetch your repositories.");
            }
        } catch (err) {
            console.error("Failed to fetch my repos", err);
        } finally {
            setIsFetchingMyRepos(false);
        }
    };

    // Fetch user repos automatically when opening the modal on "mine" mode
    useEffect(() => {
        if (isImportOpen && importMode === 'mine' && myRepos.length === 0) {
            handleFetchMyRepos();
        }
    }, [isImportOpen, importMode]);

    const handleFetchOrgRepos = async () => {
        if (!orgName.trim()) return;
        setIsFetchingOrg(true);
        try {
            const res = await fetch(`https://api.github.com/orgs/${orgName.trim()}/repos?per_page=50`);
            if (res.ok) {
                const data = await res.json();
                setOrgRepos(data);
                setSelectedOrgRepos(new Set()); // Reset selections
            } else {
                alert("Organization not found or you've hit the API limit.");
            }
        } catch (err) {
            console.error("Failed to fetch org repos", err);
        } finally {
            setIsFetchingOrg(false);
        }
    };

    const toggleOrgRepo = (repoHtmlUrl: string) => {
        const newSelected = new Set(selectedOrgRepos);
        if (newSelected.has(repoHtmlUrl)) {
            newSelected.delete(repoHtmlUrl);
        } else {
            newSelected.add(repoHtmlUrl);
        }
        setSelectedOrgRepos(newSelected);
    };

    const toggleMyRepo = (repoHtmlUrl: string) => {
        const newSelected = new Set(selectedMyRepos);
        if (newSelected.has(repoHtmlUrl)) {
            newSelected.delete(repoHtmlUrl);
        } else {
            newSelected.add(repoHtmlUrl);
        }
        setSelectedMyRepos(newSelected);
    };

    const submitImport = async () => {
        setImportLoading(true);
        try {
            const reposToAdd: string[] = [];

            if (importMode === "link") {
                if (!repoLink.trim()) {
                    alert("Please provide a repository link");
                    setImportLoading(false);
                    return;
                }
                reposToAdd.push(repoLink.trim());
            } else if (importMode === "org") {
                if (selectedOrgRepos.size === 0) {
                    alert("Please select at least one repository from the organization");
                    setImportLoading(false);
                    return;
                }
                Array.from(selectedOrgRepos).forEach(url => reposToAdd.push(url));
            } else if (importMode === "mine") {
                if (selectedMyRepos.size === 0) {
                    alert("Please select at least one repository");
                    setImportLoading(false);
                    return;
                }
                Array.from(selectedMyRepos).forEach(url => reposToAdd.push(url));
            }

            if (!workspaceName.trim()) {
                alert("Please provide a Workspace Name");
                setImportLoading(false);
                return;
            }

            const res = await fetch(`${API_BASE}/workspace`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    name: workspaceName,
                    owner: currentUser?.username || currentUser?.login || currentUser?.email || 'unknown',
                    repositories: reposToAdd
                })
            });

            const data = await res.json();
            
            if (!res.ok || !data.success) {
                alert(data.error || "Failed to create workspace");
                setImportLoading(false);
                return;
            }

            // Cleanup & Refresh
            setIsImportOpen(false);
            setRepoLink("");
            setWorkspaceName("");
            setSelectedOrgRepos(new Set());
            setSelectedMyRepos(new Set());
            setOrgRepos([]);
            await fetchWorkspaces();
        } catch (error) {
            console.error("Error importing repository:", error);
            alert("Failed to import. Check console.");
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full flex-col bg-[#F8F7F5] text-[#231F20] overflow-y-auto">
            {/* ── Top Navbar ─────────────────────────────────── */}
            <header className="flex h-16 items-center justify-between border-b border-[#E5E3E0] bg-white px-8 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#231F20] flex items-center justify-center">
                        <Network className="h-4 w-4 text-[#C4F3C4]" />
                    </div>
                    <span className="font-black text-lg tracking-tight text-[#231F20]">Nether<span className="text-[#231F20]/50">.ai</span></span>
                </div>
                <div className="flex items-center gap-5">
                    <Button variant="ghost" size="icon" className="text-[#6B6868] hover:text-[#231F20] hover:bg-[#F4F2F0]">
                        <Settings className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3 pl-5 border-l border-[#E5E3E0]">
                        <span className="text-sm font-medium text-[#6B6868]">{currentUser?.username || currentUser?.login || currentUser?.email || 'User'}</span>
                        <div className="h-8 w-8 rounded-full bg-[#231F20] flex items-center justify-center text-white font-black text-xs">
                            {(currentUser?.username || currentUser?.login || currentUser?.email || 'U').slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-10 flex flex-col gap-10">

                {/* ── Welcome Section ──────────────────────────── */}
                <section className="flex flex-col gap-3">
                    <span className="inline-flex w-fit bg-[#C4F3C4] text-[#231F20] text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full">Dashboard</span>
                    <h1 className="text-4xl font-black tracking-tight">Welcome back{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}.</h1>
                    <p className="text-[#9A9090] text-base">Select a repository workspace to begin architectural analysis.</p>
                </section>

                {/* ── Action Bar ───────────────────────────────── */}
                <section className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6868]" />
                        <input
                            type="text"
                            placeholder="Search repositories..."
                            className="flex h-11 w-full rounded-lg border border-[#E5E3E0] bg-white px-3 py-2 pl-9 text-sm text-[#231F20] placeholder:text-[#6B6868] focus:outline-none focus:ring-2 focus:ring-[#231F20]/20 focus:border-[#231F20] transition-colors"
                        />
                    </div>
                    <Button
                        onClick={() => setIsImportOpen(true)}
                        className="w-full sm:w-auto h-11 px-5 bg-white text-[#231F20] border border-[#E5E3E0] hover:bg-[#F4F2F0] hover:border-[#231F20] transition-all font-medium"
                    >
                        <Building2 className="mr-2 h-4 w-4" />
                        Create Workspace
                    </Button>
                </section>

                {/* Repository Grid -> Workspace Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isFetchingWorkspaces ? (
                        <div className="col-span-full flex justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : workspaces.length === 0 ? (
                        <div className="col-span-full text-center py-10 text-muted-foreground">
                            No workspaces found. Create one by importing from GitHub!
                        </div>
                    ) : (
                        workspaces.map((ws) => (
                            <Card
                                key={ws.id}
                                onClick={() => handleSelectWorkspace(ws.id)}
                                className={`cursor-pointer transition-all duration-200 border-2 ${selectedWorkspace === ws.id
                                    ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(0,240,255,0.1)] scale-[1.02]"
                                    : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                                    }`}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg flex items-center gap-2 overflow-hidden">
                                            <span className="font-mono truncate" title={ws.name}>{ws.name}</span>
                                        </CardTitle>
                                        <Badge variant="outline" className={
                                            ws.status === "Healthy" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
                                                ws.status === "Syncing" ? "bg-blue-500/10 text-blue-500 border-blue-500/30" :
                                                    "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse"
                                        }>
                                            {ws.status === "Healthy" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                            {ws.status === "Syncing" && <Network className="w-3 h-3 mr-1 animate-spin" />}
                                            {ws.status === "Incident" && <AlertTriangle className="w-3 h-3 mr-1" />}
                                            {ws.status}
                                        </Badge>
                                    </div>
                                    <CardDescription className="flex items-center gap-4 mt-2">
                                        <span className="flex items-center text-xs"><GitBranch className="w-3 h-3 mr-1" /> {ws.repoCount} Repositories</span>
                                        <span className="text-xs text-muted-foreground">Workspace</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pb-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Architectural Risk:</span>
                                        <span className={`font-semibold ${ws.risk === "Low" ? "text-emerald-500" :
                                            ws.risk === "Medium" ? "text-yellow-500" : "text-red-500"
                                            }`}>{ws.risk}</span>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0 flex justify-between items-center text-xs text-muted-foreground border-t border-border/50 bg-muted/10 px-6 py-3">
                                    Last synchronized: {ws.lastScan}
                                </CardFooter>
                            </Card>
                        ))
                    )}
                </section>

                {/* ── Enter Workspace CTA ───────────────────────── */}
                <div className="mt-auto pt-4 flex justify-end">
                    <Button
                        onClick={handleEnterWorkspace}
                        disabled={!selectedWorkspace}
                        className={`px-8 h-12 text-base transition-all ${selectedWorkspace
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                            : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                            }`}
                    >
                        Enter Workspace <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>

            </div>

            {/* MODAL OVERLAY */}
            {isImportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/30">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Building2 className="w-5 h-5" /> Create Workspace
                                </h2>
                                <p className="text-sm text-muted-foreground mt-1">Group repositories together into a unified project workspace.</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsImportOpen(false)} className="rounded-full">
                                <span className="sr-only">Close</span>✕
                            </Button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 flex-1 overflow-y-auto">

                            {/* Tabs */}

                            <div className="space-y-2 mb-6">
                                <label className="text-sm font-medium">Workspace Name <span className="text-red-500">*</span></label>
                                <Input
                                    placeholder="e.g. My Next.js Projects"
                                    value={workspaceName}
                                    onChange={(e) => setWorkspaceName(e.target.value)}
                                    className="bg-background"
                                />
                            </div>

                            <label className="text-sm font-medium mb-2 block">Select Repositories to Include</label>

                            <div className="flex p-1 bg-muted rounded-xl mb-4">
                                <button
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'mine' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => setImportMode('mine')}
                                >
                                    <Network className="w-4 h-4" /> My Repos
                                </button>
                                <button
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'org' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => setImportMode('org')}
                                >
                                    <Building2 className="w-4 h-4" /> Organization
                                </button>
                                <button
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'link' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => setImportMode('link')}
                                >
                                    <Link2 className="w-4 h-4" /> Paste Link
                                </button>
                            </div>

                            {/* Content: Mine */}
                            {importMode === "mine" && (
                                <div className="space-y-4 animate-in fade-in flex flex-col h-full">
                                    {isFetchingMyRepos ? (
                                        <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                            <span className="text-sm text-muted-foreground">Fetching your repositories from GitHub...</span>
                                        </div>
                                    ) : myRepos.length > 0 ? (
                                        <div className="border border-border rounded-xl overflow-hidden flex-1 min-h-[200px] flex flex-col">
                                            <div className="bg-muted px-4 py-2 border-b border-border flex justify-between items-center text-sm font-medium">
                                                <span>Your Repositories ({myRepos.length})</span>
                                                <span className="text-primary">{selectedMyRepos.size} selected</span>
                                            </div>
                                            <div className="overflow-y-auto max-h-[300px] p-2 space-y-1 bg-background/50">
                                                {myRepos.map((repo) => (
                                                    <label
                                                        key={repo.id}
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedMyRepos.has(repo.html_url)
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-transparent hover:bg-muted'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
                                                            checked={selectedMyRepos.has(repo.html_url)}
                                                            onChange={() => toggleMyRepo(repo.html_url)}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-sm flex items-center gap-2">
                                                                {repo.name}
                                                                {repo.private && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded">Private</Badge>}
                                                            </span>
                                                            {repo.description && (
                                                                <span className="text-xs text-muted-foreground line-clamp-1">{repo.description}</span>
                                                            )}
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed rounded-xl border-border">
                                            Could not load repositories. Did you log in with GitHub?
                                            <Button variant="outline" size="sm" className="mt-4 mx-auto block" onClick={handleFetchMyRepos}>
                                                Try Again
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Content: Link */}
                            {importMode === "link" && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Repository URL</label>
                                        <Input
                                            placeholder="https://github.com/owner/repo"
                                            value={repoLink}
                                            onChange={(e) => setRepoLink(e.target.value)}
                                            className="bg-background"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        The repository must be public or the application must have authorization to access it.
                                    </p>
                                </div>
                            )}

                            {/* Content: Org */}
                            {importMode === "org" && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 flex flex-col h-full">
                                    <div className="flex gap-2">
                                        <div className="space-y-2 flex-1">
                                            <Input
                                                placeholder="Enter Organization (e.g., vercel)"
                                                value={orgName}
                                                onChange={(e) => setOrgName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleFetchOrgRepos()}
                                                className="bg-background"
                                            />
                                        </div>
                                        <Button
                                            variant="secondary"
                                            onClick={handleFetchOrgRepos}
                                            disabled={isFetchingOrg || !orgName.trim()}
                                        >
                                            {isFetchingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                                        </Button>
                                    </div>

                                    {/* Org Repos List */}
                                    {orgRepos.length > 0 && (
                                        <div className="mt-4 border border-border rounded-xl overflow-hidden flex-1 min-h-[200px] flex flex-col">
                                            <div className="bg-muted px-4 py-2 border-b border-border flex justify-between items-center text-sm font-medium">
                                                <span>Repositories ({orgRepos.length})</span>
                                                <span className="text-primary">{selectedOrgRepos.size} selected</span>
                                            </div>
                                            <div className="overflow-y-auto max-h-[300px] p-2 space-y-1 bg-background/50">
                                                {orgRepos.map((repo) => (
                                                    <label
                                                        key={repo.id}
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedOrgRepos.has(repo.html_url)
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-transparent hover:bg-muted'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
                                                            checked={selectedOrgRepos.has(repo.html_url)}
                                                            onChange={() => toggleOrgRepo(repo.html_url)}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-sm">{repo.name}</span>
                                                            {repo.description && (
                                                                <span className="text-xs text-muted-foreground line-clamp-1">{repo.description}</span>
                                                            )}
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                            <Button
                                onClick={submitImport}
                                disabled={
                                    importLoading || !workspaceName.trim() ||
                                    (importMode === 'link' ? !repoLink :
                                        importMode === 'org' ? selectedOrgRepos.size === 0 :
                                            selectedMyRepos.size === 0)
                                }
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                {importLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create Workspace
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
