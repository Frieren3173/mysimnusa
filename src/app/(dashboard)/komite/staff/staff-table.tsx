"use client";

import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StaffDetailButton } from "./staff-detail-modal";
import { StaffPhoto } from "./staff-photo";
import { Loader2 } from "lucide-react";

/**
 * Staff table with server-side pagination and infinite scroll.
 *
 * - The filter toolbar stays visible (sticky) while the table body scrolls.
 * - The initial page is rendered on the server and passed in as `initialRows`,
 *   so there is no loading flash; subsequent pages are fetched from
 *   `/api/komite/staff` as the user scrolls.
 * - Filters are applied server-side against the whole dataset.
 */

export type StaffRow = {
  id: string;
  name: string;
  nip: string | null;
  roomName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  phone: string | null;
  photoDocId: string | null;
};

type ApiRow = {
  id: string;
  name: string;
  nip: string | null;
  dateOfBirth: string | null;
  address: string | null;
  phone: string | null;
  room: { name: string } | null;
  documents?: { id: string; documentType: { code: string } }[];
};

const PAGE_SIZE = 50;

function ageFrom(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function mapRow(r: ApiRow): StaffRow {
  const foto = r.documents?.find((d) => d.documentType.code === "FOTO");
  return {
    id: r.id,
    name: r.name,
    nip: r.nip,
    roomName: r.room?.name ?? null,
    dateOfBirth: r.dateOfBirth,
    address: r.address,
    phone: r.phone,
    photoDocId: foto?.id ?? null,
  };
}

export function StaffTable({
  initialRows,
  initialTotal,
  filters,
  rooms,
}: {
  initialRows: StaffRow[];
  initialTotal: number;
  filters: { search: string; profession: string; status: string; room: string };
  rooms: { id: string; name: string }[];
}) {
  const [rows, setRows] = React.useState<StaffRow[]>(initialRows);
  const [total, setTotal] = React.useState(initialTotal);
  const [loading, setLoading] = React.useState(false);
  const state = filters;
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const pageRef = React.useRef(1);

  // The server component remounts this component when filters change (via a
  // `key` prop), so the initial rows are always in sync with the filters — no
  // state-syncing effect is required.

  const hasMore = rows.length < total;

  const loadMore = React.useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = pageRef.current + 1;
      const q = new URLSearchParams({ page: String(nextPage), perPage: String(PAGE_SIZE) });
      if (state.search) q.set("search", state.search);
      if (state.profession) q.set("profession", state.profession);
      if (state.status) q.set("status", state.status);
      if (state.room) q.set("room", state.room);

      const res = await fetch(`/api/komite/staff?${q.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        const incoming: StaffRow[] = (json.data.data as ApiRow[]).map(mapRow);
        const metaTotal =
          json.data.pagination?.total ?? json.data.meta?.total ?? json.data.total;
        setRows((prev) => [...prev, ...incoming]);
        if (typeof metaTotal === "number") setTotal(metaTotal);
        else setTotal((prev) => prev + incoming.length);
        pageRef.current = nextPage;
      }
    } catch {
      // silent; user can scroll again to retry
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, state]);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div className="flex flex-col">
      {/* Sticky filter toolbar */}
      <form
        action="/komite/staff"
        className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-3 backdrop-blur"
      >
        <input
          type="search"
          name="search"
          placeholder="Cari nama atau NIP…"
          defaultValue={filters.search}
          className="h-8 w-56 rounded border border-slate-200 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          name="profession"
          defaultValue={filters.profession}
          className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
        >
          <option value="">Semua Profesi</option>
          <option value="PERAWAT">Perawat</option>
          <option value="BIDAN">Bidan</option>
        </select>
        <select
          name="status"
          defaultValue={filters.status}
          className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Tidak Aktif</option>
          <option value="RESIGNED">Resigned</option>
        </select>
        <select
          name="room"
          defaultValue={filters.room}
          className="h-8 max-w-[200px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
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
        <span className="ml-auto text-xs text-slate-500">
          {rows.length} dari {total} tenaga
        </span>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <Th className="w-12">No</Th>
            <Th>Nama Lengkap</Th>
            <Th>NIP</Th>
            <Th>Ruangan</Th>
            <Th>Tanggal Lahir</Th>
            <Th className="text-center">Umur</Th>
            <Th>Alamat Lengkap</Th>
            <Th>Nomor Handphone</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <Td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                Belum ada data SDM yang cocok. Ubah filter atau tambahkan tenaga baru.
              </Td>
            </TableRow>
          ) : (
            rows.map((s, i) => (
              <TableRow key={s.id}>
                <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <StaffPhoto name={s.name} photoDocId={s.photoDocId} />
                    <StaffDetailButton staffId={s.id}>{s.name}</StaffDetailButton>
                  </div>
                </Td>
                <Td className="font-mono text-xs text-slate-500">{s.nip ?? "—"}</Td>
                <Td className="text-xs">{s.roomName ?? "—"}</Td>
                <Td className="text-xs whitespace-nowrap">{formatDate(s.dateOfBirth)}</Td>
                <Td className="text-center text-xs tabular-nums">{ageFrom(s.dateOfBirth)}</Td>
                <Td className="max-w-[240px] text-xs text-slate-600">
                  <span className="line-clamp-2" title={s.address ?? undefined}>
                    {s.address ?? "—"}
                  </span>
                </Td>
                <Td className="font-mono text-xs">{s.phone ?? "—"}</Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Infinite-scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading ? (
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Memuat data berikutnya…
          </span>
        ) : hasMore ? (
          <span className="text-xs text-slate-300">Gulir untuk memuat berikutnya</span>
        ) : (
          <span className="text-xs text-slate-300">Semua {total} tenaga ditampilkan</span>
        )}
      </div>
    </div>
  );
}
