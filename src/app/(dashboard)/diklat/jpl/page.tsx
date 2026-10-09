import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, KpiCard, Card, CardContent, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerPagination } from "@/components/ui/server-pagination";
import { searchInputClass, filterSelectClass } from "@/components/layout/page-toolbar";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getJplRows, summarizeJpl, ANNUAL_JPL_TARGET } from "@/lib/diklat/jpl";
import { CalendarRange, Download, Target, Users, CheckCircle2, XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard JPL" };

/** Rows per page for the JPL staff table (KPIs always use the FULL population). */
const PER_PAGE = 25;

function clampBar(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

export default async function JplDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; roomId?: string; search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(params.year) || currentYear;
  const roomId = params.roomId?.trim() || "";
  const search = params.search?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);

  const [rooms, rows] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getJplRows({ year, roomId: roomId || null, search: search || null }).catch(() => []),
  ]);

  // KPI + total from the FULL filtered population (never the current page).
  const summary = summarizeJpl(rows);
  summary.year = year;

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Year options: currentYear ±2 + any years present in data.
  const years = Array.from(
    new Set([currentYear - 2, currentYear - 1, currentYear, currentYear + 1, year]),
  ).sort((a, b) => b - a);

  const exportHref = `/api/diklat/jpl/export?year=${year}${roomId ? `&roomId=${roomId}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Dashboard JPL" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title="Dashboard Pemenuhan JPL"
          description={`Target ${ANNUAL_JPL_TARGET} JPL per staf per tahun kalender (1 Januari – 31 Desember).`}
          actions={
            <a href={exportHref}>
              <Button variant="secondary" size="sm">
                <Download size={14} /> Ekspor Excel
              </Button>
            </a>
          }
          toolbar={
            <form action="/diklat/jpl" className="flex flex-wrap items-center gap-2">
              <select name="year" aria-label="Filter tahun" defaultValue={String(year)} className={filterSelectClass}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select name="roomId" aria-label="Filter ruangan" defaultValue={roomId} className={`${filterSelectClass} max-w-[220px]`}>
                <option value="">Semua Ruangan</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input
                type="search"
                name="search"
                aria-label="Cari staf"
                defaultValue={search}
                placeholder="Cari nama / NIP…"
                className={searchInputClass("w-52")}
              />
              <button
                type="submit"
                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Terapkan
              </button>
            </form>
          }
        />

        <Section title="Ringkasan" description={`Tahun ${year}`}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard title="Total Staf" value={summary.staffCount} icon={<Users size={18} />} />
            <KpiCard title="Memenuhi Target" value={summary.metCount} variant={summary.metCount > 0 ? "success" : "default"} icon={<CheckCircle2 size={18} />} />
            <KpiCard title="Belum Memenuhi" value={summary.notMetCount} variant={summary.notMetCount > 0 ? "warning" : "default"} icon={<XCircle size={18} />} />
            <KpiCard title="Total JPL Terkumpul" value={`${summary.totalJpl} JPL`} subtitle={`Target/staf: ${ANNUAL_JPL_TARGET} JPL`} icon={<Target size={18} />} />
          </div>
        </Section>

        <Section title="Daftar Pemenuhan per Staf">
          <Card>
            <CardContent className="p-0">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th className="w-12">No</Th>
                    <Th>Nama Staf</Th>
                    <Th>Ruangan</Th>
                    <Th className="text-right">Total JPL</Th>
                    <Th className="text-right">Sisa JPL</Th>
                    <Th className="min-w-[160px]">Progres</Th>
                    <Th>Status</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <Td colSpan={7}>
                        <EmptyState
                          title="Tidak ada staf"
                          description="Tidak ada staf yang cocok dengan filter, atau data belum tersedia."
                          icon={<CalendarRange size={28} />}
                        />
                      </Td>
                    </TableRow>
                  ) : (
                    pageRows.map((r, i) => (
                      <TableRow key={r.staffId}>
                        <Td className="text-xs tabular-nums text-slate-500">{(page - 1) * PER_PAGE + i + 1}</Td>
                        <Td className="text-xs font-medium">
                          <Link href={`/diklat/riwayat/${r.staffId}?year=${year}`} className="text-blue-700 hover:underline">
                            {r.staffName}
                          </Link>
                          {r.nip && <span className="block font-mono text-[10px] text-slate-400">{r.nip}</span>}
                        </Td>
                        <Td className="text-xs">{r.roomName ?? "—"}</Td>
                        <Td className="text-right text-xs tabular-nums">{r.totalJpl}</Td>
                        <Td className="text-right text-xs tabular-nums">{r.remainingJpl}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-[var(--color-primary)]"
                                style={{ width: `${clampBar(r.progressPct)}%` }}
                              />
                            </div>
                            <span className="text-[11px] tabular-nums text-slate-500">{r.progressPct}%</span>
                          </div>
                        </Td>
                        <Td>
                          <Badge variant={r.met ? "active" : "default"}>{r.met ? "Memenuhi" : "Belum"}</Badge>
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ServerPagination
                basePath="/diklat/jpl"
                params={{ year: String(year), roomId: roomId || undefined, search: search || undefined }}
                page={page}
                perPage={PER_PAGE}
                total={total}
              />
            </CardContent>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
