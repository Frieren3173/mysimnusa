import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { RoomActionsClient } from "./room-actions-client";

export const metadata: Metadata = { title: "Detail Ruangan" };

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_SETTINGS);
  const { id } = await params;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) notFound();

  const [links, allActions] = await Promise.all([
    prisma.roomNursingAction.findMany({
      where: { roomId: id },
      select: { nursingActionId: true },
    }),
    prisma.nursingAction.findMany({
      select: { id: true, code: true, name: true, category: true, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Borang", href: "/borang" },
        { label: "Master Ruangan", href: "/borang/master/ruangan" },
        { label: room.name },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Master Ruangan</h1>
            <Link
              href="/borang/master/ruangan"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              ← Kembali
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur tindakan keperawatan yang tersedia untuk ruangan ini — tindakan yang dicentang
            muncul pada pilihan Logbook saat ruangan dipilih.
          </p>
        </div>

        <RoomActionsClient room={room} allActions={allActions} assignedIds={links.map((l) => l.nursingActionId)} />
      </div>
    </AppShell>
  );
}
