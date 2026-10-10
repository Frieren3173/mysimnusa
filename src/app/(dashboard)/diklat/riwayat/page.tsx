import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, Card, CardContent, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { searchInputClass, filterSelectClass } from "@/components/layout/page-toolbar";
import { ServerPagination } from "@/components/ui/server-pagination";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getJplRows } from "@/lib/diklat/jpl";
import { History } from "lucide-react";

export const metadata: Metadata = { title: "Riwayat Pelatihan" };

const PER_PAGE = 25;

export default async function RiwayatListPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; roomId?: string; search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(params.year) || currentYear;
  const roomId = params.roomId?.trim() || "";
  const search = params.search?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);

  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const allRows = await getJplRows({ year, roomId: roomId || null, search: search || null }).catch(() => []);
  const total = allRows.length;
  const rows = allRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const years = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, year])).sort((a, b) => b - a);

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Riwayat Pelatihan" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <StickyPageHeader
          title="Riwayat Pelatihan per Staf"
          description={`Rekap keikutsertaan & JPL tahun ${year}. Klik nama staf untuk detail riwayat.`}
          actions={<span className="text-xs text-slate-500">{total} staf</span>}
          toolbar={
            <form action="/diklat/riwayat" className="flex flex-wrap items-center gap-2">
              <select name="year" aria-label="Filter tahun" defaultValue={String(year)} className={filterSelectClass}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select name="roomId" aria-label="Filter ruangan" defaultValue={roomId} className={`${filterSelectClass} max-w-[220px]`}>
                <option value="">Semua Ruangan</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input type="search" name="search" aria-label="Cari staf" defaultValue={search} placeholder="Cari nama / NIP…" className={searchInputClass("w-52")} />
              <button type="submit" className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
                Terapkan
              </button>
            </form>
          }
        />

        <Section>
          <Card>
            <CardContent className="p-0">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th className="w-12">No</Th>
                    <Th>Nama Staf</Th>
                    <Th>Ruangan</Th>
                    <Th className="text-right">Kegiatan</Th>
                    <Th className="text-right">Total JPL</Th>
                    <Th className="text-right">Progres</Th>
                    <Th>Status</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <Td colSpan={7}>
                        <EmptyState title="Tidak ada staf" description="Tidak ada staf yang cocok dengan filter." icon={<History size={28} />} />
                      </Td>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => (
                      <TableRow key={r.staffId}>
                        <Td className="text-xs tabular-nums text-slate-500">{(page - 1) * PER_PAGE + i + 1}</Td>
                        <Td className="text-xs font-medium">
                          <Link href={`/diklat/riwayat/${r.staffId}?year=${year}`} className="text-blue-700 hover:underline">
                            {r.staffName}
                          </Link>
                          {r.nip && <span className="block font-mono text-[10px] text-slate-400">{r.nip}</span>}
                        </Td>
                        <Td className="text-xs">{r.roomName ?? "—"}</Td>
                        <Td className="text-right text-xs tabular-nums">{r.activities}</Td>
                        <Td className="text-right text-xs tabular-nums">{r.totalJpl}</Td>
                        <Td className="text-right text-xs tabular-nums">{r.progressPct}%</Td>
                        <Td>
                          <Badge variant={r.met ? "active" : "default"}>{r.met ? "Memenuhi" : "Belum"}</Badge>
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ServerPagination
                basePath="/diklat/riwayat"
                params={{ year: String(year), roomId: roomId || undefined, search: search || undefined }}
                page={page}
                perPage={PER_PAGE}
                total={total}
              />
            </CardContent>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
