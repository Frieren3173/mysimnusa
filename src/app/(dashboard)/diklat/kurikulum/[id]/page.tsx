import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, KpiCard } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { CURRICULUM_STATUS_LABELS } from "@/lib/diklat/shared";
import { CurriculumDetailClient } from "./curriculum-detail-client";
import { AlertTriangle, CheckCircle2, CalendarClock, PlayCircle, Ban, ListTree } from "lucide-react";

export const metadata: Metadata = { title: "Detail Kurikulum" };

export default async function CurriculumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const { id } = await params;

  const program = await prisma.curriculumProgram.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
        include: {
          trainings: { select: { id: true, title: true, status: true, startDate: true, jpl: true } },
        },
      },
    },
  });
  if (!program) notFound();

  // Linkable trainings of the programme year, not already linked to an item.
  const linkedIds = program.items.flatMap((i) => i.trainings.map((t) => t.id));
  const yearFrom = new Date(Date.UTC(program.year, 0, 1));
  const yearTo = new Date(Date.UTC(program.year + 1, 0, 1));
  const linkable = await prisma.training.findMany({
    where: { startDate: { gte: yearFrom, lt: yearTo }, id: { notIn: linkedIds.length ? linkedIds : ["__none__"] } },
    orderBy: { startDate: "desc" },
    take: 50,
    select: { id: true, title: true, status: true, startDate: true, jpl: true },
  });

  const canManage = currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);

  const statusCounts = { DIRANCANG: 0, TERJADWAL: 0, BERLANGSUNG: 0, SELESAI: 0, DIBATALKAN: 0 } as Record<string, number>;
  for (const it of program.items) statusCounts[it.status] = (statusCounts[it.status] ?? 0) + 1;
  const notRealised = program.items.filter((i) => i.trainings.length === 0 && i.status !== "DIBATALKAN");

  return (
    <AppShell
      breadcrumbs={[
        { label: "Diklat", href: "/diklat" },
        { label: "Kurikulum", href: "/diklat/kurikulum" },
        { label: program.name },
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
          title={program.name}
          description={`Tahun ${program.year} · ${CURRICULUM_STATUS_LABELS[program.status] ?? program.status} · ${program.items.length} materi`}
          actions={
            <Link href="/diklat/kurikulum" className="text-xs font-medium text-[var(--color-primary)] underline-offset-4 hover:underline">
              ← Daftar kurikulum
            </Link>
          }
        />

        <Section title="Progres Kurikulum" description="Status mengikuti keadaan aktual; target yang lewat tidak otomatis dianggap selesai.">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard title="Dirancang" value={statusCounts.DIRANCANG} icon={<ListTree size={18} />} />
            <KpiCard title="Terjadwal" value={statusCounts.TERJADWAL} icon={<CalendarClock size={18} />} />
            <KpiCard title="Berlangsung" value={statusCounts.BERLANGSUNG} variant={statusCounts.BERLANGSUNG > 0 ? "warning" : "default"} icon={<PlayCircle size={18} />} />
            <KpiCard title="Selesai" value={statusCounts.SELESAI} variant={statusCounts.SELESAI > 0 ? "success" : "default"} icon={<CheckCircle2 size={18} />} />
            <KpiCard title="Dibatalkan" value={statusCounts.DIBATALKAN} icon={<Ban size={18} />} />
          </div>
          {notRealised.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>{notRealised.length} materi belum terlaksana</strong> (belum terhubung ke kegiatan realisasi):{" "}
                {notRealised.slice(0, 5).map((i) => i.title).join(", ")}
                {notRealised.length > 5 ? ", …" : ""}
              </span>
            </div>
          )}
        </Section>

        <CurriculumDetailClient
          program={{
            id: program.id,
            year: program.year,
            name: program.name,
            status: program.status,
            description: program.description,
            documentName: program.documentName,
            documentStorageKey: program.documentStorageKey,
          }}
          items={program.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            targetDate: i.targetDate?.toISOString() ?? null,
            targetJpl: i.targetJpl,
            status: i.status,
            trainings: i.trainings.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              startDate: t.startDate.toISOString(),
              jpl: t.jpl,
            })),
          }))}
          canManage={canManage}
          linkableTrainings={linkable.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            startDate: t.startDate.toISOString(),
            jpl: t.jpl,
          }))}
        />
      </div>
    </AppShell>
  );
}
