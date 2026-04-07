"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function GithubCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const code = searchParams.get('code');

        if (!code) {
            setError('No authorization code provided by GitHub.');
            return;
        }

        const authenticate = async () => {
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'github',
                        code,
                    }),
                });

                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('authToken', data.token);
                    if (data.githubToken) {
                        localStorage.setItem('rawGithubToken', data.githubToken);
                    }
                    if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                    }
                    router.push('/dashboard');
                } else {
                    setError(data.error || 'Authentication failed');
                }
            } catch (err) {
                console.error('Network error during GitHub login:', err);
                setError('A network error occurred during authentication.');
            }
        };

        authenticate();
    }, [searchParams, router]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <h2 className="text-xl font-bold text-red-500">Authentication Error</h2>
                <p className="text-muted-foreground">{error}</p>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                    Return to Login
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <h2 className="text-xl font-medium tracking-tight">Authenticating with GitHub...</h2>
            <p className="text-muted-foreground text-sm">Please wait while we verify your credentials.</p>
        </div>
    );
}

export default function GithubCallbackPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-white p-4 relative overflow-hidden text-[#231F20]">
            <div className="z-10 bg-[#FAFAF9] border border-[#E5E3E0] rounded-xl w-full max-w-md h-64 flex items-center justify-center p-6 text-center shadow-sm">
                <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-[#231F20]" />}>
                    <GithubCallbackContent />
                </Suspense>
            </div>
        </div>
    );
}
