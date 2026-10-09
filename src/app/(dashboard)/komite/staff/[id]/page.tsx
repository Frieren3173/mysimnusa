import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { formatDateShort } from "@/lib/utils";
import Link from "next/link";

export const metadata: Metadata = { title: "Detail SDM" };

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_READ);
  const { id } = await params;

  let staff: Prisma.StaffGetPayload<{
    include: {
      room: true;
      employment: true;
      education: true;
      competencies: { include: { competency: true } };
      documents: { include: { documentType: true } };
      trainingParticipants: { include: { training: true }; take: 5 };
      borangEntries: { take: 5; orderBy: { createdAt: "desc" } };
    };
  }> | null = null;
  try {
    staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        room: true,
        employment: true,
        education: true,
        competencies: { include: { competency: true } },
        documents: { include: { documentType: true } },
        trainingParticipants: {
          include: { training: true },
          take: 5,
        },
        borangEntries: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  } catch {}

  if (!staff) notFound();

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Data SDM", href: "/komite/staff" },
    { label: staff.name },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header Profile Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold text-xl">
                {staff.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{staff.name}</h1>
                <p className="text-xs text-slate-500">
                  {staff.profession} · {staff.room?.name ?? "Tanpa Ruangan"} · NIP:{" "}
                  <span className="font-mono text-slate-700">{staff.nip ?? "—"}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <Badge variant={staff.employmentStatus === "ACTIVE" ? "active" : "default"}>
                    {staff.employmentStatus === "ACTIVE" ? "Aktif" : staff.employmentStatus}
                  </Badge>
                  {staff.legacySourceId && (
                    <Badge variant="default" showDot={false}>
                      Data Migrasi
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/komite/staff/${staff.id}/edit`}>
                <Button variant="secondary" size="sm">
                  Edit Profil
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Legal Documents Section */}
        <Card>
          <CardHeader>
            <CardTitle>Dokumen Legalitas (STR & SIP)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Jenis Dokumen</Th>
                  <Th>Nomor Dokumen</Th>
                  <Th>Tanggal Berakhir</Th>
                  <Th>Status</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.documents?.length === 0 ? (
                  <TableRow>
                    <Td colSpan={4} className="text-center text-xs text-slate-400 py-6">
                      Belum ada dokumen legalitas yang diunggah.
                    </Td>
                  </TableRow>
                ) : (
                  staff.documents?.map((doc) => (
                    <TableRow key={doc.id}>
                      <Td className="font-medium text-slate-900">{doc.documentType.name}</Td>
                      <Td className="font-mono text-xs">{doc.number ?? "—"}</Td>
                      <Td>{formatDateShort(doc.expiryDate)}</Td>
                      <Td>
                        <Badge variant={doc.status === "ACTIVE" ? "active" : "default"}>
                          {doc.documentType.code === "STR" && doc.status === "ACTIVE"
                            ? "Belum Seumur Hidup"
                            : doc.status}
                        </Badge>
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Competencies Section */}
        <Card>
          <CardHeader>
            <CardTitle>Kompetensi Klinis</CardTitle>
          </CardHeader>
          <CardContent>
            {staff.competencies?.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Belum ada kompetensi terdaftar.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staff.competencies?.map((c) => (
                  <Badge key={c.id} variant="default" showDot={false}>
                    {c.competency.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
