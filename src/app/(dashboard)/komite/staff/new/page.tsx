import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
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
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">Tambah Tenaga Baru</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Data identitas, pendidikan, dan kompetensi klinis tenaga kesehatan.
          </p>
        </div>
        <StaffForm rooms={rooms} competencies={competencies} />
      </div>
    </AppShell>
  );
}
