import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { BorangReviewClient } from "@/components/borang/review-client";

export const metadata: Metadata = { title: "Review Kepala Ruang" };

export default async function BorangReviewPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_KARU_REVIEW);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Review Kepala Ruang" }]}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Kepala Ruang",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <StickyPageHeader
          title="Review Kepala Ruang"
          description="Periksa pengajuan Borang dari ruangan yang ditugaskan kepada Anda. Setujui atau minta revisi dengan catatan."
        />
        <BorangReviewClient mode="karu" initialEntries={[]} />
      </div>
    </AppShell>
  );
}
