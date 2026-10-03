import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { formatDateShort } from "@/lib/utils";
import { StaffDetailButton } from "./staff-detail-modal";

export const metadata: Metadata = { title: "Data SDM — Komite Keperawatan" };

function ageFrom(dob: Date | null): string {
  if (!dob) return "—";
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return `${age} tahun`;
}

export default async function StaffListPage({
  searchParams,
}: {
  searchParams: Promise<{ profession?: string; status?: string; search?: string; room?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_READ);
  const params = await searchParams;

  let staffList: Prisma.StaffGetPayload<{ include: { room: true } }>[] = [];
  let rooms: Awaited<ReturnType<typeof prisma.room.findMany>> = [];
  try {
    const where: Prisma.StaffWhereInput = {};
    if (params.profession) where.profession = params.profession;
    if (params.status) where.employmentStatus = params.status;
    if (params.room) where.roomId = params.room;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { nip: { contains: params.search } },
      ];
    }

    [staffList, rooms] = await Promise.all([
      prisma.staff.findMany({
        where,
        include: { room: true },
        orderBy: { name: "asc" },
        take: 50,
      }),
      prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);
  } catch {
    // DB not ready yet fallback
  }

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Data SDM" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Data SDM Perawat &amp; Bidan</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola master profil, penempatan ruangan, dan kelengkapan dokumen seluruh tenaga
            </p>
          </div>
          <Link href="/komite/staff/new">
            <Button variant="primary" size="sm">
              + Tambah Tenaga Baru
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <form
          action="/komite/staff"
          className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border border-slate-200"
        >
          <input
            type="search"
            name="search"
            placeholder="Cari nama atau NIP..."
            defaultValue={params.search}
            className="h-8 rounded border border-slate-200 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
          />
          <select
            name="profession"
            defaultValue={params.profession ?? ""}
            className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700 bg-white"
          >
            <option value="">Semua Profesi</option>
            <option value="Perawat">Perawat</option>
            <option value="Bidan">Bidan</option>
          </select>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700 bg-white"
          >
            <option value="">Semua Status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Tidak Aktif</option>
            <option value="RESIGNED">Resigned</option>
          </select>
          <select
            name="room"
            defaultValue={params.room ?? ""}
            className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700 bg-white"
          >
            <option value="">Semua Ruangan</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" size="sm">
            Terapkan
          </Button>
          <Button type="button" variant="secondary" size="sm" className="ml-auto">
            Ekspor Data
          </Button>
        </form>

        {/* Staff Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <Th className="w-12">No</Th>
              <Th>Nama Lengkap</Th>
              <Th>NIP</Th>
              <Th>Ruangan</Th>
              <Th>Tanggal Lahir</Th>
              <Th>Umur</Th>
              <Th>Alamat Lengkap</Th>
              <Th>Nomor Handphone</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.length === 0 ? (
              <TableRow>
                <Td colSpan={8} className="text-center text-xs text-slate-400 py-12">
                  Belum ada data SDM yang terdaftar. Tambahkan tenaga baru atau import via Migration Center.
                </Td>
              </TableRow>
            ) : (
              staffList.map((s, i) => (
                <TableRow key={s.id}>
                  <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500">
                        {s.name.charAt(0)}
                      </span>
                      <StaffDetailButton staffId={s.id}>{s.name}</StaffDetailButton>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-slate-500">{s.nip ?? "—"}</Td>
                  <Td className="text-xs">{s.room?.name ?? "—"}</Td>
                  <Td className="text-xs">{formatDateShort(s.dateOfBirth)}</Td>
                  <Td className="text-xs tabular-nums">{ageFrom(s.dateOfBirth)}</Td>
                  <Td className="text-xs max-w-[200px] truncate" title={s.address ?? undefined}>
                    {s.address ?? "—"}
                  </Td>
                  <Td className="font-mono text-xs">{s.phone ?? "—"}</Td>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
