import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { KpiCard, Section, AlertItem, EmptyState } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ClipboardList, Send, CheckCircle2, Archive } from "lucide-react";
import { StaffDetailButton } from "../komite/staff/staff-detail-modal";

export const metadata: Metadata = { title: "Dashboard Borang" };

export default async function BorangDashboardPage() {
  const currentUser = await requirePermission(PERMISSIONS.BORANG_LOGBOOK_READ);

  const [byStatus, recent, myDrafts] = await Promise.all([
    prisma.borangEntry.groupBy({ by: ["status"], _count: true }),
    prisma.borangEntry.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        staff: { select: { id: true, name: true, profession: true } },
        room: { select: { name: true } },
      },
    }),
    currentUser.staff?.id
      ? prisma.borangEntry.count({ where: { staffId: currentUser.staff.id, status: "DRAFT" } })
      : Promise.resolve(0),
  ]);

  const count = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const submitted = count("SUBMITTED") + count("VERIFICATION");
  const approved = count("APPROVED");
  const archived = count("ARCHIVED");
  const rejected = count("REJECTED");
  const total = byStatus.reduce((a, b) => a + b._count, 0);

  const canVerify = currentUser.hasPermission(PERMISSIONS.BORANG_LOGBOOK_VERIFY);

  const insights = [
    {
      show: submitted > 0 && canVerify,
      type: "info" as const,
      text: `${submitted} borang menunggu verifikasi`,
      href: "/borang/verification",
      cta: "Verifikasi",
    },
    {
      show: myDrafts > 0,
      type: "warning" as const,
      text: `${myDrafts} draf milik Anda belum dikirim`,
      href: "/borang/logbook",
      cta: "Buka logbook",
    },
    {
      show: rejected > 0,
      type: "danger" as const,
      text: `${rejected} borang ditolak dan perlu diperbaiki`,
      href: "/borang/logbook?status=REJECTED",
      cta: "Perbaiki",
    },
    {
      show: approved > 0,
      type: "success" as const,
      text: `${approved} borang menunggu diarsipkan`,
      href: "/borang/archive",
      cta: "Arsipkan",
    },
  ].filter((i) => i.show);

  return (
    <AppShell
      breadcrumbs={[{ label: "Borang" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Borang",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <StickyPageHeader
          title="Dashboard Borang"
          description="Pencatatan logbook/tindakan dengan alur verifikasi dan arsip"
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Menunggu Verifikasi"
            value={submitted}
            icon={<Send size={18} />}
            variant="default"
          />
          <KpiCard
            title="Disetujui (siap arsip)"
            value={approved}
            icon={<CheckCircle2 size={18} />}
            variant="success"
          />
          <KpiCard title="Diarsipkan" value={archived} icon={<Archive size={18} />} />
          <KpiCard title="Total Entri" value={total} icon={<ClipboardList size={18} />} />
        </div>

        {insights.length > 0 && (
          <Section title="Perlu Tindakan">
            <div className="space-y-2">
              {insights.map((i) => (
                <AlertItem
                  key={i.href + i.cta}
                  type={i.type}
                  title={i.text}
                  action={
                    <Link href={i.href} className="font-medium underline underline-offset-2">
                      {i.cta} →
                    </Link>
                  }
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Entri Terbaru" description="10 perubahan terakhir pada logbook">
          {recent.length === 0 ? (
            <EmptyState
              title="Belum ada entri borang"
              description="Mulai catat tindakan dari halaman Logbook."
              action={
                <Link href="/borang/logbook">
                  <span className="inline-flex h-8 items-center rounded-md bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700">
                    Buka Logbook
                  </span>
                </Link>
              }
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <Table scroll>
                <TableHeader>
                  <TableRow>
                    <Th>Periode</Th>
                    <Th>Petugas</Th>
                    <Th>Ruangan</Th>
                    <Th>Tindakan</Th>
                    <Th>Jumlah</Th>
                    <Th>Status</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((e) => (
                    <TableRow key={e.id}>
                      <Td className="text-xs font-mono">{e.period}</Td>
                      <Td className="text-xs">
                        <StaffDetailButton staffId={e.staff.id}>{e.staff.name}</StaffDetailButton>
                      </Td>
                      <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                      <Td className="text-xs">{e.actionType}</Td>
                      <Td className="text-xs">{e.quantity}</Td>
                      <Td>
                        <BorangStatusBadge status={e.status} />
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
