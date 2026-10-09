import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { LogbookClient } from "./logbook-client";

export const metadata: Metadata = { title: "Logbook Borang" };

export default async function LogbookPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_READ);
  const sp = await searchParams;

  const [rooms, staffList] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, profession: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const perms = {
    canCreate: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_CREATE),
    canUpdate: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_UPDATE),
    canSubmit: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_SUBMIT),
    canDelete: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE),
  };

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Logbook" }]}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <StickyPageHeader title="Logbook Tindakan" description={"Catat tindakan per periode. Kode pasien (Tn.X / Ny.X / By.) dan No. RM dibuat otomatis menyesuaikan ruangan — nama lengkap pasien tidak pernah ditampilkan."} />

        <LogbookClient
          rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
          staffList={staffList}
          myStaffId={currentUser.staff?.id ?? null}
          defaultStatus={sp.status ?? ""}
          {...perms}
        />
      </div>
    </AppShell>
  );
}
