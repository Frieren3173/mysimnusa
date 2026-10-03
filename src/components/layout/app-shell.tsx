"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

interface AppShellProps {
  breadcrumbs?: { label: string; href?: string }[];
  user?: { name: string; email: string; role: string };
  children: React.ReactNode;
}

export function AppShell({ breadcrumbs, user, children }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar — hidden on mobile, collapsible on desktop */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar breadcrumbs={breadcrumbs} user={user} />

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 md:p-6"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
