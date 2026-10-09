import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requireAuth } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { KepalaRuangClient } from "./kepala-ruang-client";

export const metadata: Metadata = { title: "Pemetaan Kepala Ruang" };

export default async function KepalaRuangSettingsPage() {
  const currentUser = await requireAuth();

  // Superadmin-only. Enforced server-side regardless of menu visibility.
  if (!currentUser.isSuperAdmin()) redirect("/403");

  const [rooms, mappings, candidates] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, category: true, subcategory: true },
      orderBy: { name: "asc" },
    }),
    prisma.roomKepalaRuang.findMany({
      select: { id: true, roomId: true, userId: true, staffId: true, name: true, nip: true },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: ROLES.KEPALA_RUANG } } },
      },
      select: {
        id: true,
        username: true,
        email: true,
        staff: { select: { id: true, name: true, nip: true } },
      },
      orderBy: { username: "asc" },
    }),
  ]);

  const byRoom = new Map(mappings.map((m) => [m.roomId, m]));
  const roomRows = rooms.map((room) => ({
    ...room,
    kepalaRuang: byRoom.get(room.id) ?? null,
  }));
  const candidateRows = candidates.map((c) => ({
    id: c.id,
    username: c.username,
    email: c.email,
    staffId: c.staff?.id ?? null,
    name: c.staff?.name ?? c.username,
    nip: c.staff?.nip ?? null,
  }));

  return (
    <AppShell
      breadcrumbs={[
        { label: "Pengaturan", href: "/settings" },
        { label: "Kepala Ruang" },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Superadmin",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-5xl">
        <StickyPageHeader
          title="Pemetaan Kepala Ruang"
          description="Tetapkan Kepala Ruang untuk setiap ruangan. Penugasan menentukan siapa yang mereview Borang ruangan tersebut."
          actions={
            <Link
              href="/settings"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ← Pengaturan
            </Link>
          }
        />
        <KepalaRuangClient initialRooms={roomRows} candidates={candidateRows} />
      </div>
    </AppShell>
  );
}
