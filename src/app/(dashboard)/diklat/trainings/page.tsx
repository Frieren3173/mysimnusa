import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { TrainingsClient } from "./trainings-client";

export const metadata: Metadata = { title: "Pelatihan" };

export default async function TrainingsPage() {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);

  const trainings = await prisma.training.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { participants: true, certificates: true } } },
  });

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Pelatihan" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daftar Pelatihan</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Buat dan kelola pelatihan. Klik baris untuk mengelola peserta, presensi, nilai, dan sertifikat.
          </p>
        </div>
        <TrainingsClient
          trainings={trainings.map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            description: t.description,
            startDate: t.startDate.toISOString(),
            endDate: t.endDate.toISOString(),
            location: t.location,
            capacity: t.capacity,
            status: t.status,
            participantCount: t._count.participants,
            certificateCount: t._count.certificates,
          }))}
          canCreate={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE)}
          canUpdate={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE)}
          canDelete={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE)}
        />
      </div>
    </AppShell>
  );
}
