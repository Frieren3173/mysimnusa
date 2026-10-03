import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { ArchiveClient } from "./archive-client";

export const metadata: Metadata = { title: "Arsip Borang" };

export default async function ArchivePage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_READ);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Arsip" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Arsip Borang</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Entri yang disetujui diarsipkan sebagai dokumen final. Arsip bersifat permanen.
          </p>
        </div>
        <ArchiveClient
          canArchive={currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE)}
        />
      </div>
    </AppShell>
  );
}
