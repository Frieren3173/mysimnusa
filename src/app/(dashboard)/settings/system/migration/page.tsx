import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/authorization";
import { ROLES } from "@/lib/constants";
import { MigrationCenterClient } from "./migration-client";
import { GoogleConnectionCard } from "./google-connection";
import { DriveSyncCard } from "./drive-sync";

export const metadata: Metadata = { title: "Migration Center — Super Admin" };

export default async function MigrationCenterPage() {
  const currentUser = await requireRole(ROLES.SUPER_ADMIN);

  const breadcrumbs = [
    { label: "Pengaturan", href: "/settings" },
    { label: "Sistem Administrasi" },
    { label: "Migration Center" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Super Admin",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Migration Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Migrasi data dan dokumen resmi dari ekosistem Google Sheets dan Google Drive lama.
          </p>
        </div>

        <GoogleConnectionCard />

        <DriveSyncCard />

        <MigrationCenterClient />
      </div>
    </AppShell>
  );
}
