import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { RoomsMasterClient } from "./rooms-master-client";

export const metadata: Metadata = { title: "Master Ruangan" };

export default async function MasterRoomsPage() {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_SETTINGS);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Master Ruangan" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <StickyPageHeader title="Master Ruangan" description={"Daftar ruangan yang digunakan Logbook. Ruangan aktif muncul pada pilihan Logbook — atur tindakan keperawatan yang tersedia per ruangan."} />

        <RoomsMasterClient />
      </div>
    </AppShell>
  );
}
