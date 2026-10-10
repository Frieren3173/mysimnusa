import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, KpiCard, Card, CardContent, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge, TrainingStatusBadge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { getStaffHistory } from "@/lib/diklat/history";
import { trainingStatusLabel } from "@/lib/diklat/shared";
import { ArrowLeft, Award, CalendarRange } from "lucide-react";

export const metadata: Metadata = { title: "Detail Riwayat Pelatihan" };

export default async function RiwayatDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const { staffId } = await params;
  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(sp.year) || currentYear;

  const history = await getStaffHistory(staffId, year);
  if (!history) notFound();

  const years = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, year])).sort((a, b) => b - a);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Diklat", href: "/diklat" },
        { label: "Riwayat Pelatihan", href: "/diklat/riwayat" },
        { label: history.staff.name },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title={history.staff.name}
          description={`${history.staff.profession} · ${history.staff.roomName ?? "Tanpa ruangan"} · NIP ${history.staff.nip ?? "—"}`}
          actions={
            <Link href="/diklat/riwayat" className="text-xs font-medium text-[var(--color-primary)] underline-offset-4 hover:underline">
              <ArrowLeft size={12} className="inline" /> Kembali
            </Link>
          }
          toolbar={
            <form action={`/diklat/riwayat/${staffId}`} className="flex flex-wrap items-center gap-2">
              <select name="year" aria-label="Filter tahun" defaultValue={String(year)} className="h-8 rounded-md border border-[var(--color-border)] bg-white px-2 text-xs">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Terapkan
              </button>
            </form>
          }
        />

        <Section title={`Ringkasan ${year}`}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard title="Total JPL" value={`${history.totalJpl} JPL`} />
            <KpiCard title="Kegiatan Berkualifikasi" value={history.qualifyingActivities} />
            <KpiCard title="Target Tahunan" value={`${history.targetJpl} JPL`} />
            <KpiCard
              title="Status"
              value={history.totalJpl >= history.targetJpl ? "Memenuhi" : "Belum"}
              variant={history.totalJpl >= history.targetJpl ? "success" : "default"}
            />
          </div>
        </Section>

        <Section title="Riwayat Kegiatan" description={`${history.items.length} kegiatan pada ${year}`}>
          <Card>
            <CardContent className="p-0">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th>Kegiatan</Th>
                    <Th>Tanggal</Th>
                    <Th className="text-right">JPL Kegiatan</Th>
                    <Th className="text-right">JPL Diperoleh</Th>
                    <Th>Kehadiran</Th>
                    <Th className="text-right">Nilai</Th>
                    <Th>Tes</Th>
                    <Th>Sertifikat</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.length === 0 ? (
                    <TableRow>
                      <Td colSpan={8}>
                        <EmptyState title="Belum ada riwayat" description={`Tidak ada kegiatan pada tahun ${year}.`} icon={<CalendarRange size={28} />} />
                      </Td>
                    </TableRow>
                  ) : (
                    history.items.map((it) => (
                      <TableRow key={it.trainingId}>
                        <Td className="text-xs font-medium">
                          <Link href={`/diklat/trainings/${it.trainingId}`} className="text-blue-700 hover:underline">
                            {it.title}
                          </Link>
                          <span className="mt-0.5 block">
                            <TrainingStatusBadge status={it.trainingStatus} />
                          </span>
                        </Td>
                        <Td className="text-xs whitespace-nowrap">
                          {new Date(it.startDate).toLocaleDateString("id-ID")}
                        </Td>
                        <Td className="text-right text-xs tabular-nums">{it.activityJpl ?? "—"}</Td>
                        <Td className="text-right text-xs tabular-nums">{it.jplEarned}</Td>
                        <Td>
                          <Badge variant={it.attended ? "active" : "default"}>
                            {it.attended ? "Hadir" : trainingStatusLabel(it.trainingStatus) === "Dibatalkan" ? "Dibatalkan" : "Tidak Hadir"}
                          </Badge>
                        </Td>
                        <Td className="text-right text-xs tabular-nums">
                          {it.score != null ? `${it.score}${it.grade ? ` (${it.grade})` : ""}` : "—"}
                        </Td>
                        <Td className="text-xs">{it.testCompleted ? "Selesai" : "—"}</Td>
                        <Td className="text-xs font-mono">
                          {it.certificateNumber ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <Award size={12} /> {it.certificateNumber}
                            </span>
                          ) : (
                            "—"
                          )}
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
