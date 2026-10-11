import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { authState, setCurrentUser, type TestUser } from "./helpers/route-harness";

/**
 * The register template must be COMPATIBLE with the importer: its header row is
 * exactly what `mapRegisterHeaders` accepts.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/logger", () => ({ logServerError: vi.fn(), safeErrorMessage: (c: string) => `err ${c}` }));

import { GET as TEMPLATE } from "@/server/api/borang-patient-register-template";
import { mapRegisterHeaders } from "@/lib/komite/patient-register";

function karu(): TestUser {
  return {
    id: "karu_a",
    roles: ["KEPALA_RUANG"],
    permissions: new Set(["borang.karu.review"]),
    hasPermission: (p: string) => p === "borang.karu.review",
    isSuperAdmin: () => false,
    hasRole: (r: string) => r === "KEPALA_RUANG",
    staff: null,
  } as unknown as TestUser;
}

beforeEach(() => vi.clearAllMocks());

describe("patient register — template endpoint", () => {
  it("rejects a caller without upload permission (403)", async () => {
    setCurrentUser({
      id: "s", roles: ["USER"], permissions: new Set(["borang.logbook.read"]),
      hasPermission: (p: string) => p === "borang.logbook.read", isSuperAdmin: () => false, hasRole: () => false, staff: null,
    } as unknown as TestUser);
    expect((await TEMPLATE()).status).toBe(403);
  });

  it("returns an xlsx whose header is accepted by the importer", async () => {
    setCurrentUser(karu());
    const res = await TEMPLATE();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const header = (aoa[0] ?? []).map((h) => String(h));
    // Must NOT throw — the template header is compatible with the parser.
    expect(() => mapRegisterHeaders(header)).not.toThrow();
    expect(header).toEqual(["No.", "Nama Pasien", "Nomor RM", "Diagnosis"]);
  });
});
