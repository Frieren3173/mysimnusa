"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  breadcrumbs?: { label: string; href?: string }[];
  user?: { name: string; email: string; role: string };
}

export function Topbar({ breadcrumbs = [], user }: TopbarProps) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header data-app-topbar className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85 md:px-6 shrink-0">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <li>
            <Link href="/dashboard" className="transition-colors hover:text-[var(--color-foreground)]">
              Beranda
            </Link>
          </li>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              <li aria-hidden="true" className="text-[var(--color-border-strong)]">/</li>
              <li className="truncate max-w-[120px] md:max-w-xs">
                {crumb.href && i < breadcrumbs.length - 1 ? (
                  <Link href={crumb.href} className="transition-colors hover:text-[var(--color-foreground)]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-[var(--color-foreground)]" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Global search (opens modal) */}
        <button
          className="hidden md:flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] w-48"
          aria-label="Buka pencarian global"
        >
          <Search size={14} />
          <span>Cari sesuatu...</span>
          <kbd className="ml-auto rounded border border-[var(--color-border)] bg-white px-1 text-[10px]">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-md p-2 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
          aria-label="Notifikasi"
        >
          <Bell size={16} />
          {/* Unread dot */}
          <span
            className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]"
            aria-hidden="true"
          />
        </button>

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-raised)]"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-label="Menu profil"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="hidden md:block text-left min-w-0">
              <p className="text-xs font-medium text-[var(--color-foreground)] truncate max-w-[120px]">
                {user?.name ?? "Pengguna"}
              </p>
              <p className="text-[10px] text-[var(--color-muted-foreground)] truncate max-w-[120px]">
                {user?.role ?? ""}
              </p>
            </div>
            <ChevronDown size={14} className={cn("text-[var(--color-muted-foreground)] hidden md:block transition-transform duration-150", profileOpen && "rotate-180")} />
          </button>

          {profileOpen && (
            <div
              className="animate-dialog-in absolute right-0 top-full mt-1 w-56 origin-top-right rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(15,40,70,0.12)] z-50"
              role="menu"
            >
              <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
                <p className="text-xs font-semibold text-[var(--color-foreground)] truncate">{user?.name}</p>
                <p className="text-[10px] text-[var(--color-muted-foreground)] truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <DropdownItem href="/profile" icon={<User size={13} />} label="Profil Saya" />
                <DropdownItem href="/settings" icon={<Settings size={13} />} label="Pengaturan" />
              </div>
              <div className="border-t border-[var(--color-border)] py-1">
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-subtle)]"
                    role="menuitem"
                  >
                    <LogOut size={13} />
                    Keluar
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-4 py-2 text-xs text-[var(--color-foreground)]/90 transition-colors hover:bg-[var(--color-surface-raised)]"
      role="menuitem"
    >
      <span className="text-[var(--color-muted-foreground)]">{icon}</span>
      {label}
    </Link>
  );
}
