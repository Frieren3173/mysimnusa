import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Section, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Award } from "lucide-react";
import { StaffDetailButton } from "../staff/staff-detail-modal";
import { CompetencyBadgeButton } from "./competency-cell";

export const metadata: Metadata = { title: "Kompetensi — Komite Keperawatan" };

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
    competencies: { competency: { code: string; name: string } }[];
  }[] = [];
  let total = 0;
  // certificate availability per (staffId|code)
  const certByStaffCode = new Map<string, { id: string; filename: string | null; expiryDate: string | null }>();

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
        select: {
          id: true,
          name: true,
          nip: true,
          room: { select: { name: true } },
          competencies: { select: { competency: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    // Certificate files (Layer 2) for the staff on this page — one query, no N+1.
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
          certByStaffCode.set(key, {
            id: d.id,
            filename: d.filename,
            expiryDate: d.expiryDate?.toISOString() ?? null,
          });
        }
      }
    }
  } catch {
    // DB not ready
  }

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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Matriks Kompetensi</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Seluruh kompetensi per tenaga berdasarkan data sumber. Klik badge untuk melihat sertifikat.
            </p>
          </div>
          <form action="/komite/kompetensi">
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Cari nama atau NIP…"
              className="h-8 w-60 rounded border border-slate-200 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
        </div>

        <Section>
          <div className="overflow-x-auto">
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
                        title="Belum ada data tenaga"
                        description="Data muncul setelah tenaga terdaftar."
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
                        <Td className="text-xs tabular-nums text-slate-500">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </Td>
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
                              {comps.map((c) => {
                                const cert = certByStaffCode.get(`${s.id}|${c.code}`);
                                return (
                                  <CompetencyBadgeButton
                                    key={c.code}
                                    staffName={s.name}
                                    code={c.code}
                                    label={c.name}
                                    certificate={cert ?? null}
                                  />
                                );
                              })}
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <p>
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total} tenaga
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={buildHref(page - 1)} className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
                  ← Sebelumnya
                </a>
              )}
              {page < totalPages && (
                <a href={buildHref(page + 1)} className="rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
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
