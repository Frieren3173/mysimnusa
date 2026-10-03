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
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 shrink-0">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-xs text-slate-500">
          <li>
            <Link href="/dashboard" className="hover:text-slate-700 transition-colors">
              Beranda
            </Link>
          </li>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              <li aria-hidden="true" className="text-slate-300">/</li>
              <li className="truncate max-w-[120px] md:max-w-xs">
                {crumb.href && i < breadcrumbs.length - 1 ? (
                  <Link href={crumb.href} className="hover:text-slate-700 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800" aria-current="page">
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
          className="hidden md:flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors w-48"
          aria-label="Buka pencarian global"
        >
          <Search size={14} />
          <span>Cari sesuatu...</span>
          <kbd className="ml-auto text-[10px] bg-white border border-slate-200 rounded px-1">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          aria-label="Notifikasi"
        >
          <Bell size={16} />
          {/* Unread dot */}
          <span
            className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500"
            aria-hidden="true"
          />
        </button>

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 transition-colors"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-label="Menu profil"
          >
            <div className="h-7 w-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="hidden md:block text-left min-w-0">
              <p className="text-xs font-medium text-slate-900 truncate max-w-[120px]">
                {user?.name ?? "Pengguna"}
              </p>
              <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                {user?.role ?? ""}
              </p>
            </div>
            <ChevronDown size={14} className={cn("text-slate-400 hidden md:block transition-transform duration-150", profileOpen && "rotate-180")} />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50"
              role="menu"
            >
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <DropdownItem href="/profile" icon={<User size={13} />} label="Profil Saya" />
                <DropdownItem href="/settings" icon={<Settings size={13} />} label="Pengaturan" />
              </div>
              <div className="border-t border-slate-100 py-1">
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
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
      className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
      role="menuitem"
    >
      <span className="text-slate-400">{icon}</span>
      {label}
    </Link>
  );
}
