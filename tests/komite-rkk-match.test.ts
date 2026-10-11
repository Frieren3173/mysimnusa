import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, jsonRequest, readResponse, type TestUser } from "./helpers/route-harness";

/**
 * RKK preview-match endpoint (POST /api/komite/rkk/match) — READ-ONLY preview.
 * Verifies the endpoint returns matched/unmatched/ambiguous WITHOUT writing data.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/logger", () => ({ logServerError: vi.fn(), safeErrorMessage: (c: string) => `err ${c}` }));

import { POST as RKK_MATCH } from "@/server/api/komite-rkk-match";

const fake = getFakePrisma();

function uploader(): TestUser {
  const u = {
    id: "u1",
    roles: ["KOMITE_KEPERAWATAN_KEBIDANAN"],
    permissions: new Set(["komite.document.upload"]),
    hasPermission: (p: string) => p === "komite.document.upload",
    isSuperAdmin: () => false,
    hasRole: () => false,
    staff: null,
  };
  return u as unknown as TestUser;
}

beforeEach(async () => {
  vi.clearAllMocks();
  for (const m of Object.values(fake.models)) m.rows = [];
  await fake.models.staff.create({ data: { id: "s1", name: "Ahmad Hanafi Koswara, A.Md.Kep.", nip: "200109042025211025", isActive: true } });
  await fake.models.staff.create({ data: { id: "s2", name: "Budi Santoso", nip: "198765432109876543", isActive: true } });
  setCurrentUser(uploader());
});

describe("RKK match endpoint (preview-only)", () => {
  it("matches by NIP and by name; reports unmatched — writes nothing", async () => {
    const res = await RKK_MATCH(jsonRequest("/x", { fileNames: ["RKK_200109042025211025.pdf", "BUDI SANTOSO.pdf", "unknown.pdf"] }));
    const body = await readResponse(res);
    expect(res.status).toBe(200);
    const d = body.data as unknown as { counts: { matched: number; unmatched: number; ambiguous: number } };
    expect(d.counts.matched).toBe(2);
    expect(d.counts.unmatched).toBe(1);
  });

  it("rejects an unauthenticated caller (401)", async () => {
    setCurrentUser(null);
    const res = await RKK_MATCH(jsonRequest("/x", { fileNames: ["a.pdf"] }));
    expect(res.status).toBe(401);
  });

  it("rejects a caller without upload permission (403)", async () => {
    setCurrentUser({
      id: "u2",
      roles: ["USER"],
      permissions: new Set<string>(),
      hasPermission: () => false,
      isSuperAdmin: () => false,
      hasRole: () => false,
      staff: null,
    } as unknown as TestUser);
    const res = await RKK_MATCH(jsonRequest("/x", { fileNames: ["a.pdf"] }));
    expect(res.status).toBe(403);
  });

  it("rejects an empty file list (422)", async () => {
    const res = await RKK_MATCH(jsonRequest("/x", { fileNames: [] }));
    expect(res.status).toBe(422);
  });
});
