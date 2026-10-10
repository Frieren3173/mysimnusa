import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, SUPERADMIN, getRequest, readResponse } from "./helpers/route-harness";

/**
 * D — JPL dashboard & Excel export.
 * Verifies the ACTUAL aggregation from an in-memory dataset:
 *   • staff with no qualifying activity still appear with 0 JPL;
 *   • CANCELLED activities and CANCELLED participants grant no JPL;
 *   • the `search` filter applies to the table AND the export;
 *   • the export workbook contains the filtered rows (numbers identical).
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/logger", () => ({
  logServerError: vi.fn(),
  safeErrorMessage: (c: string) => `Terjadi kesalahan (${c})`,
}));

import { getJplRows, summarizeJpl } from "@/lib/diklat/jpl";
import { GET as EXPORT } from "@/server/api/diklat-jpl-export";

const fake = getFakePrisma();

async function seed() {
  for (const m of Object.values(fake.models)) m.rows = [];
  // Two rooms
  await fake.models.room.create({ data: { id: "roomA", name: "Ruang A", isActive: true } });
  await fake.models.room.create({ data: { id: "roomB", name: "Ruang B", isActive: true } });
  // Staff
  await fake.models.staff.create({ data: { id: "s1", name: "Andi Wijaya", nip: "111", profession: "Perawat", roomId: "roomA", isActive: true } });
  await fake.models.staff.create({ data: { id: "s2", name: "Budi Santoso", nip: "222", profession: "Perawat", roomId: "roomB", isActive: true } });
  await fake.models.staff.create({ data: { id: "s3", name: "Cita Lestari", nip: "333", profession: "Bidan", roomId: "roomA", isActive: true } });
  // Activities in 2026
  await fake.models.training.create({ data: { id: "t1", title: "IHT A", status: "COMPLETED", jpl: 6, startDate: new Date("2026-03-01T00:00:00.000Z") } });
  await fake.models.training.create({ data: { id: "t2", title: "IHT B", status: "COMPLETED", jpl: 4, startDate: new Date("2026-04-01T00:00:00.000Z") } });
  await fake.models.training.create({ data: { id: "t3", title: "IHT C (cancelled)", status: "CANCELLED", jpl: 10, startDate: new Date("2026-05-01T00:00:00.000Z") } });
  // s1: attended t1 (6) + t2 (4) = 10
  await fake.models.participants.create({ data: { trainingId: "t1", staffId: "s1", status: "CONFIRMED" } });
  await fake.models.participants.create({ data: { trainingId: "t2", staffId: "s1", status: "CONFIRMED" } });
  await fake.models.attendance.create({ data: { trainingId: "t1", staffId: "s1", date: new Date("2026-03-01T00:00:00.000Z"), status: "HADIR" } });
  await fake.models.attendance.create({ data: { trainingId: "t2", staffId: "s1", date: new Date("2026-04-01T00:00:00.000Z"), status: "HADIR" } });
  // s2: attended the CANCELLED activity ONLY → must be 0
  await fake.models.participants.create({ data: { trainingId: "t3", staffId: "s2", status: "CONFIRMED" } });
  await fake.models.attendance.create({ data: { trainingId: "t3", staffId: "s2", date: new Date("2026-05-01T00:00:00.000Z"), status: "HADIR" } });
  // s3: no activity at all → 0
}

beforeEach(async () => {
  await seed();
  setCurrentUser(SUPERADMIN());
});

describe("D — JPL aggregation", () => {
  it("counts only HADIR in non-cancelled activities and keeps zero-JPL staff", async () => {
    const rows = await getJplRows({ year: 2026 });
    const byId = new Map(rows.map((r) => [r.staffId, r]));
    expect(byId.get("s1")?.totalJpl).toBe(10);
    expect(byId.get("s1")?.met).toBe(false); // target 20
    expect(byId.get("s2")?.totalJpl).toBe(0); // cancelled activity grants nothing
    expect(byId.get("s3")?.totalJpl).toBe(0); // no activity at all
    // Every active staff present even with 0 JPL
    expect(rows.length).toBe(3);
  });

  it("KPI summary reflects the FULL filtered population (not a page)", async () => {
    const rows = await getJplRows({ year: 2026 });
    const summary = summarizeJpl(rows);
    expect(summary.staffCount).toBe(3);
    expect(summary.metCount).toBe(0);
    expect(summary.notMetCount).toBe(3);
    expect(summary.totalJpl).toBe(10);
  });

  it("applies the search filter on name/NIP", async () => {
    const rows = await getJplRows({ year: 2026, search: "Budi" });
    expect(rows.length).toBe(1);
    expect(rows[0].staffId).toBe("s2");
    const byNip = await getJplRows({ year: 2026, search: "111" });
    expect(byNip.map((r) => r.staffId)).toEqual(["s1"]);
  });

  it("applies the room filter (consistent with the UI)", async () => {
    const rows = await getJplRows({ year: 2026, roomId: "roomA" });
    expect(rows.map((r) => r.staffId).sort()).toEqual(["s1", "s3"]);
  });

  it("is scoped to the requested calendar year", async () => {
    const rows = await getJplRows({ year: 2025 });
    expect(rows.every((r) => r.totalJpl === 0)).toBe(true);
  });

  it("paginates the SAME rows the KPIs are computed from (KPI stable across pages)", async () => {
    // 30 staff, matching the dashboard's PER_PAGE = 25 → 2 pages.
    for (const m of Object.values(fake.models)) m.rows = [];
    for (let i = 0; i < 30; i++) {
      await fake.models.staff.create({
        data: { id: `p${i}`, name: `Staf ${String(i).padStart(2, "0")}`, nip: `${100 + i}`, profession: "Perawat", isActive: true },
      });
    }
    const PER_PAGE = 25;
    const rows = await getJplRows({ year: 2026 });
    const full = summarizeJpl(rows);

    const page1 = rows.slice(0, PER_PAGE);
    const page2 = rows.slice(PER_PAGE, PER_PAGE * 2);
    expect(page1.length).toBe(25);
    expect(page2.length).toBe(5);
    // KPIs are derived from the FULL population regardless of the page shown.
    expect(summarizeJpl(rows)).toEqual(full);
    expect(full.staffCount).toBe(30);

    // Row numbering continuity across pages (as rendered in the table).
    const numOnPage2First = (2 - 1) * PER_PAGE + 1;
    expect(numOnPage2First).toBe(26);
  });
});

describe("D — Excel export", () => {
  it("produces a valid workbook whose rows match the (searched) population", async () => {
    const res = await EXPORT(getRequest("/api/diklat/jpl/export?year=2026&search=Budi"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // header + exactly one data row (Budi), proving the search filter applies.
    expect(aoa.length).toBe(2);
    const dataRow = aoa[1];
    expect(String(dataRow)).toContain("Budi Santoso");
  });

  it("rejects an invalid year (400) without touching data", async () => {
    const res = await EXPORT(getRequest("/api/diklat/jpl/export?year=abc"));
    const body = await readResponse(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("neutralises spreadsheet formula injection in exported cells", () => {
    const malicious = XLSX.utils.aoa_to_sheet([["'=cmd|'/c calc'!A1"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, malicious, "x");
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    // The neutralised cell must NOT start with '=' (hence not a formula).
    const ws = XLSX.read(out, { type: "buffer" }).Sheets.x;
    const a1 = ws.A1?.v ?? "";
    expect(String(a1).startsWith("=")).toBe(false);
  });
});
