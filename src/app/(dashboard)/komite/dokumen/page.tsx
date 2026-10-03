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
import { deriveDocumentStatus, formatDateShort, formatFileSize } from "@/lib/utils";
import { FileText, Download } from "lucide-react";
import { StaffDetailButton } from "../staff/staff-detail-modal";

export const metadata: Metadata = { title: "Dokumen — Komite Keperawatan" };

export default async function DokumenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_DOCUMENT_READ);
  const params = await searchParams;
  const search = params.search?.trim();

  let docTypes: Awaited<ReturnType<typeof prisma.documentType.findMany>> = [];
  let docs: Prisma.DocumentGetPayload<{
    include: { staff: { include: { room: true } }; documentType: true };
  }>[] = [];

  try {
    docTypes = await prisma.documentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    docs = await prisma.document.findMany({
      where: {
        ...(params.type ? { documentType: { code: params.type } } : {}),
        ...(search ? { staff: { name: { contains: search } } } : {}),
      },
      include: {
        staff: { include: { room: true } },
        documentType: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
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
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Komite",
      }}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dokumen Tenaga</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Berkas legalitas, pendidikan, dan administrasi yang terdaftar per tenaga
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border border-slate-200">
          <Link
            href="/komite/dokumen"
            className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              !params.type ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Semua
          </Link>
          {docTypes.map((t) => (
            <Link
              key={t.id}
              href={`/komite/dokumen?type=${t.code}`}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                params.type === t.code
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.code}
            </Link>
          ))}
          <form action="/komite/dokumen" className="ml-auto">
            {params.type && <input type="hidden" name="type" value={params.type} />}
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Cari nama tenaga..."
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
                <Th>Jenis</Th>
                <Th>Nama Berkas</Th>
                <Th>Ukuran</Th>
                <Th>Berlaku Hingga</Th>
                <Th>Status</Th>
                <Th className="text-right">Aksi</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 ? (
                <TableRow>
                  <Td colSpan={8}>
                    <EmptyState
                      title="Belum ada dokumen"
                      description="Dokumen muncul setelah diunggah pada profil tenaga atau dimigrasi dari Drive."
                      icon={<FileText size={32} />}
                    />
                  </Td>
                </TableRow>
              ) : (
                docs.map((d, i) => {
                  const status = deriveDocumentStatus(d.expiryDate, d.isLifetime);
                  const hasLocal = !!d.storageKey;
                  return (
                    <TableRow key={d.id}>
                      <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                      <Td className="text-sm font-medium">
                        <StaffDetailButton staffId={d.staff.id}>{d.staff.name}</StaffDetailButton>
                        <span className="block text-[10px] text-slate-400">
                          {d.staff.room?.name ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <Badge variant="default">{d.documentType.code}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-600 max-w-[220px] truncate">
                        {d.filename ?? d.legacyDriveUrl ?? "—"}
                      </Td>
                      <Td className="text-xs tabular-nums">{formatFileSize(d.fileSize)}</Td>
                      <Td className="text-xs">
                        {d.isLifetime ? "Seumur hidup" : formatDateShort(d.expiryDate)}
                      </Td>
                      <Td>
                        <DocumentStatusBadge
                          status={status}
                          label={
                            d.documentType.code === "STR" && status === "ACTIVE"
                              ? "Belum Seumur Hidup"
                              : undefined
                          }
                        />
                      </Td>
                      <Td className="text-right">
                        {hasLocal ? (
                          <a
                            href={`/api/documents/${d.id}/download`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <Download size={12} aria-hidden="true" /> Unduh
                          </a>
                        ) : d.legacyDriveUrl ? (
                          <a
                            href={d.legacyDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <Download size={12} aria-hidden="true" /> Drive
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Belum ada berkas</span>
                        )}
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
