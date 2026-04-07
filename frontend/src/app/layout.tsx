import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientShell } from "@/components/ClientShell";
import { GoogleOAuthProvider } from '@react-oauth/google';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nether — Architecture Intelligence",
  description: "Graph-first architecture intelligence. Map dependencies, simulate blast radius, and review PRs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden bg-background text-foreground flex`}
      >
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'dummy'}>
          <ClientShell>{children}</ClientShell>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
