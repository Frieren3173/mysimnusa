import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { KpiCard, Section, AlertItem } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { DocumentStatusBadge, BorangStatusBadge } from "@/components/ui/badge";
import { formatDateShort, daysUntilExpiry } from "@/lib/utils";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { expiringWhere, expiredWhere } from "@/lib/documents";
import { requireAuth } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { appShellUser, appShellVisibility } from "@/lib/app-shell-props";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Users, ShieldCheck, FileText, GraduationCap } from "lucide-react";
import { ServerPagination } from "@/components/ui/server-pagination";
import { DocumentOpenButton } from "@/components/ui/document-open-button";

export const metadata: Metadata = { title: "Overview" };

/** Rows per page for each dashboard document list (server-side pagination). */
const LIST_PER_PAGE = 10;

type DocWithRelations = Prisma.DocumentGetPayload<{
  include: { staff: true; documentType: true };
}>;

/** Maps a document row to the shape the shared document modal expects. */
function toFile(doc: DocWithRelations) {
  return {
    id: doc.id,
    filename: doc.filename,
    storageKey: doc.storageKey,
    legacyDriveUrl: doc.legacyDriveUrl,
    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
    isLifetime: doc.isLifetime,
    hasExpiry: doc.documentType.hasExpiry,
    documentTypeCode: doc.documentType.code,
    documentTypeName: doc.documentType.name,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ expPage?: string; expiredPage?: string }>;
}) {
  const currentUser = await requireAuth();
  const sp = await searchParams;

  // METRIC DEFINITION (single source of truth for banner + card + lists):
  //   "Dokumen mendekati kedaluwarsa" = non-lifetime documents with an expiry
  //   date in [today, today + EXPIRY_WARNING_DAYS].
  //   "Dokumen expired"               = non-lifetime documents with an expiry
  //   date before today.
  //   Both use the SAME predicate for `count()` and the paginated `findMany`,
  //   and exclude documents without an expiry date (non-expiring types /
  //   lifetime). Counts are real `count()` calls — never a limited page length.
  const now = new Date();
  const in90Days = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
  const expWhere = expiringWhere({ from: now, to: in90Days });
  const expdWhere = expiredWhere(now);

  const expPage = Math.max(1, Number(sp.expPage) || 1);
  const expiredPage = Math.max(1, Number(sp.expiredPage) || 1);

  let staffCount = 0;
  let expiringDocsCount = 0;
  let expiredDocsCount = 0;
  let pendingBorangCount = 0;
  let upcomingTrainingsCount = 0;
  let expiringDocs: DocWithRelations[] = [];
  let expiredDocs: DocWithRelations[] = [];
  let pendingBorang: Prisma.BorangEntryGetPayload<{ include: { staff: true } }>[] = [];

  try {
    const [
      staffTotal,
      expTotal,
      expList,
      expiredTotal,
      expiredList,
      pendingB,
      trainings,
      recentBorang,
    ] = await Promise.all([
      prisma.staff.count({ where: { isActive: true } }),
      prisma.document.count({ where: expWhere }),
      prisma.document.findMany({
        where: expWhere,
        include: { staff: true, documentType: true },
        // Urgency: soonest expiry first (ascending date = most urgent).
        orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
        skip: (expPage - 1) * LIST_PER_PAGE,
        take: LIST_PER_PAGE,
      }),
      prisma.document.count({ where: expdWhere }),
      prisma.document.findMany({
        where: expdWhere,
        include: { staff: true, documentType: true },
        // Urgency: most-overdue first for expired documents.
        orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
        skip: (expiredPage - 1) * LIST_PER_PAGE,
        take: LIST_PER_PAGE,
      }),
      prisma.borangEntry.count({
        where: { status: { in: ["SUBMITTED", "VERIFICATION"] } },
      }),
      prisma.training.count({
        where: {
          startDate: { gte: now },
          status: { in: ["PUBLISHED", "ONGOING"] },
        },
      }),
      prisma.borangEntry.findMany({
        where: { status: { in: ["SUBMITTED", "VERIFICATION"] } },
        include: { staff: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    staffCount = staffTotal;
    expiringDocsCount = expTotal;
    expiredDocsCount = expiredTotal;
    pendingBorangCount = pendingB;
    upcomingTrainingsCount = trainings;
    expiringDocs = expList;
    expiredDocs = expiredList;
    pendingBorang = recentBorang;
  } catch {
    // DB might not be connected yet in dev — fallback to 0s gracefully
  }

  const breadcrumbs = [{ label: "Overview" }];
  const userInfo = appShellUser(currentUser);

  return (
    <AppShell breadcrumbs={breadcrumbs} user={userInfo} {...appShellVisibility(currentUser)}>
      <div className="mx-auto max-w-7xl space-y-8 stagger-children">
        <StickyPageHeader
          title={`Selamat datang, ${userInfo.name}`}
          description="Dashboard Terpadu MYSIMNUSA — Pantau seluruh operasional hari ini"
          actions={
            <>
              <Link href="/borang/entry">
                <Button variant="secondary" size="sm">
                  + Input Borang
                </Button>
              </Link>
              <Link href="/komite/staff/new">
                <Button variant="primary" size="sm">
                  + Tambah SDM
                </Button>
              </Link>
            </>
          }
        />

        {/* Attention Center — philosophy: "What needs attention right now?" */}
        {(expiringDocsCount > 0 || expiredDocsCount > 0 || pendingBorangCount > 0) && (
          <Section title="Perlu Perhatian Anda" description="Tindakan yang membutuhkan respon segera">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {expiringDocsCount > 0 && (
                <AlertItem
                  type="warning"
                  title="Dokumen Mendekati Kadaluarsa"
                  description={`${expiringDocsCount} dokumen berakhir dalam ${EXPIRY_WARNING_DAYS} hari.`}
                  count={expiringDocsCount}
                  action={
                    <Link href="#expiring" className="font-medium text-amber-700 underline">
                      Lihat Daftar →
                    </Link>
                  }
                />
              )}
              {expiredDocsCount > 0 && (
                <AlertItem
                  type="danger"
                  title="Dokumen Sudah Kadaluarsa"
                  description={`${expiredDocsCount} dokumen telah melewati masa berlaku.`}
                  count={expiredDocsCount}
                  action={
                    <Link href="#expired" className="font-medium text-red-700 underline">
                      Lihat Daftar →
                    </Link>
                  }
                />
              )}
              {pendingBorangCount > 0 && (
                <AlertItem
                  type="info"
                  title="Borang Menunggu Verifikasi"
                  description={`${pendingBorangCount} logbook tindakan perlu diverifikasi.`}
                  count={pendingBorangCount}
                  action={
                    <Link href="/borang/verification" className="font-medium text-blue-700 underline">
                      Verifikasi →
                    </Link>
                  }
                />
              )}
            </div>
          </Section>
        )}

        {/* Primary KPIs — first card is the focal point (staff total) */}
        <Section title="Ringkasan Operasional">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard
              title="Total Tenaga Aktif"
              value={staffCount}
              subtitle="Perawat & Bidan terdaftar"
              icon={<Users size={18} />}
              size="large"
              className="col-span-2 border-[var(--color-primary)]/25 bg-[var(--color-primary-subtle)]/60 lg:col-span-1"
            />
            <KpiCard
              title="Dokumen Akan Berakhir"
              value={expiringDocsCount}
              subtitle={`Dalam ${EXPIRY_WARNING_DAYS} hari`}
              variant={expiringDocsCount > 0 ? "warning" : "default"}
              icon={<ShieldCheck size={18} />}
            />
            <KpiCard
              title="Dokumen Expired"
              value={expiredDocsCount}
              subtitle="Sudah melewati masa berlaku"
              variant={expiredDocsCount > 0 ? "danger" : "default"}
              icon={<ShieldCheck size={18} />}
            />
            <KpiCard
              title="Borang Pending"
              value={pendingBorangCount}
              subtitle="Menunggu approval"
              variant={pendingBorangCount > 0 ? "warning" : "default"}
              icon={<FileText size={18} />}
            />
            <KpiCard
              title="Pelatihan Mendatang"
              value={upcomingTrainingsCount}
              subtitle="Bulan ini"
              icon={<GraduationCap size={18} />}
            />
          </div>
        </Section>

        {/* Expiring documents — separate, paginated, urgency-sorted list. */}
        <Section
          title="Dokumen Mendekati Kadaluarsa"
          description={`${expiringDocsCount} dokumen berakhir dalam ${EXPIRY_WARNING_DAYS} hari (urut paling mendesak)`}
          action={
            <Link href="/komite/legalitas" className="text-xs font-medium text-[var(--color-primary)] underline-offset-4 transition-colors hover:underline">
              Semua legalitas →
            </Link>
          }
        >
          <div id="expiring">
            <Table scroll>
              <TableHeader>
                <TableRow>
                  <Th>Nama Tenaga</Th>
                  <Th>Jenis Dokumen</Th>
                  <Th>Tanggal Kedaluwarsa</Th>
                  <Th>Sisa</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Aksi</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringDocs.length === 0 ? (
                  <TableRow>
                    <Td colSpan={6} className="py-10 text-center text-xs text-[var(--color-muted-foreground)]">
                      Tidak ada dokumen yang mendekati kadaluarsa.
                    </Td>
                  </TableRow>
                ) : (
                  expiringDocs.map((doc) => {
                    const days = daysUntilExpiry(doc.expiryDate);
                    return (
                      <TableRow key={doc.id}>
                        <Td className="font-medium text-[var(--color-foreground)]">
                          {doc.staff.name}
                          <span className="block text-[10px] text-slate-400">
                            {doc.staff.nip ?? "—"}
                          </span>
                        </Td>
                        <Td className="text-xs">{doc.documentType.name}</Td>
                        <Td className="text-xs">{formatDateShort(doc.expiryDate)}</Td>
                        <Td className="text-xs tabular-nums">
                          {days === null ? "—" : days <= 0 ? `${Math.abs(days)} hari` : `${days} hari`}
                        </Td>
                        <Td>
                          <DocumentStatusBadge status="EXPIRING" />
                        </Td>
                        <Td className="text-right">
                          <DocumentOpenButton
                            staffName={doc.staff.name}
                            documentLabel={doc.documentType.name}
                            file={toFile(doc)}
                          />
                        </Td>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <ServerPagination
              basePath="/dashboard"
              params={expiredPage > 1 ? { expiredPage: String(expiredPage) } : {}}
              page={expPage}
              perPage={LIST_PER_PAGE}
              total={expiringDocsCount}
            />
          </div>
        </Section>

        {/* Expired documents — separate, paginated, most-overdue first. */}
        <Section
          title="Dokumen Sudah Kadaluarsa"
          description={`${expiredDocsCount} dokumen melewati masa berlaku (urut paling lama)`}
          action={
            <Link href="/komite/legalitas" className="text-xs font-medium text-[var(--color-primary)] underline-offset-4 transition-colors hover:underline">
              Semua legalitas →
            </Link>
          }
        >
          <div id="expired">
            <Table scroll>
              <TableHeader>
                <TableRow>
                  <Th>Nama Tenaga</Th>
                  <Th>Jenis Dokumen</Th>
                  <Th>Tanggal Kedaluwarsa</Th>
                  <Th>Lewat</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Aksi</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiredDocs.length === 0 ? (
                  <TableRow>
                    <Td colSpan={6} className="py-10 text-center text-xs text-[var(--color-muted-foreground)]">
                      Tidak ada dokumen yang sudah kadaluarsa.
                    </Td>
                  </TableRow>
                ) : (
                  expiredDocs.map((doc) => {
                    const days = daysUntilExpiry(doc.expiryDate);
                    return (
                      <TableRow key={doc.id}>
                        <Td className="font-medium text-[var(--color-foreground)]">
                          {doc.staff.name}
                          <span className="block text-[10px] text-slate-400">
                            {doc.staff.nip ?? "—"}
                          </span>
                        </Td>
                        <Td className="text-xs">{doc.documentType.name}</Td>
                        <Td className="text-xs">{formatDateShort(doc.expiryDate)}</Td>
                        <Td className="text-xs tabular-nums">
                          {days === null ? "—" : `${Math.abs(days)} hari`}
                        </Td>
                        <Td>
                          <DocumentStatusBadge status="EXPIRED" />
                        </Td>
                        <Td className="text-right">
                          <DocumentOpenButton
                            staffName={doc.staff.name}
                            documentLabel={doc.documentType.name}
                            file={toFile(doc)}
                          />
                        </Td>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <ServerPagination
              basePath="/dashboard"
              params={expPage > 1 ? { expPage: String(expPage) } : {}}
              page={expiredPage}
              perPage={LIST_PER_PAGE}
              total={expiredDocsCount}
            />
          </div>
        </Section>

        {/* Pending Borang Verification */}
        <Section
          title="Borang Menunggu Verifikasi"
          description="Tindakan klinis yang diajukan staf"
          action={
            <Link href="/borang/verification" className="text-xs font-medium text-[var(--color-primary)] underline-offset-4 transition-colors hover:underline">
              Semua borang →
            </Link>
          }
        >
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Staff</Th>
                <Th>Pasien</Th>
                <Th>Tindakan</Th>
                <Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingBorang.length === 0 ? (
                <TableRow>
                  <Td colSpan={4} className="py-10 text-center text-xs text-[var(--color-muted-foreground)]">
                    Tidak ada antrean verifikasi borang.
                  </Td>
                </TableRow>
              ) : (
                pendingBorang.map((b) => (
                  <TableRow key={b.id}>
                    <Td className="font-medium text-[var(--color-foreground)]">{b.staff.name}</Td>
                    <Td className="font-mono text-xs">{b.patientIdentifier}</Td>
                    <Td>{b.actionType}</Td>
                    <Td>
                      <BorangStatusBadge status={b.status} />
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Section>

        {/* Quick Module Navigation Cards */}
        <Section title="Akses Cepat Modul">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ModuleCard
              href="/komite"
              title="Komite Keperawatan"
              description="Data SDM, STR/SIP, kompetensi, dan arsip berkas perawat/bidan"
              icon={<ShieldCheck size={20} />}
            />
            <ModuleCard
              href="/borang"
              title="Borang Tindakan"
              description="Digitalisasi logbook tindakan klinis dan alur verifikasi berjenjang"
              icon={<FileText size={20} />}
            />
            <ModuleCard
              href="/diklat"
              title="Diklat & Sertifikasi"
              description="Manajemen pelatihan, presensi peserta, penilaian, dan e-sertifikat"
              icon={<GraduationCap size={20} />}
            />
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

/**
 * Calm, on-brand module shortcut card.
 *
 * Motion is limited to a purposeful hover: a small lift + border darken, all on
 * transform/colour (never layout), 200ms ease-out, and disabled under
 * `prefers-reduced-motion`. No window-level scroll animation is involved.
 */
function ModuleCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_2px_rgba(15,40,70,0.04)] transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_10px_24px_-12px_rgba(15,40,70,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] transition-colors duration-200 group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)] motion-reduce:transition-none">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
          {description}
        </p>
      </div>
    </Link>
  );
}


