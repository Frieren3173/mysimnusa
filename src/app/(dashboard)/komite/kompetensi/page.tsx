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

export const metadata: Metadata = { title: "Kompetensi — Komite Keperawatan" };

export default async function KompetensiPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_COMPETENCY_READ);
  const params = await searchParams;
  const search = params.search?.trim();

  let competencies: Awaited<ReturnType<typeof prisma.competency.findMany>> = [];
  let staffRows: Prisma.StaffGetPayload<{
    include: { room: true; competencies: { include: { competency: true } } };
  }>[] = [];

  try {
    competencies = await prisma.competency.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    staffRows = await prisma.staff.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { nip: { contains: search } },
            ],
          }
        : {},
      take: 200,
      orderBy: { name: "asc" },
      include: {
        room: true,
        competencies: { include: { competency: true } },
      },
    });
  } catch {
    // DB not ready
  }

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Kompetensi" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
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
              Kepemilikan sertifikat kompetensi per tenaga (maks 200 baris)
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
          <Table>
            <TableHeader>
              <TableRow>
                <Th className="w-12">No</Th>
                <Th>Tenaga</Th>
                <Th>Ruangan</Th>
                {competencies.map((c) => (
                  <Th key={c.id} className="text-center whitespace-nowrap">
                    {c.name}
                  </Th>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffRows.length === 0 ? (
                <TableRow>
                  <Td colSpan={3 + competencies.length}>
                    <EmptyState
                      title="Belum ada data kompetensi"
                      description="Data muncul setelah tenaga dan kompetensinya terdaftar."
                      icon={<Award size={32} />}
                    />
                  </Td>
                </TableRow>
              ) : (
                staffRows.map((s, i) => {
                  const owned = new Set(s.competencies.map((sc) => sc.competency.code));
                  return (
                    <TableRow key={s.id}>
                      <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                      <Td className="text-sm font-medium whitespace-nowrap">
                        <StaffDetailButton staffId={s.id}>{s.name}</StaffDetailButton>
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{s.room?.name ?? "—"}</Td>
                      {competencies.map((c) => (
                        <Td key={c.id} className="text-center">
                          {owned.has(c.code) ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-50 text-green-600 text-xs font-bold" aria-label={`Punya ${c.name}`}>
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300" aria-label={`Tidak punya ${c.name}`}>
                              —
                            </span>
                          )}
                        </Td>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Section>

        {competencies.length === 0 && (
          <p className="text-xs text-slate-400">
            Master kompetensi belum terisi. Jalankan seed atau tambahkan lewat Pengaturan.
          </p>
        )}
      </div>
    </AppShell>
  );
}
