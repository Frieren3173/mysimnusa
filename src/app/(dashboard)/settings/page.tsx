import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { Section, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAuth } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { listSlides } from "@/lib/slides";
import { SettingsClient } from "./settings-client";
import { SlidesManager } from "./slides-manager";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const currentUser = await requireAuth();

  let rooms: Awaited<ReturnType<typeof prisma.room.findMany>> = [];
  let competencies: Awaited<ReturnType<typeof prisma.competency.findMany>> = [];
  let docTypes: Awaited<ReturnType<typeof prisma.documentType.findMany>> = [];
  let professions: string[] = [];

  try {
    [rooms, competencies, docTypes] = await Promise.all([
      prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.competency.findMany({ orderBy: { name: "asc" } }),
      prisma.documentType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);
    const prof = await prisma.staff.groupBy({ by: ["profession"], _count: true });
    professions = prof.map((p) => p.profession).sort();
  } catch {
    // DB not ready
  }

  const isSuperAdmin = currentUser.isSuperAdmin();
  const breadcrumbs = [{ label: "Pengaturan" }];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Pengguna",
      }}
    >
      <div className="mx-auto max-w-5xl">
        <StickyPageHeader
          title="Pengaturan"
          description="Konfigurasi organisasi, master data, dan administrasi sistem"
        />

        {isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Administrasi Sistem</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link
                href="/settings/system/migration"
                className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Migration Center
              </Link>
              <Link
                href="/admin/users"
                className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Manajemen Pengguna
              </Link>
              <Link
                href="/admin/audit"
                className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Audit Log
              </Link>
            </CardContent>
          </Card>
        )}

        <SettingsClient rooms={rooms} competencies={competencies} />

        {isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Slide Foto Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <SlidesManager slides={listSlides()} />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Profesi Terdaftar" description="Derivasi dari data SDM">
            <div className="flex flex-wrap gap-2">
              {professions.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada data profesi.</p>
              ) : (
                professions.map((p) => (
                  <Badge key={p} variant="default">
                    {p}
                  </Badge>
                ))
              )}
            </div>
          </Section>

          <Section title="Jenis Dokumen" description="Tipe dokumen yang didukung sistem">
            <div className="flex flex-wrap gap-2">
              {docTypes.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada jenis dokumen.</p>
              ) : (
                docTypes.map((t) => (
                  <Badge key={t.id} variant={t.hasExpiry ? "default" : "info"}>
                    {t.code}
                  </Badge>
                ))
              )}
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
