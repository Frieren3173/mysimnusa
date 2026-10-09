import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { BorangReviewClient } from "@/components/borang/review-client";

export const metadata: Metadata = { title: "Sekretariat Borang" };

export default async function BorangSecretariatPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_ADMIN_REVIEW);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Sekretariat" }]}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "DIKLAT_BORANG",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <StickyPageHeader
          title="Sekretariat Borang"
          description="Proses administratif setelah persetujuan Kepala Ruang: periksa kelengkapan, finalisasi, atau kembalikan untuk revisi."
        />
        <BorangReviewClient mode="secretariat" initialEntries={[]} />
      </div>
    </AppShell>
  );
}
