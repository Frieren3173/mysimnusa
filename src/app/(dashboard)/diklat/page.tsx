import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Section, KpiCard, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StickyPageHeader } from "@/components/layout/page-header";
import { ServerPagination } from "@/components/ui/server-pagination";
import { searchInputClass, filterSelectClass } from "@/components/layout/page-toolbar";
import { AutoFilter } from "@/components/layout/auto-filter";
import { TrainingStatusBadge } from "@/components/ui/badge";
import { getJplRows, summarizeJpl, ANNUAL_JPL_TARGET } from "@/lib/diklat/jpl";
import { GraduationCap, CalendarDays, Award, Users, CalendarRange, Download, Target, CheckCircle2, XCircle } from "lucide-react";

export const metadata: Metadata = { title: "Diklat" };

/** Rows per page for the JPL staff table (KPIs always use the FULL population). */
const JPL_PER_PAGE = 25;

function clampBar(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

export default async function DiklatPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; roomId?: string; search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const now = new Date();
  const params = await searchParams;
  const currentYear = now.getFullYear();
  const year = Number(params.year) || currentYear;
  const roomId = params.roomId?.trim() || "";
  const search = params.search?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);

  const [totalTrainings, upcoming, participants, certificates, recentTrainings, recentCerts, agenda, rooms, jplRows] =
    await Promise.all([
      prisma.training.count(),
      prisma.training.count({ where: { startDate: { gte: now }, status: { not: "CANCELLED" } } }),
      prisma.trainingParticipant.count(),
      prisma.certificate.count(),
      prisma.training.findMany({
        orderBy: { startDate: "desc" },
        take: 5,
        include: { _count: { select: { participants: true } } },
      }),
      prisma.certificate.findMany({
        orderBy: { issuedDate: "desc" },
        take: 5,
        include: { training: { select: { title: true } } },
      }),
      prisma.training.findMany({
        where: { status: { notIn: ["CANCELLED", "COMPLETED"] }, endDate: { gte: now } },
        orderBy: { startDate: "asc" },
        take: 8,
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          location: true,
          status: true,
          _count: { select: { participants: true } },
        },
      }),
      prisma.room.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      getJplRows({ year, roomId: roomId || null, search: search || null }).catch(() => []),
    ]);

  // ── JPL section (merged from the former /diklat/jpl page) ──
  const summary = summarizeJpl(jplRows);
  summary.year = year;
  const jplTotal = jplRows.length;
  const jplPageRows = jplRows.slice((page - 1) * JPL_PER_PAGE, page * JPL_PER_PAGE);
  const years = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, currentYear + 1, year])).sort((a, b) => b - a);
  const exportHref = `/api/diklat/jpl/export?year=${year}${roomId ? `&roomId=${roomId}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title="Pendidikan & Pelatihan"
          description="Kelola pelatihan, peserta, presensi, penilaian, sertifikat, dan pemenuhan JPL."
          actions={
            <Link href="/diklat/trainings">
              <Button variant="primary" size="sm">
                <GraduationCap size={14} /> Kelola Pelatihan
              </Button>
            </Link>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Total Pelatihan" value={totalTrainings} icon={<GraduationCap size={16} />} />
          <KpiCard title="Akan Datang" value={upcoming} icon={<CalendarDays size={16} />} />
          <KpiCard title="Total Peserta" value={participants} icon={<Users size={16} />} />
          <KpiCard title="Sertifikat Terbit" value={certificates} icon={<Award size={16} />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Jadwal IHT Mendatang &amp; Berlangsung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agenda.length === 0 ? (
              <EmptyState
                title="Tidak ada agenda IHT aktif"
                description="Belum ada kegiatan mendatang atau yang sedang berlangsung."
                icon={<CalendarDays size={24} />}
              />
            ) : (
              agenda.map((t) => {
                const ongoing = t.startDate <= now && t.endDate >= now;
                return (
                  <Link
                    key={t.id}
                    href={`/diklat/trainings/${t.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-medium text-slate-800">
                        {t.title}
                        {ongoing && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Berlangsung
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(t.startDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                        {new Date(t.startDate).toDateString() !== new Date(t.endDate).toDateString()
                          ? ` – ${new Date(t.endDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`
                          : ""}
                        {t.location ? ` · ${t.location}` : ""} · {t._count.participants} peserta
                      </p>
                    </div>
                    <TrainingStatusBadge status={t.status} />
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pelatihan Terbaru</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTrainings.length === 0 ? (
                <EmptyState
                  title="Belum ada pelatihan"
                  description="Buat pelatihan pertama di halaman Pelatihan."
                  icon={<GraduationCap size={24} />}
                />
              ) : (
                recentTrainings.map((t) => (
                  <Link
                    key={t.id}
                    href={`/diklat/trainings/${t.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(t.startDate).toLocaleDateString("id-ID")} ·{" "}
                        {t._count.participants} peserta
                      </p>
                    </div>
                    <TrainingStatusBadge status={t.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sertifikat Terbaru</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentCerts.length === 0 ? (
                <EmptyState
                  title="Belum ada sertifikat"
                  description="Sertifikat terbit dari halaman Penilaian."
                  icon={<Award size={24} />}
                />
              ) : (
                recentCerts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 font-mono truncate">
                        {c.certificateNumber}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{c.training.title}</p>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(c.issuedDate).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── JPL section (merged from Dashboard JPL) ─────────────────────── */}
        <Section
          title="Pemenuhan JPL"
          description={`Target ${ANNUAL_JPL_TARGET} JPL per staf per tahun kalender (1 Januari – 31 Desember).`}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <AutoFilter action="/diklat" className="flex flex-wrap items-center gap-2">
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
            </AutoFilter>
            <a href={exportHref} className="ml-auto">
              <Button variant="secondary" size="sm">
                <Download size={14} /> Ekspor Excel
              </Button>
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard title="Total Staf" value={summary.staffCount} icon={<Users size={18} />} />
            <KpiCard title="Memenuhi Target" value={summary.metCount} variant={summary.metCount > 0 ? "success" : "default"} icon={<CheckCircle2 size={18} />} />
            <KpiCard title="Belum Memenuhi" value={summary.notMetCount} variant={summary.notMetCount > 0 ? "warning" : "default"} icon={<XCircle size={18} />} />
            <KpiCard title="Total JPL Terkumpul" value={`${summary.totalJpl} JPL`} subtitle={`Target/staf: ${ANNUAL_JPL_TARGET} JPL`} icon={<Target size={18} />} />
          </div>

          <Card className="mt-4">
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
                  {jplPageRows.length === 0 ? (
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
                    jplPageRows.map((r, i) => (
                      <TableRow key={r.staffId}>
                        <Td className="text-xs tabular-nums text-slate-500">{(page - 1) * JPL_PER_PAGE + i + 1}</Td>
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
                basePath="/diklat"
                params={{ year: String(year), roomId: roomId || undefined, search: search || undefined }}
                page={page}
                perPage={JPL_PER_PAGE}
                total={jplTotal}
              />
            </CardContent>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
