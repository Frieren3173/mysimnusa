import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { BorangReviewClient } from "@/components/borang/review-client";

export const metadata: Metadata = { title: "Cetak & Selesaikan Borang" };

export default async function BorangPrintPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_PRINT);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Cetak" }]}
      roles={currentUser.roles}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "DIKLAT_BORANG",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <StickyPageHeader
          title="Cetak & Penyelesaian"
          description="Dokumen berstatus Siap Dicetak dapat dipratinjau, dicetak, lalu diselesaikan setelah tanda tangan basah & stempel."
        />
        <BorangReviewClient
          mode="print"
          initialEntries={[]}
          canPrintHref={(e) =>
            `/api/borang/export?staffId=${encodeURIComponent(e.staff.id)}&year=${e.period.slice(0, 4)}`
          }
        />
      </div>
    </AppShell>
  );
}
