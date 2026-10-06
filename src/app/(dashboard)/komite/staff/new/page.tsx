import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Tambah Tenaga Baru" };

export default async function NewStaffPage() {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_CREATE);

  const [rooms, competencies] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.competency.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Data SDM", href: "/komite/staff" },
    { label: "Tambah Baru" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
    >
      <div className="mx-auto max-w-4xl">
        <StickyPageHeader
          title="Tambah Tenaga Baru"
          description="Data identitas, pendidikan, dan kompetensi klinis tenaga kesehatan."
        />
        <StaffForm rooms={rooms} competencies={competencies} />
      </div>
    </AppShell>
  );
}
