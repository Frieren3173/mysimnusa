import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/ui/card";
import { ChartCard, BarChart, type BarDatum } from "@/components/ui/chart";
import { PhotoCarousel } from "@/components/dashboard/photo-carousel";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deriveDocumentStatus, cn } from "@/lib/utils";
import { listSlides } from "@/lib/slides";

export const metadata: Metadata = { title: "Dashboard Komite" };

type DocCode = "STR" | "SIP" | "BTCLS" | "ACLS";
const DOC_CODES: DocCode[] = ["STR", "SIP", "BTCLS", "ACLS"];

const STATUS_ORDER = [
  "SEUMUR HIDUP",
  "AKTIF",
  "AKAN HABIS",
  "EXPIRED",
  "TIDAK ADA TANGGAL",
  "TIDAK PUNYA",
] as const;

const STATUS_COLORS: Record<string, string> = {
  // Ocean-coherent base for "good/owned" states; amber/red reserved for the
  // semantic warning/error states so meaning stays clear.
  "SEUMUR HIDUP": "#0f4c81", // deep ocean
  AKTIF: "#1479b8", // ocean blue
  "AKAN HABIS": "#d97706", // warning (amber, semantic)
  EXPIRED: "#dc2626", // danger (red, semantic)
  "TIDAK ADA TANGGAL": "#94a3b8", // muted
  "TIDAK PUNYA": "#94a3b8", // muted
  "TIDAK MEMILIKI": "#cbd5e1", // light muted
  MEMILIKI: "#1479b8", // ocean blue
};

interface BestDoc {
  expiryDate: Date | null;
  isLifetime: boolean;
}

function statusLabel(doc: BestDoc): string {
  const s = deriveDocumentStatus(doc.expiryDate, doc.isLifetime);
  return s === "LIFETIME"
    ? "SEUMUR HIDUP"
    : s === "ACTIVE"
      ? "AKTIF"
      : s === "EXPIRING"
        ? "AKAN HABIS"
        : s === "EXPIRED"
          ? "EXPIRED"
          : "TIDAK ADA TANGGAL";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default async function KomiteDashboardPage() {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_READ);

  const stats = {
    totalStaff: 0,
    perawat: 0,
    bidan: 0,
    ruangan: 0,
    strLifetime: 0,
    strNonLifetime: 0,
    sipValid: 0,
    sip90: 0,
    btcls90: 0,
    acls90: 0,
    noBtcls: 0,
    strExpired: 0,
    sipExpired: 0,
  };
  const charts: Record<string, BarDatum[]> = {
    rooms: [],
    str: [],
    sip: [],
    btclsOwn: [],
    btclsStatus: [],
    aclsOwn: [],
    aclsStatus: [],
    comp: [],
  };

  try {
    const [staffRows, roomTotal, docs, comps] = await Promise.all([
      prisma.staff.findMany({
        where: { isActive: true },
        select: { id: true, profession: true, room: { select: { name: true } } },
      }),
      prisma.room.count({ where: { isActive: true } }),
      prisma.document.findMany({
        where: {
          staff: { isActive: true },
          documentType: { code: { in: DOC_CODES } },
        },
        select: {
          staffId: true,
          expiryDate: true,
          isLifetime: true,
          documentType: { select: { code: true } },
        },
      }),
      prisma.staffCompetency.findMany({
        where: { staff: { isActive: true } },
        select: { competency: { select: { name: true } } },
      }),
    ]);

    stats.totalStaff = staffRows.length;
    stats.perawat = staffRows.filter((s) => s.profession.toLowerCase().includes("perawat")).length;
    stats.bidan = staffRows.filter((s) => s.profession.toLowerCase().includes("bidan")).length;
    stats.ruangan = roomTotal;

    // Best document per staff per code (prefer lifetime, else latest expiry)
    const best = new Map<DocCode, Map<string, BestDoc>>();
    for (const code of DOC_CODES) best.set(code, new Map());
    for (const d of docs) {
      const code = d.documentType.code as DocCode;
      const m = best.get(code);
      if (!m) continue;
      const cur: BestDoc = { expiryDate: d.expiryDate, isLifetime: d.isLifetime };
      const prev = m.get(d.staffId);
      if (!prev) {
        m.set(d.staffId, cur);
        continue;
      }
      const curWins =
        (cur.isLifetime && !prev.isLifetime) ||
        (cur.isLifetime === prev.isLifetime &&
          (cur.expiryDate?.getTime() ?? 0) > (prev.expiryDate?.getTime() ?? 0));
      if (curWins) m.set(d.staffId, cur);
    }

    const strMap = best.get("STR")!;
    const sipMap = best.get("SIP")!;
    const btclsMap = best.get("BTCLS")!;
    const aclsMap = best.get("ACLS")!;

    stats.strLifetime = [...strMap.values()].filter((d) => d.isLifetime).length;
    stats.strNonLifetime = strMap.size - stats.strLifetime;
    stats.sipValid = [...sipMap.values()].filter(
      (d) => statusLabel(d) !== "EXPIRED" && statusLabel(d) !== "TIDAK ADA TANGGAL"
    ).length;
    stats.sip90 = [...sipMap.values()].filter((d) => statusLabel(d) === "AKAN HABIS").length;
    stats.btcls90 = [...btclsMap.values()].filter((d) => statusLabel(d) === "AKAN HABIS").length;
    stats.acls90 = [...aclsMap.values()].filter((d) => statusLabel(d) === "AKAN HABIS").length;
    stats.strExpired = [...strMap.values()].filter((d) => statusLabel(d) === "EXPIRED").length;
    stats.sipExpired = [...sipMap.values()].filter((d) => statusLabel(d) === "EXPIRED").length;
    stats.noBtcls = stats.totalStaff - btclsMap.size;

    const statusChart = (m: Map<string, BestDoc>, withMissing: boolean): BarDatum[] => {
      const counts = new Map<string, number>();
      for (const doc of m.values()) {
        const l = statusLabel(doc);
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      if (withMissing && m.size < stats.totalStaff) {
        counts.set("TIDAK PUNYA", stats.totalStaff - m.size);
      }
      return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
        label: s,
        value: counts.get(s)!,
        color: STATUS_COLORS[s],
      }));
    };

    const ownershipChart = (m: Map<string, BestDoc>): BarDatum[] => [
      {
        label: "TIDAK MEMILIKI",
        value: stats.totalStaff - m.size,
        color: STATUS_COLORS["TIDAK MEMILIKI"],
      },
      { label: "MEMILIKI", value: m.size, color: STATUS_COLORS.MEMILIKI },
    ];

    const roomCounts = new Map<string, number>();
    for (const s of staffRows) {
      const key = s.room?.name ?? "TANPA RUANGAN";
      roomCounts.set(key, (roomCounts.get(key) ?? 0) + 1);
    }
    charts.rooms = [...roomCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const compCounts = new Map<string, number>();
    for (const c of comps) {
      const key = c.competency.name;
      compCounts.set(key, (compCounts.get(key) ?? 0) + 1);
    }
    charts.comp = [...compCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    charts.str = statusChart(strMap, true).map((b) =>
      b.label === "AKTIF" ? { ...b, label: "BELUM SEUMUR HIDUP" } : b
    );
    charts.sip = statusChart(sipMap, true);
    charts.btclsStatus = statusChart(btclsMap, false);
    charts.aclsStatus = statusChart(aclsMap, false);
    charts.btclsOwn = ownershipChart(btclsMap);
    charts.aclsOwn = ownershipChart(aclsMap);
  } catch {
    // DB might not be connected yet in dev — fallback to zeros gracefully
  }

  const now = new Date();
  const updated = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const slides = listSlides();

  const alertCards = [
    { n: stats.sip90, label: "SIP BERAKHIR ≤ 90 HARI", tone: "amber" },
    { n: stats.btcls90, label: "BTCLS BERAKHIR ≤ 90 HARI", tone: "amber" },
    { n: stats.acls90, label: "ACLS BERAKHIR ≤ 90 HARI", tone: "amber" },
    { n: stats.noBtcls, label: "BELUM MEMILIKI BTCLS", tone: "red" },
    { n: stats.strExpired, label: "STR EXPIRED", tone: "red" },
    { n: stats.sipExpired, label: "SIP EXPIRED", tone: "red" },
  ];

  const breadcrumbs = [{ label: "Komite Keperawatan dan Kebidanan" }];
  const userInfo = {
    name: currentUser.staff?.name ?? currentUser.username,
    email: currentUser.email,
    role: currentUser.roles[0] ?? "Komite",
  };

  return (
    <AppShell breadcrumbs={breadcrumbs} user={userInfo} {...appShellVisibility(currentUser)}>
      <div className="mx-auto max-w-7xl space-y-6 stagger-children">
        <StickyPageHeader
          title="Dashboard Komite Keperawatan dan Kebidanan"
          description={`Diperbarui: ${updated}`}
          actions={<RefreshButton />}
        />

        {/* Photo Carousel */}
        <PhotoCarousel slides={slides} />

        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total Perawat" value={stats.perawat} />
          <KpiCard title="Total Bidan" value={stats.bidan} />
          <KpiCard title="Total Ruangan" value={stats.ruangan} />
          <KpiCard title="STR Seumur Hidup" value={stats.strLifetime} />
          <KpiCard title="STR Belum Seumur Hidup" value={stats.strNonLifetime} />
          <KpiCard title="SIP Aktif" value={stats.sipValid} />
        </div>

        {/* Alerts — its own row with its own vertical breathing room */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {alertCards.map((a) => (
            <div
              key={a.label}
              className={cn(
                "group rounded-xl border border-[var(--color-border)] border-l-4 bg-[var(--color-surface)] p-4 shadow-[0_1px_2px_rgba(15,40,70,0.04)] transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-8px_rgba(15,40,70,0.2)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                a.tone === "amber" ? "border-l-amber-400" : "border-l-red-400"
              )}
            >
              <p
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  a.tone === "amber" ? "text-amber-600" : "text-red-600"
                )}
              >
                {a.n}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase leading-snug tracking-wide text-[var(--color-muted-foreground)]">
                {a.label}
              </p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="Distribusi Ruangan" className="lg:col-span-2">
            <BarChart data={charts.rooms} total={stats.totalStaff} rotateLabels />
          </ChartCard>
          <ChartCard title="Status STR">
            <BarChart data={charts.str} />
          </ChartCard>
          <ChartCard title="Status SIP">
            <BarChart data={charts.sip} />
          </ChartCard>
          <ChartCard title="Kepemilikan BTCLS">
            <BarChart data={charts.btclsOwn} />
          </ChartCard>
          <ChartCard title="Status BTCLS">
            <BarChart data={charts.btclsStatus} />
          </ChartCard>
          <ChartCard title="Sertifikat Kompetensi" className="lg:col-span-2">
            <BarChart data={charts.comp} rotateLabels />
          </ChartCard>
          <ChartCard title="Kepemilikan ACLS">
            <BarChart data={charts.aclsOwn} />
          </ChartCard>
          <ChartCard title="Status ACLS">
            <BarChart data={charts.aclsStatus} />
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
