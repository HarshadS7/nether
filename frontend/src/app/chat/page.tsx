"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, FileCode, FileText, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: { text: string; nodeId: string; type: string }[];
    artifacts?: { title: string; type: "file" | "doc"; snippet: string }[];
}

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "msg-0",
            role: "assistant",
            content: "Hello! I am your Engineering Brain AI. I can help you analyze architectures, trace dependencies, and understand incidents. What would you like to explore today?",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: userMsg.content }),
            });
            const data = await res.json();
            setMessages((prev) => [...prev, data]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const getNodeColor = (type: string) => {
        switch (type) {
            case "Service": return "bg-blue-500/10 text-blue-500 border-blue-500/50";
            case "API": return "bg-purple-500/10 text-purple-500 border-purple-500/50";
            case "Database": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/50";
            case "Incident": return "bg-red-500/10 text-red-500 border-red-500/50";
            default: return "bg-gray-500/10 text-gray-400 border-gray-500/50";
        }
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 md:p-6">
            <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm">
                {/* Header */}
                <div className="h-14 border-b border-border flex items-center px-4 bg-muted/30">
                    <Bot className="w-5 h-5 text-primary mr-2" />
                    <h2 className="font-semibold tracking-tight">Architecture Assistant</h2>
                </div>

                {/* Chat Messages */}
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="space-y-6 pb-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className={cn("flex gap-4", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", msg.role === "assistant" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground")}>
                                    {msg.role === "assistant" ? <Bot size={18} /> : <User size={18} />}
                                </div>

                                <div className={cn("flex flex-col gap-2 max-w-[80%]", msg.role === "user" && "items-end")}>
                                    <div className={cn("px-4 py-2 rounded-2xl", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                        <p className="text-sm leading-relaxed">{msg.content}</p>
                                    </div>

                                    {/* Citations Grid */}
                                    {msg.citations && msg.citations.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {msg.citations.map((cite, i) => (
                                                <Link href={`/graph?node=${cite.nodeId}`} key={i}>
                                                    <Badge variant="outline" className={cn("cursor-pointer shrink-0 hover:bg-background/80 transition-colors", getNodeColor(cite.type))}>
                                                        {cite.text}
                                                        <ArrowUpRight className="w-3 h-3 ml-1 opacity-70" />
                                                    </Badge>
                                                </Link>
                                            ))}
                                        </div>
                                    )}

                                    {/* Artifact Cards */}
                                    {msg.artifacts && msg.artifacts.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-1">
                                            {msg.artifacts.map((art, i) => (
                                                <Card key={i} className="bg-background border-border hover:border-primary/50 transition-colors cursor-pointer group">
                                                    <CardContent className="p-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {art.type === 'file' ? <FileCode className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-emerald-500" />}
                                                            <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{art.title}</span>
                                                        </div>
                                                        <pre className="text-[10px] text-muted-foreground font-mono bg-muted p-2 rounded overflow-hidden text-ellipsis whitespace-nowrap">
                                                            {art.snippet}
                                                        </pre>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-4 flex-row">
                                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                                    <Bot size={18} />
                                </div>
                                <div className="flex items-center gap-1 bg-muted px-4 py-3 rounded-2xl h-[40px]">
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t border-border bg-background">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about the architecture, services, or incidents..."
                            className="flex-1 bg-muted border-border focus-visible:ring-primary h-12 py-2 px-4 rounded-xl"
                            disabled={isLoading}
                        />
                        <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="h-12 w-12 rounded-xl shrink-0">
                            <Send className="w-5 h-5" />
                        </Button>
                    </form>
                    <div className="mt-2 text-[10px] text-center text-muted-foreground uppercase tracking-widest font-semibold">
                        AI Assistant is connected to the live knowledge graph.
                    </div>
                </div>
            </div>
        </div>
    );
}
