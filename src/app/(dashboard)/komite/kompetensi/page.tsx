import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Section, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Award } from "lucide-react";
import { StaffDetailButton } from "../staff/staff-detail-modal";
import { CompetencyCellButton } from "./competency-cell";

export const metadata: Metadata = { title: "Kompetensi — Komite Keperawatan" };

/**
 * Competency codes are derived from certificate Documents (the authoritative
 * record of what a staff member actually holds) — NOT from a manually filled
 * StaffCompetency table. The mapping mirrors the legacy spreadsheet's
 * "SERTIF KOMPETENSI …" columns.
 */
const COMPETENCY_CODES = [
  "BTCLS",
  "ACLS",
  "BEDAH",
  "ICU",
  "PICU",
  "NICU",
  "HEMODIALISA",
  "CATHLAB",
  "PPGDON",
  "APN",
  "KD",
  "RN",
  "LAINNYA",
] as const;

const PAGE_SIZE = 40;

export default async function KompetensiPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_COMPETENCY_READ);
  const params = await searchParams;
  const search = params.search?.trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  let staffRows: {
    id: string;
    name: string;
    nip: string | null;
    room: { name: string } | null;
  }[] = [];
  let total = 0;
  let docs: { staffId: string; documentTypeId: string; documentType: { code: string }; id: string }[] = [];
  const docTypes: { id: string; code: string }[] = [];

  try {
    const where = search
      ? { OR: [{ name: { contains: search } }, { nip: { contains: search } }] }
      : {};

    [total, staffRows] = await Promise.all([
      prisma.staff.count({ where: { ...where, isActive: true } }),
      prisma.staff.findMany({
        where: { ...where, isActive: true },
        orderBy: { name: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, name: true, nip: true, room: { select: { name: true } } },
      }),
    ]);

    const types = await prisma.documentType.findMany({
      where: { code: { in: [...COMPETENCY_CODES] } },
      select: { id: true, code: true },
    });
    docTypes.push(...types);

    const staffIds = staffRows.map((s) => s.id);
    const typeIds = types.map((t) => t.id);
    if (staffIds.length && typeIds.length) {
      docs = await prisma.document.findMany({
        where: { staffId: { in: staffIds }, documentTypeId: { in: typeIds } },
        select: { id: true, staffId: true, documentTypeId: true, documentType: { select: { code: true } } },
      });
    }
  } catch {
    // DB not ready
  }

  const ownedByStaff = new Map<string, Set<string>>();
  for (const d of docs) {
    const set = ownedByStaff.get(d.staffId) ?? new Set<string>();
    set.add(d.documentType.code);
    ownedByStaff.set(d.staffId, set);
  }

  const typeLabel = (code: string) => code.replace("_", " ");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (p: number) => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/komite/kompetensi${s ? `?${s}` : ""}`;
  };

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
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Matriks Kompetensi</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kepemilikan sertifikat kompetensi per tenaga — berdasarkan dokumen yang tersimpan
            </p>
          </div>
          <form action="/komite/kompetensi">
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Cari nama atau NIP..."
              className="h-8 rounded border border-slate-200 px-3 text-xs w-60 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
        </div>

        <Section>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th className="w-12">No</Th>
                  <Th>Tenaga</Th>
                  <Th>Ruangan</Th>
                  {COMPETENCY_CODES.map((code) => (
                    <Th key={code} className="text-center whitespace-nowrap">
                      {typeLabel(code)}
                    </Th>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffRows.length === 0 ? (
                  <TableRow>
                    <Td colSpan={3 + COMPETENCY_CODES.length}>
                      <EmptyState
                        title="Belum ada data tenaga"
                        description="Data muncul setelah tenaga terdaftar."
                        icon={<Award size={32} />}
                      />
                    </Td>
                  </TableRow>
                ) : (
                  staffRows.map((s, i) => {
                    const owned = ownedByStaff.get(s.id) ?? new Set<string>();
                    return (
                      <TableRow key={s.id}>
                        <Td className="text-xs tabular-nums text-slate-500">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </Td>
                        <Td className="text-sm font-medium whitespace-nowrap">
                          <StaffDetailButton staffId={s.id}>{s.name}</StaffDetailButton>
                        </Td>
                        <Td className="text-xs whitespace-nowrap">{s.room?.name ?? "—"}</Td>
                        {COMPETENCY_CODES.map((code) => {
                          const has = owned.has(code);
                          const docType = docTypes.find((t) => t.code === code);
                          return (
                            <Td key={code} className="text-center">
                              {has && docType ? (
                                <CompetencyCellButton
                                  staffId={s.id}
                                  staffName={s.name}
                                  code={code}
                                  label={typeLabel(code)}
                                >
                                  <span
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-green-600 hover:bg-green-100"
                                    aria-label={`Punya ${typeLabel(code)}`}
                                  >
                                    ✓
                                  </span>
                                </CompetencyCellButton>
                              ) : (
                                <span className="text-slate-300" aria-label={`Tidak punya ${typeLabel(code)}`}>
                                  —
                                </span>
                              )}
                            </Td>
                          );
                        })}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Section>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <p>
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total} tenaga
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildHref(page - 1)}
                  className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                >
                  ← Sebelumnya
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildHref(page + 1)}
                  className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                >
                  Selanjutnya →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
