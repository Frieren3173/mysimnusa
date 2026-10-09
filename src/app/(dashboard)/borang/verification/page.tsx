import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { VerificationClient } from "./verification-client";

export const metadata: Metadata = { title: "Verifikasi Borang" };

export default async function VerificationPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_READ);

  const perms = {
    canVerify: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_VERIFY),
    canApprove: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_APPROVE),
    canReject: currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_REJECT),
  };

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Verifikasi" }]}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <StickyPageHeader title="Verifikasi Borang" description={"Alur: Terkirim → Verifikasi → Disetujui. Penolakan wajib mencantumkan alasan."} />
        <VerificationClient {...perms} />
      </div>
    </AppShell>
  );
}
