import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility, diklatManagerPerms } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { TrainingManager } from "../training-manager";

export const metadata: Metadata = { title: "Sertifikat Diklat" };

export default async function DiklatCertificatesPage() {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_CERTIFICATE_READ);

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
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Sertifikat" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <StickyPageHeader title="Sertifikat Diklat" description={"Terbitkan dan pantau sertifikat kelulusan peserta."} />
        <TrainingManager
          trainings={trainings.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            startDate: t.startDate.toISOString(),
            endDate: t.endDate.toISOString(),
            location: t.location,
          }))}
          defaultTab="certificates"
          perms={diklatManagerPerms(currentUser)}
        />
      </div>
    </AppShell>
  );
}
