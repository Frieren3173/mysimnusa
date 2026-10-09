"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

interface AppShellProps {
  breadcrumbs?: { label: string; href?: string }[];
  user?: { name: string; email: string; role: string };
  /** Role names for menu visibility (server-provided, never trusted for authz). */
  roles?: string[];
  /** Permission codes for menu visibility (server-provided, never trusted for authz). */
  permissions?: string[];
  children: React.ReactNode;
}

export function AppShell({ breadcrumbs, user, roles, permissions, children }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">
      {/* Sidebar — hidden on mobile, collapsible on desktop */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          roles={roles}
          permissions={permissions}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar breadcrumbs={breadcrumbs} user={user} />

        {/* Page content — re-keyed per route so each navigation plays a
            subtle fade + translate entrance (CSS only, reduced-motion aware). */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 md:p-6"
          tabIndex={-1}
        >
          <div key={pathname} className="animate-enter stagger-children">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
