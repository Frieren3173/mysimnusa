import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { TrainingManager } from "../training-manager";

export const metadata: Metadata = { title: "Penilaian Diklat" };

export default async function ParticipantsPage() {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);

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
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Penilaian" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Penilaian Diklat</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Beri nilai dan grade untuk setiap peserta pelatihan.
          </p>
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
          defaultTab="assessment"
          perms={{
            manageParticipants: currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS),
            manageAttendance: currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE),
            manageAssessment: currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE),
            issueCertificate: currentUser.hasPermission(PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE),
          }}
        />
      </div>
    </AppShell>
  );
}
