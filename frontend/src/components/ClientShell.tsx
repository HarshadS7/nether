"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Hide sidebar on the login page (/) and the dashboard repo selection (/dashboard)
    const isAuthOrDashboard = pathname === "/" || pathname === "/dashboard";

    return (
        <>
            {!isAuthOrDashboard && <Sidebar />}
            <main className="flex-1 overflow-auto bg-background relative z-0">
                {children}
            </main>
        </>
    );
}
