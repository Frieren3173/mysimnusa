import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { CurriculumClient } from "./curriculum-client";

export const metadata: Metadata = { title: "Kurikulum Diklat" };

export default async function CurriculumListPage() {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);

  const programs = await prisma.curriculumProgram.findMany({
    orderBy: [{ year: "desc" }, { name: "asc" }],
    take: 200,
    include: { _count: { select: { items: true } }, items: { select: { status: true } } },
  });

  const canManage = currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE);

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Kurikulum" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title="Kurikulum & Modul Pembelajaran Tahunan"
          description="Kelola program kurikulum tahunan, unggah dokumen, dan pantau progres realisasinya."
        />
        <Section>
          <CurriculumClient
            programs={programs.map((p) => ({
              id: p.id,
              year: p.year,
              name: p.name,
              description: p.description,
              status: p.status,
              hasDocument: Boolean(p.documentStorageKey),
              documentName: p.documentName,
              itemCount: p._count.items,
              itemStatuses: p.items.map((i) => i.status),
            }))}
            canManage={canManage}
          />
        </Section>
      </div>
    </AppShell>
  );
}
