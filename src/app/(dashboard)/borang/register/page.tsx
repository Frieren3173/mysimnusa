import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { PatientRegisterClient } from "./patient-register-client";

export const metadata: Metadata = { title: "Register Pasien" };

/**
 * Patient register management — for the Kepala Ruang of a room (or Superadmin).
 *
 * The page loads ONLY the rooms the actor may manage (their RoomKepalaRuang
 * assignments; Superadmin sees all active rooms). The actual authorization is
 * enforced in the API; this list only shapes the UI.
 */
export default async function PatientRegisterPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_KARU_REVIEW);

  const isSuperAdmin = currentUser.isSuperAdmin();
  const rooms = isSuperAdmin
    ? await prisma.room.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : await prisma.roomKepalaRuang
        .findMany({
          where: { userId: currentUser.id },
          select: { room: { select: { id: true, name: true, isActive: true } } },
        })
        .then((rows) => rows.map((r) => r.room).filter((r): r is { id: string; name: string; isActive: boolean } => !!r && r.isActive));

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Register Pasien" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Kepala Ruang",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <StickyPageHeader
          title="Register Pasien"
          description="Unggah dan kelola daftar pasien untuk ruangan Anda. Staff memilih pasien dari register ini saat mengisi Logbook Borang."
        />
        <PatientRegisterClient rooms={rooms} />
      </div>
    </AppShell>
  );
}
