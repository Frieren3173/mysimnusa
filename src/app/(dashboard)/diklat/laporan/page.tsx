import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/card";
import { searchInputClass, filterSelectClass } from "@/components/layout/page-toolbar";
import { AutoFilter } from "@/components/layout/auto-filter";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  TRAINING_STATUS_LABELS,
  periodToRange,
  trainingStatusLabel,
} from "@/lib/diklat/shared";
import { BarChart3, CalendarRange, GraduationCap, Users } from "lucide-react";

export const metadata: Metadata = { title: "Laporan Diklat" };

export default async function DiklatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string; search?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const params = await searchParams;
  const period = params.period?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const search = params.search?.trim() ?? "";
  const range = periodToRange(period);

  // Filter the activity set once; all report aggregates derive from this same
  // filtered set so totals can never drift from the rows shown.
  const where: Prisma.TrainingWhereInput = {};
  if (status) where.status = status as never;
  if (range) where.startDate = { gte: range.from, lt: range.to };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
    ];
  }

  let trainings: {
    id: string;
    title: string;
    status: string;
    startDate: Date;
    endDate: Date;
    _count: { participants: number; certificates: number; attendance: number };
  }[] = [];
  let perStaff: { staffId: string; name: string; profession: string; activities: number; certificates: number; hadir: number; attendanceRows: number }[] = [];
  const attendanceByTraining = new Map<string, number>();

  try {
    trainings = await prisma.training.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: { _count: { select: { participants: true, certificates: true, attendance: true } } },
    });

    const trainingIds = trainings.map((t) => t.id);
    const participants = trainingIds.length
      ? await prisma.trainingParticipant.findMany({
          where: { trainingId: { in: trainingIds }, status: { not: "CANCELLED" } },
          select: { trainingId: true, staffId: true, staff: { select: { name: true, profession: true } } },
        })
      : [];
    const attendance = trainingIds.length
      ? await prisma.trainingAttendance.findMany({
          where: { trainingId: { in: trainingIds } },
          select: { trainingId: true, staffId: true, status: true },
        })
      : [];
    const certificates = trainingIds.length
      ? await prisma.certificate.findMany({
          where: { trainingId: { in: trainingIds } },
          select: { staffId: true },
        })
      : [];

    // Per-training HADIR counts.
    for (const a of attendance) {
      if (a.status === "HADIR") {
        attendanceByTraining.set(a.trainingId, (attendanceByTraining.get(a.trainingId) ?? 0) + 1);
      }
    }

    // Per-staff roll-up (activities joined, certificates, attendance).
    const staffAgg = new Map<
      string,
      { name: string; profession: string; activities: Set<string>; certificates: number; hadir: number; attendanceRows: number }
    >();
    for (const p of participants) {
      const cur =
        staffAgg.get(p.staffId) ?? {
          name: p.staff.name,
          profession: p.staff.profession,
          activities: new Set<string>(),
          certificates: 0,
          hadir: 0,
          attendanceRows: 0,
        };
      cur.activities.add(p.trainingId);
      staffAgg.set(p.staffId, cur);
    }
    for (const a of attendance) {
      const cur = staffAgg.get(a.staffId);
      if (!cur) continue;
      cur.attendanceRows += 1;
      if (a.status === "HADIR") cur.hadir += 1;
    }
    for (const c of certificates) {
      const cur = staffAgg.get(c.staffId);
      if (cur) cur.certificates += 1;
    }
    perStaff = [...staffAgg.entries()]
      .map(([staffId, v]) => ({
        staffId,
        name: v.name,
        profession: v.profession,
        activities: v.activities.size,
        certificates: v.certificates,
        hadir: v.hadir,
        attendanceRows: v.attendanceRows,
      }))
      .sort((a, b) => b.activities - a.activities || a.name.localeCompare(b.name));
  } catch {
    // DB not ready — render empty report gracefully
  }

  const totalActivities = trainings.length;
  const totalParticipants = trainings.reduce((n, t) => n + t._count.participants, 0);
  const totalCertificates = trainings.reduce((n, t) => n + t._count.certificates, 0);
  const totalHadir = [...attendanceByTraining.values()].reduce((a, b) => a + b, 0);
  const totalAttendance = trainings.reduce((n, t) => n + t._count.attendance, 0);

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Laporan" }]}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title="Laporan Diklat / IHT"
          description="Rekapitulasi kegiatan, peserta, sertifikat, dan kehadiran berdasarkan data aktual."
          toolbar={
            <AutoFilter action="/diklat/laporan" className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                name="period"
                aria-label="Filter periode (bulan mulai)"
                defaultValue={period}
                className={searchInputClass("w-40")}
              />
              <select name="status" aria-label="Filter status" defaultValue={status} className={filterSelectClass}>
                <option value="">Semua Status</option>
                {Object.entries(TRAINING_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="search"
                name="search"
                aria-label="Cari judul kegiatan"
                defaultValue={search}
                placeholder="Cari judul / kategori…"
                className={searchInputClass("w-56")}
              />
              {(period || status || search) && (
                <a href="/diklat/laporan" className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
                  Reset
                </a>
              )}
            </AutoFilter>
          }
        />

        <Section title="Ringkasan" description={period ? `Periode mulai ${period}` : "Seluruh periode"}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard title="Kegiatan" value={totalActivities} icon={<GraduationCap size={18} />} />
            <KpiCard title="Peserta (keikutsertaan)" value={totalParticipants} icon={<Users size={18} />} />
            <KpiCard title="Sertifikat Terbit" value={totalCertificates} icon={<BarChart3 size={18} />} />
            <KpiCard
              title="Kehadiran (Hadir)"
              value={totalHadir}
              subtitle={totalAttendance > 0 ? `dari ${totalAttendance} catatan` : undefined}
              icon={<CalendarRange size={18} />}
            />
          </div>
        </Section>

        <Section title="Rekap per Kegiatan" description={`${trainings.length} kegiatan sesuai filter`}>
          <Card>
            <CardContent className="p-0">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th>Kegiatan</Th>
                    <Th>Status</Th>
                    <Th>Tanggal</Th>
                    <Th className="text-right">Peserta</Th>
                    <Th className="text-right">Sertifikat</Th>
                    <Th className="text-right">Kehadiran</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trainings.length === 0 ? (
                    <TableRow>
                      <Td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                        Tidak ada kegiatan pada filter ini.
                      </Td>
                    </TableRow>
                  ) : (
                    trainings.map((t) => (
                      <TableRow key={t.id}>
                        <Td className="text-xs font-medium">
                          <Link href={`/diklat/trainings/${t.id}`} className="text-blue-700 hover:underline">
                            {t.title}
                          </Link>
                        </Td>
                        <Td className="text-xs">{trainingStatusLabel(t.status)}</Td>
                        <Td className="text-xs text-slate-500 whitespace-nowrap">
                          {new Date(t.startDate).toLocaleDateString("id-ID")} –{" "}
                          {new Date(t.endDate).toLocaleDateString("id-ID")}
                        </Td>
                        <Td className="text-right text-xs tabular-nums">{t._count.participants}</Td>
                        <Td className="text-right text-xs tabular-nums">{t._count.certificates}</Td>
                        <Td className="text-right text-xs tabular-nums">
                          {attendanceByTraining.get(t.id) ?? 0}/{t._count.attendance}
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>

        <Section title="Rekap per Tenaga" description={`${perStaff.length} tenaga dengan keikutsertaan`}>
          <Card>
            <CardHeader>
              <CardTitle>Keikutsertaan &amp; Sertifikat</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th>No</Th>
                    <Th>Tenaga</Th>
                    <Th>Profesi</Th>
                    <Th className="text-right">Kegiatan</Th>
                    <Th className="text-right">Sertifikat</Th>
                    <Th className="text-right">Kehadiran</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perStaff.length === 0 ? (
                    <TableRow>
                      <Td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                        Belum ada data peserta pada filter ini.
                      </Td>
                    </TableRow>
                  ) : (
                    perStaff.map((s, i) => (
                      <TableRow key={s.staffId}>
                        <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                        <Td className="text-xs font-medium">{s.name}</Td>
                        <Td className="text-xs">{s.profession}</Td>
                        <Td className="text-right text-xs tabular-nums">{s.activities}</Td>
                        <Td className="text-right text-xs tabular-nums">{s.certificates}</Td>
                        <Td className="text-right text-xs tabular-nums">
                          {s.attendanceRows > 0 ? `${s.hadir}/${s.attendanceRows}` : "—"}
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
