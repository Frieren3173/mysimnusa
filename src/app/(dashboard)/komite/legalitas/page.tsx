import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Section, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge, DocumentStatusBadge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deriveDocumentStatus, formatDateShort, daysUntilExpiry } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { StaffDetailButton } from "../staff/staff-detail-modal";

export const metadata: Metadata = { title: "Legalitas — Komite Keperawatan" };

const TABS = [
  { code: "STR", label: "STR" },
  { code: "SIP", label: "SIP" },
  { code: "BTCLS", label: "BTCLS" },
  { code: "ACLS", label: "ACLS" },
];

export default async function LegalitasPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; search?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_LICENSE_READ);
  const params = await searchParams;
  const activeType = (params.type ?? "STR").toUpperCase();
  const statusFilter = params.status?.toUpperCase();
  const search = params.search?.trim();

  let docs: Prisma.DocumentGetPayload<{
    include: { staff: { include: { room: true } }; documentType: true };
  }>[] = [];
  try {
    docs = await prisma.document.findMany({
      where: {
        documentType: { code: activeType },
        ...(search
          ? { staff: { name: { contains: search } } }
          : {}),
      },
      include: {
        staff: { include: { room: true } },
        documentType: true,
      },
      orderBy: { expiryDate: "asc" },
      take: 500,
    });
  } catch {
    // DB not ready
  }

  const withStatus = docs.map((d) => ({
    ...d,
    derived: deriveDocumentStatus(d.expiryDate, d.isLifetime),
  }));
  const filtered = statusFilter ? withStatus.filter((d) => d.derived === statusFilter) : withStatus;

  const counts = {
    ACTIVE: withStatus.filter((d) => d.derived === "ACTIVE").length,
    EXPIRING: withStatus.filter((d) => d.derived === "EXPIRING").length,
    EXPIRED: withStatus.filter((d) => d.derived === "EXPIRED").length,
    LIFETIME: withStatus.filter((d) => d.derived === "LIFETIME").length,
    MISSING: withStatus.filter((d) => d.derived === "MISSING").length,
  };

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Legalitas" },
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
        <div>
          <h1 className="text-xl font-bold text-slate-900">Legalitas Tenaga</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Status STR, SIP, BTCLS, dan ACLS beserta masa berlaku
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-white p-1.5 rounded-lg border border-slate-200 w-fit">
          {TABS.map((t) => (
            <Link
              key={t.code}
              href={`/komite/legalitas?type=${t.code}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeType === t.code
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* Status summary + filter */}
        <div className="flex flex-wrap items-center gap-2">
          {(["ACTIVE", "EXPIRING", "EXPIRED", "LIFETIME"] as const).map((s) => (
            <Link
              key={s}
              href={`/komite/legalitas?type=${activeType}&status=${s}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {activeType === "STR" && s === "ACTIVE"
                ? "Belum Seumur Hidup"
                : s === "ACTIVE"
                  ? "Aktif"
                  : s === "EXPIRING"
                    ? "Akan Berakhir"
                    : s === "EXPIRED"
                      ? "Expired"
                      : "Seumur Hidup"}
              {" "}
              <span className="tabular-nums">{counts[s]}</span>
            </Link>
          ))}
          {statusFilter && (
            <Link
              href={`/komite/legalitas?type=${activeType}`}
              className="text-xs text-slate-500 hover:underline px-2"
            >
              Hapus filter
            </Link>
          )}
          <form className="ml-auto" action="/komite/legalitas">
            <input type="hidden" name="type" value={activeType} />
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Cari nama..."
              className="h-8 rounded border border-slate-200 px-3 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <Th>Nomor Dokumen</Th>
                <Th>Berlaku Hingga</Th>
                <Th>Sisa</Th>
                <Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <Td colSpan={7}>
                    <EmptyState
                      title={`Belum ada data ${activeType}`}
                      description="Dokumen akan muncul setelah data diunggah atau dimigrasi."
                      icon={<ShieldCheck size={32} />}
                    />
                  </Td>
                </TableRow>
              ) : (
                filtered.map((d, i) => {
                  const days = daysUntilExpiry(d.expiryDate);
                  return (
                    <TableRow key={d.id}>
                      <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                      <Td className="text-sm font-medium">
                        <StaffDetailButton staffId={d.staff.id}>{d.staff.name}</StaffDetailButton>
                        <span className="block text-[10px] text-slate-400">{d.staff.profession}</span>
                      </Td>
                      <Td className="text-xs">{d.staff.room?.name ?? "—"}</Td>
                      <Td className="font-mono text-xs">
                        {d.number ?? (d.legacyDriveUrl ? "via Drive" : "—")}
                      </Td>
                      <Td className="text-xs">
                        {d.isLifetime ? (
                          <Badge variant="lifetime">Seumur Hidup</Badge>
                        ) : (
                          formatDateShort(d.expiryDate)
                        )}
                      </Td>
                      <Td className="text-xs tabular-nums">
                        {d.isLifetime || days === null
                          ? "—"
                          : days < 0
                          ? `${Math.abs(days)} hari lewat`
                          : `${days} hari`}
                      </Td>
                      <Td>
                        <DocumentStatusBadge
                          status={d.derived}
                          label={
                            activeType === "STR" && d.derived === "ACTIVE"
                              ? "Belum Seumur Hidup"
                              : undefined
                          }
                        />
                      </Td>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Section>
      </div>
    </AppShell>
  );
}
