import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Section } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { StickyPageHeader } from "@/components/layout/page-header";
import { searchInputClass } from "@/components/layout/page-toolbar";
import { ServerPagination } from "@/components/ui/server-pagination";
import { DokumenClient, type StaffDocGroup } from "./dokumen-client";

export const metadata: Metadata = { title: "Dokumen — Komite Keperawatan" };

const PER_PAGE = 50;

export default async function DokumenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_DOCUMENT_READ);
  const params = await searchParams;
  const search = params.search?.trim();
  const activeType = params.type?.toUpperCase();
  const page = Math.max(1, Number(params.page) || 1);

  let docTypes: Awaited<ReturnType<typeof prisma.documentType.findMany>> = [];
  let groups: StaffDocGroup[] = [];
  let total = 0;

  try {
    docTypes = await prisma.documentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    // Which staff have ≥1 matching document? Paginate over STAFF, not documents,
    // so one person appears once and the page renders a bounded number of rows
    // (fixes the "Page Unresponsive" caused by rendering the whole set).
    const staffWhere: Prisma.StaffWhereInput = {
      documents: {
        some: {
          ...(activeType ? { documentType: { code: activeType } } : {}),
        },
      },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { nip: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [staffTotal, staffRows] = await Promise.all([
      prisma.staff.count({ where: staffWhere }),
      prisma.staff.findMany({
        where: staffWhere,
        select: { id: true, name: true, nip: true, profession: true, room: { select: { name: true } } },
        orderBy: { name: "asc" },
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
      }),
    ]);
    total = staffTotal;

    // Fetch the matching documents for only the staff on this page.
    const staffIds = staffRows.map((s) => s.id);
    const docs =
      staffIds.length === 0
        ? []
        : await prisma.document.findMany({
            where: {
              staffId: { in: staffIds },
              ...(activeType ? { documentType: { code: activeType } } : {}),
            },
            select: {
              id: true,
              staffId: true,
              filename: true,
              storageKey: true,
              legacyDriveUrl: true,
              expiryDate: true,
              isLifetime: true,
              documentType: { select: { code: true, name: true, hasExpiry: true } },
            },
            orderBy: [{ updatedAt: "desc" }],
          });

    const byStaff = new Map<string, typeof docs>();
    for (const d of docs) {
      const list = byStaff.get(d.staffId) ?? [];
      list.push(d);
      byStaff.set(d.staffId, list);
    }

    // Preserve document-type ordering as configured (STR, SIP, BTCLS, ACLS, …).
    const typeOrder = new Map(docTypes.map((t, i) => [t.code, i]));

    groups = staffRows.map((s) => {
      const staffDocs = byStaff.get(s.id) ?? [];
      const typeMap = new Map<string, { code: string; name: string; files: StaffDocGroup["types"][number]["files"] }>();
      for (const d of staffDocs) {
        const code = d.documentType.code;
        const entry =
          typeMap.get(code) ??
          { code, name: d.documentType.name, files: [] as StaffDocGroup["types"][number]["files"] };
        entry.files.push({
          id: d.id,
          filename: d.filename,
          storageKey: d.storageKey,
          legacyDriveUrl: d.legacyDriveUrl,
          expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
          isLifetime: d.isLifetime,
          hasExpiry: d.documentType.hasExpiry,
          documentTypeCode: code,
          documentTypeName: d.documentType.name,
        });
        typeMap.set(code, entry);
      }
      const types = [...typeMap.values()].sort(
        (a, b) => (typeOrder.get(a.code) ?? 999) - (typeOrder.get(b.code) ?? 999),
      );
      return {
        staffId: s.id,
        staffName: s.name,
        nip: s.nip,
        profession: s.profession,
        roomName: s.room?.name ?? null,
        types,
      };
    });
  } catch {
    // DB not ready
  }

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Dokumen" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      roles={currentUser.roles}
      permissions={Array.from(currentUser.permissions)}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Komite",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <StickyPageHeader
          title="Dokumen Tenaga"
          description="Berkas legalitas, pendidikan, dan administrasi per tenaga. Klik tombol dokumen untuk detail dan membuka berkas."
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/komite/dokumen"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  !activeType ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Semua
              </Link>
              {docTypes.map((t) => (
                <Link
                  key={t.id}
                  href={`/komite/dokumen?type=${t.code}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    activeType === t.code ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.code}
                </Link>
              ))}
              <form action="/komite/dokumen" className="ml-auto">
                {activeType && <input type="hidden" name="type" value={activeType} />}
                <input
                  type="search"
                  name="search"
                  aria-label="Cari tenaga berdasarkan nama atau NIP"
                  defaultValue={search ?? ""}
                  placeholder="Cari nama / NIP…"
                  className={searchInputClass("w-56")}
                />
              </form>
            </div>
          }
        />

        <Section>
          <DokumenClient groups={groups} />
          <ServerPagination
            basePath="/komite/dokumen"
            params={{ type: activeType, search }}
            page={page}
            perPage={PER_PAGE}
            total={total}
          />
        </Section>
      </div>
    </AppShell>
  );
}
