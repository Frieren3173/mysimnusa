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
  let rooms: { id: string; name: string }[] = [];

  try {
    const where: Prisma.StaffWhereInput = {};
    if (filters.profession) where.profession = filters.profession;
    if (filters.status) where.employmentStatus = filters.status;
    if (filters.room) where.roomId = filters.room;
    if (filters.search) {
      where.OR = [{ name: { contains: filters.search } }, { nip: { contains: filters.search } }];
    }

    const [staffList, count, roomList] = await Promise.all([
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
    ]);

    total = count;
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Data SDM Perawat &amp; Bidan</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Kelola master profil, penempatan ruangan, dan kelengkapan dokumen seluruh tenaga
            </p>
          </div>
          <Link href="/komite/staff/new">
            <Button variant="primary" size="sm">
              + Tambah Tenaga Baru
            </Button>
          </Link>
        </div>

        <StaffTable
          key={`${filters.search}|${filters.profession}|${filters.status}|${filters.room}`}
          initialRows={rows}
          initialTotal={total}
          filters={filters}
          rooms={rooms}
        />
      </div>
    </AppShell>
  );
}
