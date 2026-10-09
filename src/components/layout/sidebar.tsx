"use client";

import * as React from "react";
import Link from "next/link";
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
import {
  NAV_ITEMS,
  filterNav,
  type NavIconKey,
  type NavItem,
} from "@/lib/nav";

/** Maps the pure nav `icon` key to a lucide element. */
function navIcon(key: NavIconKey | undefined): React.ReactNode {
  switch (key) {
    case "dashboard":
      return <LayoutDashboard size={16} />;
    case "komite":
      return <ShieldCheck size={16} />;
    case "borang":
      return <FileText size={16} />;
    case "diklat":
      return <GraduationCap size={16} />;
    case "administrasi":
      return <Users size={16} />;
    case "pengaturan":
      return <Settings size={16} />;
    default:
      return null;
  }
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Role names for menu visibility. Undefined = show all (back-compat). */
  roles?: string[];
  /** Permission codes for menu visibility. */
  permissions?: string[];
}

export function Sidebar({ collapsed, onToggle, roles, permissions }: SidebarProps) {
  const pathname = usePathname();
  // Undefined `roles` (older callers) keeps the full menu for back-compat.
  const navItems = React.useMemo<NavItem[]>(
    () => (roles ? filterNav(NAV_ITEMS, roles, permissions ?? []) : NAV_ITEMS),
    [roles, permissions],
  );
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
            {/* Collapsed: the 5:1 strip can't fit a 64px rail, so show only the
                first emblem (Lambang Kejaksaan) as a tidy square-ish crop. */}
            <div className="flex h-9 w-full items-center justify-center overflow-hidden rounded-md bg-white">
              <span className="block h-full overflow-hidden" style={{ width: "30px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/logo/logo-2000.webp"
                  srcSet="/assets/logo/logo-1000.webp 1000w, /assets/logo/logo-2000.webp 2000w"
                  sizes="80px"
                  alt="Logo Kejaksaan RI, RS Adhyaksa Jawa Timur, BerAKHLAK, Bangga Melayani Bangsa"
                  width={2000}
                  height={288}
                  decoding="async"
                  // Natural height 36px → width ~250px; clip to the first emblem
                  // (source x<300 of 1999 ≈ 30px at this size).
                  className="h-full w-auto max-w-none object-contain object-left"
                />
              </span>
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
            {/* Row 1: the full 4-logo strip is too wide for a 240px rail, so
                show a left crop of the first two emblems (Kejaksaan + RS
                Adhyaksa) to keep it on one line with the app name. */}
            <div className="flex items-center gap-2.5">
              <span
                className="block h-7 shrink-0 overflow-hidden"
                style={{ width: "58px" }}
                aria-hidden="false"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/logo/logo-2000.webp"
                  srcSet="/assets/logo/logo-1000.webp 1000w, /assets/logo/logo-2000.webp 2000w"
                  sizes="220px"
                  alt="Logo Kejaksaan RI, RS Adhyaksa Jawa Timur, BerAKHLAK, Bangga Melayani Bangsa"
                  width={2000}
                  height={288}
                  decoding="async"
                  // Natural height 28px → width ~194px; the wrapper clips to the
                  // first two emblems (source x<596 of 1999 ≈ 58px at this size).
                  className="h-7 w-auto max-w-none object-contain object-left"
                />
              </span>
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
        {navItems.map((item) => {
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
                <span className="shrink-0">{navIcon(item.icon)}</span>
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
                <span className="shrink-0">{navIcon(item.icon)}</span>
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
