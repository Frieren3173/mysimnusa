import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { StaffTable, type StaffRow } from "./staff-table";

export const metadata: Metadata = { title: "Data SDM — Komite Keperawatan" };

const PAGE_SIZE = 50;

export default async function StaffListPage({
  searchParams,
}: {
  searchParams: Promise<{ profession?: string; status?: string; search?: string; room?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_READ);
  const params = await searchParams;

  const filters = {
    search: params.search?.trim() ?? "",
    profession: params.profession ?? "",
    status: params.status ?? "",
    room: params.room ?? "",
  };

  let rows: StaffRow[] = [];
  let total = 0;
  let databaseTotal = 0;
  let rooms: { id: string; name: string }[] = [];

  try {
    const where: Prisma.StaffWhereInput = {};
    if (filters.profession) where.profession = filters.profession;
    if (filters.status) where.employmentStatus = filters.status;
    if (filters.room) where.roomId = filters.room;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { nip: { contains: filters.search, mode: "insensitive" } },
        { profession: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
        { room: { is: { name: { contains: filters.search, mode: "insensitive" } } } },
      ];
    }

    const [staffList, count, roomList, dbTotal] = await Promise.all([
      prisma.staff.findMany({
        where,
        include: {
          room: { select: { name: true } },
          // Only the FOTO document is needed for the avatar; keep the payload small.
          documents: {
            where: { documentType: { code: "FOTO" } },
            select: { id: true, documentType: { select: { code: true } } },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
        take: PAGE_SIZE,
      }),
      prisma.staff.count({ where }),
      prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      // Total staff in the database (unfiltered) — used so the counter can show
      // "N dari <databaseTotal>" instead of "0 dari 0" for an empty result.
      prisma.staff.count(),
    ]);

    total = count;
    databaseTotal = dbTotal;
    rooms = roomList;
    rows = staffList.map((s) => ({
      id: s.id,
      name: s.name,
      nip: s.nip,
      roomName: s.room?.name ?? null,
      dateOfBirth: s.dateOfBirth?.toISOString() ?? null,
      address: s.address,
      phone: s.phone,
      photoDocId: s.documents[0]?.id ?? null,
    }));
  } catch {
    // DB not ready yet fallback
  }

  return (
    <AppShell
      breadcrumbs={[
        { label: "Komite", href: "/komite" },
        { label: "Data SDM" },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <StaffTable
          key={`${filters.search}|${filters.profession}|${filters.status}|${filters.room}`}
          initialRows={rows}
          initialTotal={total}
          filters={filters}
          rooms={rooms}
          databaseTotal={databaseTotal}
          action={
            <Link href="/komite/staff/new">
              <Button variant="primary" size="sm">
                + Tambah Tenaga Baru
              </Button>
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
