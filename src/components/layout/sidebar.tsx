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
        "flex flex-col border-r border-slate-200 bg-white transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60"
      )}
      aria-label="Navigasi utama"
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
        {collapsed ? (
          <Image
            src="/logo-rsajt.png"
            alt="Logo RSAJT"
            width={1430}
            height={721}
            priority
            className="h-7 w-auto"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logo-rsajt.png"
              alt="Logo RSAJT"
              width={1430}
              height={721}
              priority
              className="h-9 w-auto shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">RSAJT</p>
              <p className="text-[10px] text-slate-500 leading-tight">
                Nursing Midwifery Management
              </p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors ml-auto"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        >
          {collapsed ? <Menu size={16} /> : <Menu size={16} />}
        </button>
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
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100",
                  active
                    ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600 rounded-l-none"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100",
                  isActiveGroup
                    ? "text-slate-900 font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
                aria-expanded={!collapsed ? isOpen : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "shrink-0 text-slate-400 transition-transform duration-150",
                        isOpen && "rotate-180"
                      )}
                    />
                  </>
                )}
              </button>

              {!collapsed && isOpen && item.children && (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-200 pl-3">
                  {item.children.map((child) => {
                    const childActive =
                      pathname === child.href ||
                      pathname.startsWith((child.href ?? "") + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href!}
                        className={cn(
                          "flex items-center rounded-md px-2 py-1.5 text-sm transition-colors duration-100",
                          childActive
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="text-[10px] text-slate-400">v2.0 · RSAJT</p>
        </div>
      )}
    </aside>
  );
}
