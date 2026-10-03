import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { KpiCard, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrainingStatusBadge } from "@/components/ui/badge";
import { GraduationCap, CalendarDays, Award, Users } from "lucide-react";

export const metadata: Metadata = { title: "Diklat" };

export default async function DiklatPage() {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const now = new Date();

  const [totalTrainings, upcoming, participants, certificates, recentTrainings, recentCerts] =
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
    ]);

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pendidikan & Pelatihan</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola pelatihan, peserta, presensi, penilaian, dan sertifikat.
            </p>
          </div>
          <Link href="/diklat/trainings">
            <Button variant="primary" size="sm">
              <GraduationCap size={14} /> Kelola Pelatihan
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Total Pelatihan" value={totalTrainings} icon={<GraduationCap size={16} />} />
          <KpiCard title="Akan Datang" value={upcoming} icon={<CalendarDays size={16} />} />
          <KpiCard title="Total Peserta" value={participants} icon={<Users size={16} />} />
          <KpiCard title="Sertifikat Terbit" value={certificates} icon={<Award size={16} />} />
        </div>

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
      </div>
    </AppShell>
  );
}
