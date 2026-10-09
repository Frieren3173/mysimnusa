import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Section, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deriveValidity, isDocumentAvailable, VALIDITY_META } from "@/lib/documents";
import { formatDateShort, daysUntilExpiry } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { StickyPageHeader } from "@/components/layout/page-header";
import { searchInputClass } from "@/components/layout/page-toolbar";
import { StaffDetailButton } from "../staff/staff-detail-modal";
import { DocumentBadgeButton } from "@/components/ui/document-badge-button";
import { ServerPagination } from "@/components/ui/server-pagination";

export const metadata: Metadata = { title: "Legalitas — Komite Keperawatan" };

const TABS = [
  { code: "STR", label: "STR" },
  { code: "SIP", label: "SIP" },
  { code: "BTCLS", label: "BTCLS" },
  { code: "ACLS", label: "ACLS" },
];

const PER_PAGE = 50;

export default async function LegalitasPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_LICENSE_READ);
  const params = await searchParams;
  const activeType = (params.type ?? "STR").toUpperCase();
  const statusFilter = params.status?.toUpperCase();
  const search = params.search?.trim();
  const page = Math.max(1, Number(params.page) || 1);

  let docs: Prisma.DocumentGetPayload<{
    include: { staff: { include: { room: true } }; documentType: true };
  }>[] = [];
  try {
    docs = await prisma.document.findMany({
      where: {
        documentType: { code: activeType },
        ...(search
          ? { staff: { name: { contains: search, mode: "insensitive" as const } } }
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
    derived: deriveValidity({
      expiryDate: d.expiryDate,
      isLifetime: d.isLifetime,
      hasExpiry: d.documentType.hasExpiry,
    }),
  }));
  const filtered = statusFilter ? withStatus.filter((d) => d.derived === statusFilter) : withStatus;

  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const counts = {
    ACTIVE: withStatus.filter((d) => d.derived === "ACTIVE").length,
    EXPIRING: withStatus.filter((d) => d.derived === "EXPIRING").length,
    EXPIRED: withStatus.filter((d) => d.derived === "EXPIRED").length,
    LIFETIME: withStatus.filter((d) => d.derived === "LIFETIME").length,
    NO_EXPIRY: withStatus.filter((d) => d.derived === "NO_EXPIRY").length,
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
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-7xl">
        <StickyPageHeader
          title="Legalitas Tenaga"
          description="Status STR, SIP, BTCLS, dan ACLS beserta masa berlaku"
          toolbar={
            <div className="space-y-3">
              {/* Document-type tabs */}
              <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5">
                {TABS.map((t) => (
                  <Link
                    key={t.code}
                    href={`/komite/legalitas?type=${t.code}`}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeType === t.code ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>

              {/* Status summary + search */}
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
                            : "Seumur Hidup"}{" "}
                    <span className="tabular-nums">{counts[s]}</span>
                  </Link>
                ))}
                {statusFilter && (
                  <Link href={`/komite/legalitas?type=${activeType}`} className="px-2 text-xs text-slate-500 hover:underline">
                    Hapus filter
                  </Link>
                )}
                <form className="ml-auto" action="/komite/legalitas">
                  <input type="hidden" name="type" value={activeType} />
                  <input
                    type="search"
                    name="search"
                    aria-label="Cari tenaga berdasarkan nama"
                    defaultValue={search ?? ""}
                    placeholder="Cari nama…"
                    className={searchInputClass("w-52")}
                  />
                </form>
              </div>
            </div>
          }
        />

        <Section>
          <Table scroll>
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
                pageRows.map((d, i) => {
                  const days = daysUntilExpiry(d.expiryDate);
                  const meta = VALIDITY_META[d.derived];
                  // All files this staff has for THIS document type, so the modal
                  // can list multiple files (never a random pick).
                  const filesForType = withStatus
                    .filter((x) => x.staff.id === d.staff.id)
                    .map((x) => ({
                      id: x.id,
                      filename: x.filename,
                      storageKey: x.storageKey,
                      legacyDriveUrl: x.legacyDriveUrl,
                      expiryDate: x.expiryDate ? x.expiryDate.toISOString() : null,
                      isLifetime: x.isLifetime,
                      hasExpiry: x.documentType.hasExpiry,
                      documentTypeCode: x.documentType.code,
                      documentTypeName: x.documentType.name,
                    }));
                  return (
                    <TableRow key={d.id}>
                      <Td className="text-xs tabular-nums text-slate-500">{(page - 1) * PER_PAGE + i + 1}</Td>
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
                        <DocumentBadgeButton
                          staffName={d.staff.name}
                          title={d.documentType.name}
                          files={filesForType}
                          label={
                            activeType === "STR" && d.derived === "ACTIVE"
                              ? "Belum Seumur Hidup"
                              : meta.label
                          }
                          variant={
                            !isDocumentAvailable(d) ? "missing" : meta.variant
                          }
                          title_attr={
                            isDocumentAvailable(d)
                              ? `${d.documentType.name} — ${meta.label} · klik untuk buka dokumen`
                              : `${d.documentType.name} — berkas belum tersedia`
                          }
                        />
                      </Td>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <ServerPagination
            basePath="/komite/legalitas"
            params={{ type: activeType, status: statusFilter, search }}
            page={page}
            perPage={PER_PAGE}
            total={total}
          />
        </Section>
      </div>
    </AppShell>
  );
}
