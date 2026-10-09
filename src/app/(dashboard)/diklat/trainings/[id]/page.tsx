import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility, diklatManagerPerms } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { TrainingManager } from "../../training-manager";

export const metadata: Metadata = { title: "Detail Pelatihan" };

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const { id } = await params;

  const training = await prisma.training.findUnique({ where: { id } });
  if (!training) notFound();

  const trainings = await prisma.training.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      location: true,
    },
  });

  return (
    <AppShell
      breadcrumbs={[
        { label: "Diklat", href: "/diklat" },
        { label: "Pelatihan", href: "/diklat/trainings" },
        { label: training.title },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{training.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">Kelola peserta, presensi, penilaian, dan sertifikat.</p>
        </div>
        <TrainingManager
          trainings={trainings.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            startDate: t.startDate.toISOString(),
            endDate: t.endDate.toISOString(),
            location: t.location,
          }))}
          defaultTab="participants"
          initialTrainingId={training.id}
          perms={diklatManagerPerms(currentUser)}
        />
      </div>
    </AppShell>
  );
}
