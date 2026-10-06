"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  GraduationCap,
  Settings,
  ShieldCheck,
  ChevronDown,
  Menu,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: <LayoutDashboard size={16} />,
  },
  {
    label: "Komite Keperawatan dan Kebidanan",
    icon: <ShieldCheck size={16} />,
    children: [
      { label: "Dashboard", href: "/komite" },
      { label: "Data SDM", href: "/komite/staff" },
      { label: "Legalitas", href: "/komite/legalitas" },
      { label: "Kompetensi", href: "/komite/kompetensi" },
      { label: "Dokumen", href: "/komite/dokumen" },
    ],
  },
  {
    label: "Borang",
    icon: <FileText size={16} />,
    children: [
      { label: "Dashboard", href: "/borang" },
      { label: "Logbook", href: "/borang/logbook" },
      { label: "Master Ruangan", href: "/borang/master/ruangan" },
      { label: "Master Tindakan", href: "/borang/master/tindakan" },
      { label: "Verifikasi", href: "/borang/verification" },
      { label: "Arsip", href: "/borang/archive" },
    ],
  },
  {
    label: "Diklat",
    icon: <GraduationCap size={16} />,
    children: [
      { label: "Dashboard", href: "/diklat" },
      { label: "Pelatihan", href: "/diklat/trainings" },
      { label: "Peserta", href: "/diklat/participants" },
      { label: "Presensi", href: "/diklat/attendance" },
      { label: "Penilaian", href: "/diklat/assessment" },
      { label: "Sertifikat", href: "/diklat/certificates" },
    ],
  },
  {
    label: "Administrasi",
    icon: <Users size={16} />,
    children: [
      { label: "Pengguna", href: "/admin/users" },
      { label: "Audit Log", href: "/admin/audit" },
    ],
  },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: <Settings size={16} />,
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    // Auto-open the group that contains current path
    const initial = new Set<string>();
    NAV_ITEMS.forEach((item) => {
      if (item.children?.some((c) => pathname.startsWith(c.href ?? ""))) {
        initial.add(item.label);
      }
    });
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ease-[var(--ease-standard)] shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
      aria-label="Navigasi utama"
    >
      {/* Branding */}
      <div className={cn("border-b border-[var(--color-border)] py-3", collapsed ? "px-2" : "px-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {/* Collapsed: give the logo breathing room and keep its natural
                aspect ratio (never squash it to fit a narrow slot). */}
            <div className="flex h-9 w-full items-center justify-center overflow-hidden rounded-md bg-white">
              <Image
                src="/logo-rsajt.png"
                alt="Logo Rumah Sakit Adhyaksa Jawa Timur"
                width={1430}
                height={721}
                priority
                className="h-auto w-full max-w-[44px] object-contain"
              />
            </div>
            <button
              onClick={onToggle}
              className="flex rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
              aria-label="Perluas sidebar"
            >
              <Menu size={16} />
            </button>
          </div>
        ) : (
          <>
            {/* Row 1: logo + MYSIMNUSA on the same horizontal line */}
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-rsajt.png"
                alt="Logo Rumah Sakit Adhyaksa Jawa Timur"
                width={1430}
                height={721}
                priority
                className="h-8 w-auto shrink-0 object-contain"
              />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-[var(--color-foreground)]">
                MYSIMNUSA
              </p>
              <button
                onClick={onToggle}
                className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
                aria-label="Ciutkan sidebar"
              >
                <Menu size={16} />
              </button>
            </div>
            {/* Row 2: committee subtitle spanning the full container width */}
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
              Komite Keperawatan dan Kebidanan
            </p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          if (item.href) {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary)] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          }

          // Group with children
          const isOpen = openGroups.has(item.label);
          const isActiveGroup = item.children?.some((c) =>
            pathname.startsWith(c.href ?? "")
          );

          return (
            <div key={item.label}>
              <button
                onClick={() => !collapsed && toggleGroup(item.label)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                  isActiveGroup
                    ? "font-semibold text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
                )}
                aria-expanded={!collapsed ? isOpen : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    {/* Up to two lines, no ellipsis — full label stays readable. */}
                    <span className="flex-1 text-left leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                      {item.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "mt-0.5 shrink-0 text-[var(--color-muted-foreground)]/70 transition-transform duration-150",
                        isOpen && "rotate-180"
                      )}
                    />
                  </>
                )}
              </button>

              {!collapsed && isOpen && item.children && (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-[var(--color-border)] pl-3">
                  {item.children.map((child) => {
                    const childActive =
                      pathname === child.href ||
                      pathname.startsWith((child.href ?? "") + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={cn(
                          "flex items-center rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                          childActive
                            ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary)]"
                            : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)]"
                        )}
                        aria-current={childActive ? "page" : undefined}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <p className="text-[10px] text-[var(--color-muted-foreground)]/70">v2.0 · MYSIMNUSA</p>
        </div>
      )}
    </aside>
  );
}
