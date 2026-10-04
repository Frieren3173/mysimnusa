import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { ActionsMasterClient } from "./actions-master-client";

export const metadata: Metadata = { title: "Master Tindakan Keperawatan" };

export default async function MasterActionsPage() {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_SETTINGS);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Borang", href: "/borang" },
        { label: "Master Tindakan Keperawatan" },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Master Tindakan Keperawatan</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sumber data pilihan Tindakan pada Logbook. Pilihan disaring sesuai ruangan yang
            dipilih — atur relasinya di halaman detail ruangan.
          </p>
        </div>

        <ActionsMasterClient />
      </div>
    </AppShell>
  );
}
