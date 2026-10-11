import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, getRequest, type TestUser } from "./helpers/route-harness";

/**
 * Final-print gate on the DOCX export endpoint (server-side).
 *  - Entries not yet verified by BOTH stages → 409 (no final print).
 *  - Verified entries → 200 (for an authorised printer).
 *  - A read-only staff may only export their OWN record.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/logger", () => ({ logServerError: vi.fn(), safeErrorMessage: (c: string) => `err ${c}` }));

import { GET } from "@/server/api/borang-export";

const fake = getFakePrisma();
const STAFF = "stf1";

function printer(): TestUser {
  return { id: "u_print", roles: ["DIKLAT_BORANG"], permissions: new Set(["borang.logbook.read", "borang.press.print"]), hasPermission: (p: string) => ["borang.logbook.read", "borang.press.print"].includes(p), isSuperAdmin: () => false, hasRole: () => false, staff: null } as unknown as TestUser;
}
function staffOwner(): TestUser {
  return { id: "u_staff", roles: ["USER"], permissions: new Set(["borang.logbook.read"]), hasPermission: (p: string) => p === "borang.logbook.read", isSuperAdmin: () => false, hasRole: () => false, staff: { id: STAFF, name: "S", roomId: null } } as unknown as TestUser;
}

async function seed(status: string) {
  for (const m of Object.values(fake.models)) m.rows = [];
  await fake.models.staff.create({ data: { id: STAFF, name: "Siti", profession: "Perawat" } });
  await fake.models.documentType.create({ data: { id: "dt_str", code: "STR", name: "STR" } });
  await fake.models.document.create({ data: { id: "d1", staffId: STAFF, documentTypeId: "dt_str" } });
  await fake.models.borangEntry.create({
    data: { id: "b1", staffId: STAFF, period: "2026-01", status, patientIdentifier: "TN.A", actionType: "Tindakan", quantity: 1 },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("borang export — final print gate", () => {
  it("rejects final print when the entry is not fully verified (409)", async () => {
    await seed("SUBMITTED");
    setCurrentUser(printer());
    const res = await GET(getRequest(`/api/borang/export?staffId=${STAFF}&year=2026`));
    expect(res.status).toBe(409);
  });

  it("rejects when only Kepala Ruang approved (APPROVED_KARU) — Sekretariat pending", async () => {
    await seed("APPROVED_KARU");
    setCurrentUser(printer());
    const res = await GET(getRequest(`/api/borang/export?staffId=${STAFF}&year=2026`));
    expect(res.status).toBe(409);
  });

  it("allows an authorised printer when fully verified (READY_TO_PRINT)", async () => {
    await seed("READY_TO_PRINT");
    setCurrentUser(printer());
    const res = await GET(getRequest(`/api/borang/export?staffId=${STAFF}&year=2026`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
  });

  it("denies a read-only staff from exporting ANOTHER staff's record (403)", async () => {
    await seed("COMPLETED");
    setCurrentUser({ ...staffOwner(), staff: { id: "other_staff", name: "X", roomId: null } } as unknown as TestUser);
    const res = await GET(getRequest(`/api/borang/export?staffId=${STAFF}&year=2026`));
    expect(res.status).toBe(403);
  });

  it("allows staff to export their OWN verified record", async () => {
    await seed("PRINTED");
    setCurrentUser(staffOwner());
    const res = await GET(getRequest(`/api/borang/export?staffId=${STAFF}&year=2026`));
    expect(res.status).toBe(200);
  });
});
