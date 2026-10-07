import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { visibleStaffForActor, canSelectOtherStaff } from "@/lib/borang-access";
import { EntryClient } from "./entry-client";

export const metadata: Metadata = { title: "Input Borang" };

export default async function BorangEntryPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_CREATE);

  // Fetch staff with the SAME rule the create API enforces, so the dropdown
  // never offers a choice the server would reject. Non-privileged users only
  // ever receive their own staff row (never the whole list).
  const canSelectStaff = canSelectOtherStaff(currentUser);
  const allStaff = await prisma.staff.findMany({
    where: { isActive: true },
    select: { id: true, name: true, profession: true, roomId: true },
    orderBy: { name: "asc" },
  });
  const staff = visibleStaffForActor(currentUser, allStaff);

  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Input Borang" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="mx-auto max-w-3xl">
        <StickyPageHeader
          title="Input Borang Tindakan"
          description="Catat tindakan keperawatan. Pasien dianonimkan: TN.A atau NY.A (huruf besar)."
        />
        <EntryClient
          staff={staff}
          rooms={rooms}
          defaultStaffId={currentUser.staff?.id ?? ""}
          defaultRoomId={currentUser.staff?.roomId ?? null}
          canSelectStaff={canSelectStaff}
          canSubmit={currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_SUBMIT)}
        />
      </div>
    </AppShell>
  );
}
