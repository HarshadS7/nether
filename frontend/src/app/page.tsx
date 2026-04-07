"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Network, Github, Mail, KeyRound, Loader2, CheckCircle } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 1200);
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: credentialResponse.credential }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        router.push('/dashboard');
      } else {
        console.error('Google login failed:', data.error);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Network error during Google login:', err);
      setIsLoading(false);
    }
  };

  const handleGithubLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    if (!clientId || clientId === 'YOUR_GITHUB_CLIENT_ID') {
      alert('Please configure NEXT_PUBLIC_GITHUB_CLIENT_ID in .env.local');
      return;
    }
    setIsGithubLoading(true);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=read:user user:email`;
  };

  const features = [
    "Graph-first architecture intelligence",
    "Blast-radius impact simulation",
    "Automated PR review & analysis",
    "Real-time system health monitoring",
  ];

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* ── Left Panel – Sinqlo mint brand panel ──────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16 bg-[#C4F3C4]">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#231F20] flex items-center justify-center">
            <Network className="w-5 h-5 text-[#C4F3C4]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#231F20]">
            Nether<span className="opacity-60">.ai</span>
          </span>
        </div>

        {/* Hero Copy */}
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit bg-[#231F20] text-[#C4F3C4] text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Architecture Intelligence
            </span>
            <h1 className="text-5xl font-black leading-[1.1] tracking-tight text-[#231F20]">
              Understand your<br />
              codebase.<br />
              Instantly.
            </h1>
            <p className="text-[#231F20]/70 text-lg leading-relaxed max-w-md">
              The graph-first platform that maps dependencies, simulates blast radius,
              and reviews PRs before they break production.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#231F20] shrink-0" />
                <span className="text-[#231F20] text-sm font-medium">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer note */}
        <p className="text-[#231F20]/60 text-xs">
          Trusted by engineering teams worldwide.
        </p>
      </div>

      {/* ── Right Panel – Login Form ───────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 bg-white">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl bg-[#231F20] flex items-center justify-center">
            <Network className="w-5 h-5 text-[#C4F3C4]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#231F20]">
            Nether<span className="opacity-50">.ai</span>
          </span>
        </div>

        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Heading */}
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-black tracking-tight text-[#231F20]">Sign in</h2>
            <p className="text-[#6B6868] text-sm">
              Enter your credentials to access the platform.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6868]" />
              <Input
                id="email"
                placeholder="name@company.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading || isGithubLoading}
                className="pl-9 h-11 bg-white border-[#E5E3E0] text-[#231F20] placeholder:text-[#6B6868] focus-visible:ring-[#231F20] focus-visible:border-[#231F20]"
                required
              />
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6868]" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                disabled={isLoading || isGithubLoading}
                className="pl-9 h-11 bg-white border-[#E5E3E0] text-[#231F20] placeholder:text-[#6B6868] focus-visible:ring-[#231F20] focus-visible:border-[#231F20]"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#231F20] hover:bg-[#3D3839] text-white font-bold text-sm tracking-wide transition-colors"
              disabled={isLoading || isGithubLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#E5E3E0]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-[#6B6868] tracking-widest">or</span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="flex flex-col gap-3">
            <div className="w-full flex justify-center rounded-lg overflow-hidden bg-white hover:bg-[#F4F2F0] transition-colors border border-[#E5E3E0]">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.log('Google Login Failed')}
                theme="outline"
                size="large"
                shape="rectangular"
              />
            </div>

            <Button
              variant="outline"
              className="w-full h-11 border-[#E5E3E0] bg-white text-[#231F20] hover:bg-[#F4F2F0] hover:border-[#231F20] transition-all font-medium"
              type="button"
              onClick={handleGithubLogin}
              disabled={isLoading || isGithubLoading}
            >
              {isGithubLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Continue with GitHub
            </Button>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-[#6B6868]">
            No account?{" "}
            <a href="#" className="text-[#231F20] font-semibold hover:underline underline-offset-4 transition-colors">
              Request access
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

