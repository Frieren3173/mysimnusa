import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
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
        <StickyPageHeader title="Arsip Borang" description={"Entri yang disetujui diarsipkan sebagai dokumen final. Arsip bersifat permanen."} />
        <ArchiveClient
          canArchive={currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE)}
        />
      </div>
    </AppShell>
  );
}
