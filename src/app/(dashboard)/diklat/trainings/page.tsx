import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { ServerPagination } from "@/components/ui/server-pagination";
import { searchInputClass, filterSelectClass } from "@/components/layout/page-toolbar";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { TRAINING_STATUS_LABELS } from "@/lib/diklat/shared";
import { TrainingsClient } from "./trainings-client";

export const metadata: Metadata = { title: "Pelatihan" };

const PER_PAGE = 20;

export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  // Server-side filter + pagination so the list stays responsive as the number
  // of activities grows (matches the app-wide list pattern).
  const where: Prisma.TrainingWhereInput = {};
  if (status) where.status = status as never;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { location: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, trainings] = await Promise.all([
    prisma.training.count({ where }),
    prisma.training.findMany({
      where,
      orderBy: { startDate: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { _count: { select: { participants: true, certificates: true } } },
    }),
  ]);

  return (
    <AppShell
      breadcrumbs={[{ label: "Diklat", href: "/diklat" }, { label: "Pelatihan" }]}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Diklat",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <StickyPageHeader
          title="Daftar Pelatihan"
          description="Buat dan kelola pelatihan. Klik baris untuk mengelola peserta, presensi, nilai, dan sertifikat."
          actions={<span className="text-xs text-slate-500">{total} kegiatan</span>}
          toolbar={
            <form action="/diklat/trainings" className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                name="search"
                aria-label="Cari pelatihan"
                defaultValue={search}
                placeholder="Cari judul / kategori / lokasi…"
                className={searchInputClass("w-64")}
              />
              <select
                name="status"
                aria-label="Filter status"
                defaultValue={status}
                className={filterSelectClass}
              >
                <option value="">Semua Status</option>
                {Object.entries(TRAINING_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Terapkan
              </button>
              {(search || status) && (
                <Link
                  href="/diklat/trainings"
                  className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Reset
                </Link>
              )}
            </form>
          }
        />
        <TrainingsClient
          trainings={trainings.map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            description: t.description,
            startDate: t.startDate.toISOString(),
            endDate: t.endDate.toISOString(),
            location: t.location,
            capacity: t.capacity,
            status: t.status,
            participantCount: t._count.participants,
            certificateCount: t._count.certificates,
          }))}
          canCreate={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE)}
          canUpdate={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE)}
          canDelete={currentUser.hasPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE)}
        />
        <ServerPagination
          basePath="/diklat/trainings"
          params={{ search: search || undefined, status: status || undefined }}
          page={page}
          perPage={PER_PAGE}
          total={total}
        />
      </div>
    </AppShell>
  );
}
