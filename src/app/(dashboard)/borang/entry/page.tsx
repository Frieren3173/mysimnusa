import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { EntryClient } from "./entry-client";

export const metadata: Metadata = { title: "Input Borang" };

export default async function BorangEntryPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_CREATE);

  const [staff, rooms] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, profession: true, roomId: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang", href: "/borang" }, { label: "Input Borang" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Input Borang Tindakan</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catat tindakan keperawatan. Pasien dianonimkan: <span className="font-mono">TN.A</span> atau{" "}
            <span className="font-mono">NY.A</span> (huruf besar).
          </p>
        </div>
        <EntryClient
          staff={staff}
          rooms={rooms}
          defaultStaffId={currentUser.staff?.id ?? ""}
          defaultRoomId={currentUser.staff?.roomId ?? null}
          canSubmit={currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_SUBMIT)}
        />
      </div>
    </AppShell>
  );
}
