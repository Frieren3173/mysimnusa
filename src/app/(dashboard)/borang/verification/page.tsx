import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
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
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Verifikasi Borang</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Alur: Terkirim → Verifikasi → Disetujui. Penolakan wajib mencantumkan alasan.
          </p>
        </div>
        <VerificationClient {...perms} />
      </div>
    </AppShell>
  );
}
