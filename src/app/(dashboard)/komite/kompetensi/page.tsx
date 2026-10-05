import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Section, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { Award } from "lucide-react";
import { StaffDetailButton } from "../staff/staff-detail-modal";
import { CompetencyBadgeButton } from "./competency-cell";

export const metadata: Metadata = { title: "Kompetensi — Komite Keperawatan" };

/**
 * Competency matrix.
 *
 * Two independent layers are shown:
 *   1. Competency records (from the legacy spreadsheet) — authoritative, always shown.
 *   2. Certificate files (migrated Documents) — optional; a competency with no
 *      migrated file still appears, and clicking it states the file is unavailable.
 *
 * The full matching dataset is rendered (no fixed row cap). The toolbar is sticky
 * and the table header sticks beneath it, so filters stay reachable while scrolling.
 */
export default async function KompetensiPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; competency?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_COMPETENCY_READ);
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const competency = params.competency?.trim() ?? "";

  let staffRows: {
    id: string;
    name: string;
    nip: string | null;
    room: { name: string } | null;
    competencies: { competency: { code: string; name: string } }[];
  }[] = [];
  let competencyTypes: { code: string; name: string }[] = [];
  let grandTotal = 0;
  const certByStaffCode = new Map<string, { id: string; filename: string | null; expiryDate: string | null }>();

  try {
    const where: Prisma.StaffWhereInput = { isActive: true };
    if (search) {
      where.OR = [{ name: { contains: search } }, { nip: { contains: search } }];
    }
    if (competency) {
      where.competencies = { some: { competency: { code: competency } } };
    }

    const [rows, types, allCount] = await Promise.all([
      prisma.staff.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          nip: true,
          room: { select: { name: true } },
          competencies: { select: { competency: { select: { code: true, name: true } } } },
        },
      }),
      prisma.competency.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
      prisma.staff.count({ where: { isActive: true } }),
    ]);
    staffRows = rows;
    competencyTypes = types;
    grandTotal = allCount;

    // Certificate availability for every row on this page — a single query.
    const staffIds = staffRows.map((s) => s.id);
    const codes = [...new Set(staffRows.flatMap((s) => s.competencies.map((c) => c.competency.code)))];
    if (staffIds.length && codes.length) {
      const docs = await prisma.document.findMany({
        where: { staffId: { in: staffIds }, documentType: { code: { in: codes } } },
        select: { id: true, staffId: true, filename: true, expiryDate: true, documentType: { select: { code: true } } },
        orderBy: { createdAt: "asc" },
      });
      for (const d of docs) {
        const key = `${d.staffId}|${d.documentType.code}`;
        if (!certByStaffCode.has(key)) {
          certByStaffCode.set(key, { id: d.id, filename: d.filename, expiryDate: d.expiryDate?.toISOString() ?? null });
        }
      }
    }
  } catch {
    // DB not ready
  }

  return (
    <AppShell
      breadcrumbs={[
        { label: "Komite", href: "/komite" },
        { label: "Kompetensi" },
      ]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Komite",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Matriks Kompetensi</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Seluruh kompetensi per tenaga berdasarkan data sumber. Klik badge untuk melihat sertifikat.
          </p>
        </div>

        {/* Sticky toolbar — filter & search stay visible while the table scrolls */}
        <form
          action="/komite/kompetensi"
          className="sticky top-0 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-3 backdrop-blur"
        >
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Cari nama atau NIP…"
            className="h-8 w-56 rounded border border-slate-200 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            name="competency"
            defaultValue={competency}
            className="h-8 max-w-[220px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="">Semua Kompetensi</option>
            {competencyTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-8 rounded border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Terapkan
          </button>
          <a
            href="/komite/kompetensi"
            className="h-8 rounded border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 leading-8 transition-colors hover:bg-slate-50"
          >
            Reset
          </a>
          <span className="ml-auto text-xs text-slate-500">
            {staffRows.length} dari {grandTotal} data
          </span>
        </form>

        <div className="mt-3">
          <Section>
            {/* Scroll container: the toolbar above stays sticky, and the table
                header sticks to the top of this container while it scrolls. */}
            <div className="max-h-[70vh] overflow-auto rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <Th className="w-12">No</Th>
                    <Th className="min-w-[200px]">Nama</Th>
                    <Th className="whitespace-nowrap">Ruangan</Th>
                    <Th className="min-w-[280px]">Kompetensi</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffRows.length === 0 ? (
                    <TableRow>
                      <Td colSpan={4}>
                        <EmptyState
                          title="Tidak ada data yang cocok"
                          description="Ubah kata kunci pencarian atau filter kompetensi."
                          icon={<Award size={32} />}
                        />
                      </Td>
                    </TableRow>
                  ) : (
                    staffRows.map((s, i) => {
                      const comps = s.competencies
                        .map((c) => c.competency)
                        .sort((a, b) => a.name.localeCompare(b.name));
                      return (
                        <TableRow key={s.id}>
                          <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                          <Td className="text-sm font-medium">
                            <StaffDetailButton staffId={s.id}>{s.name}</StaffDetailButton>
                            {s.nip && <p className="font-mono text-[11px] text-slate-400">{s.nip}</p>}
                          </Td>
                          <Td className="whitespace-nowrap text-xs">{s.room?.name ?? "—"}</Td>
                          <Td>
                            {comps.length === 0 ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {comps.map((c) => (
                                  <CompetencyBadgeButton
                                    key={c.code}
                                    staffName={s.name}
                                    code={c.code}
                                    label={c.name}
                                    certificate={certByStaffCode.get(`${s.id}|${c.code}`) ?? null}
                                  />
                                ))}
                              </div>
                            )}
                          </Td>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
