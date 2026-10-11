import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, ctx, type TestUser } from "./helpers/route-harness";

/**
 * D5 — Borang deletion (owner revision): every workflow status is deletable by
 * an authorised+owner actor; audit history is preserved (borangId detached);
 * unauthorised roles are rejected. Route-level over the REAL DELETE handler.
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

import { DELETE } from "@/server/api/borang-entries-$id$";
import { NextRequest } from "next/server";

const fake = getFakePrisma();

function adminB(constraint = "f") {
  const u = {
    id: "user_admin",
    roles: ["ADMIN_BORANG"],
    permissions: new Set(["borang.logbook.archive"]),
    hasPermission: (p: string) => p === "borang.logbook.archive",
    isSuperAdmin: () => false,
    hasRole: (r: string) => r === "ADMIN_BORANG",
    staff: null,
  };
  void constraint;
  return u as unknown as TestUser;
}
function plainUser() {
  const u = {
    id: "user_plain",
    roles: ["USER"],
    permissions: new Set(["borang.logbook.read"]),
    hasPermission: (p: string) => p === "borang.logbook.read",
    isSuperAdmin: () => false,
    hasRole: () => false,
    staff: null,
  };
  return u as unknown as TestUser;
}

function delReq() {
  return new NextRequest("http://localhost:3230/api/borang/entries/borang_1", { method: "DELETE" });
}

async function seedEntry(status: string) {
  for (const m of Object.values(fake.models)) m.rows = [];
  await fake.models.staff.create({ data: { id: "stf1", name: "S", roomId: "room_a" } });
  await fake.models.borangEntry.create({
    data: {
      id: "borang_1",
      staffId: "stf1",
      roomId: "room_a",
      status,
      period: "2026-01",
      actionType: "T",
      quantity: 1,
      createdById: "user_admin", // owned by the admin actor
    },
  });
  await fake.models.auditLog.create({ data: { id: "aud_1", borangId: "borang_1", action: "CREATED", module: "borang" } });
}

beforeEach(() => vi.clearAllMocks());

describe("D5 — delete borang (all statuses)", () => {
  for (const status of ["DRAFT", "SUBMITTED", "APPROVED_KARU", "READY_TO_PRINT", "PRINTED", "COMPLETED", "ARCHIVED", "REVISION_REQUIRED"]) {
    it(`deletes an owned entry in status ${status}`, async () => {
      await seedEntry(status);
      setCurrentUser(adminB());
      const res = await DELETE(delReq(), ctx("borang_1"));
      expect(res.status).toBe(200);
      expect(fake.models.borangEntry.rows.length).toBe(0);
      // Audit history is preserved (detached), never deleted.
      const aud = fake.models.auditLog.rows.find((a) => a.id === "aud_1");
      expect(aud).toBeTruthy();
      expect(aud?.borangId).toBeNull();
    });
  }

  it("rejects a role without the archive permission (403)", async () => {
    await seedEntry("DRAFT");
    setCurrentUser(plainUser());
    const res = await DELETE(delReq(), ctx("borang_1"));
    expect(res.status).toBe(403);
    expect(fake.models.borangEntry.rows.length).toBe(1);
  });

  it("a legacy entry with NO owner stays deletable by an archive admin", async () => {
    await seedEntry("APPROVED");
    await fake.models.borangEntry.update({ where: { id: "borang_1" }, data: { createdById: null } });
    setCurrentUser(adminB());
    const res = await DELETE(delReq(), ctx("borang_1"));
    expect(res.status).toBe(200);
    expect(fake.models.borangEntry.rows.length).toBe(0);
  });

  it("returns 404 for a missing entry", async () => {
    for (const m of Object.values(fake.models)) m.rows = [];
    setCurrentUser(adminB());
    const res = await DELETE(delReq(), ctx("borang_1"));
    expect(res.status).toBe(404);
  });
});
