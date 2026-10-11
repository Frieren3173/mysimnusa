import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, jsonRequest, readResponse, ctx, type TestUser } from "./helpers/route-harness";

/**
 * D4 regression — master tindakan auto-code.
 * Verifies: system generates the code (client `code` ignored), sequence is
 * monotonic & gap-free across existing rows, duplicate NAME rejected, and no
 * reliance on user input for the code.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/logger", () => ({ logServerError: vi.fn(), safeErrorMessage: (c: string) => `err ${c}` }));

import { POST } from "@/server/api/borang-actions";

const fake = getFakePrisma();
void ctx;

function adminSettings(): TestUser {
  return {
    id: "u1",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["admin.settings.manage"]),
    hasPermission: (p: string) => p === "admin.settings.manage",
    isSuperAdmin: () => false,
    hasRole: () => false,
    staff: null,
  } as unknown as TestUser;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of Object.values(fake.models)) m.rows = [];
  setCurrentUser(adminSettings());
});

describe("D4 — master tindakan auto code", () => {
  it("generates a system code and IGNORES a client-supplied code", async () => {
    const res = await POST(jsonRequest("/x", { code: "HACK-999", name: "Pemasangan Infus", category: "Tindakan Invasif" }));
    const body = await readResponse(res);
    expect(res.status).toBe(200);
    const action = (body.data as { action: { code: string } }).action;
    expect(action.code).toBe("TI-001");
    expect(action.code).not.toBe("HACK-999");
  });

  it("increments the sequence gap-free for the same category", async () => {
    await POST(jsonRequest("/x", { name: "A", category: "Monitoring" }));
    await POST(jsonRequest("/x", { name: "B", category: "Monitoring" }));
    const res = await POST(jsonRequest("/x", { name: "C", category: "Monitoring" }));
    const body = await readResponse(res);
    expect((body.data as { action: { code: string } }).action.code).toBe("MONITO-003");
    const codes = fake.models.nursingAction.rows.map((r) => r.code).sort();
    expect(codes).toEqual(["MONITO-001", "MONITO-002", "MONITO-003"]);
  });

  it("rejects a duplicate NAME case-insensitively (409)", async () => {
    await POST(jsonRequest("/x", { name: "Pemasangan Infus", category: "Tindakan Invasif" }));
    const res = await POST(jsonRequest("/x", { name: "pemasangan infus", category: "Tindakan Invasif" }));
    const body = await readResponse(res);
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("DUPLICATE");
  });

  it("rejects a missing/invalid category (422)", async () => {
    const res = await POST(jsonRequest("/x", { name: "X", category: "Kategori Tidak Ada" }));
    expect(res.status).toBe(422);
  });

  it("retries on P2002 (code collision) with the NEXT sequence, no gap", async () => {
    const spy = vi
      .spyOn(fake.models.nursingAction, "create")
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await POST(jsonRequest("/x", { name: "Retry Case", category: "Monitoring" }));
    const body = await readResponse(res);
    expect(res.status).toBe(200);
    expect((body.data as { action: { code: string } }).action.code).toBe("MONITO-002"); // 001 failed → 002
    spy.mockRestore();
  });
});
