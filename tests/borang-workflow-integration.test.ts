import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, jsonRequest, ctx, readResponse, type TestUser } from "./helpers/route-harness";

/**
 * D3 — Borang verification workflow (backend enforcement).
 *
 * Route-level integration over the REAL workflow handler + REAL scoping, with an
 * in-memory Prisma double. Verifies that cross-room review, wrong-role access,
 * step-skipping and Superadmin-lateral access are enforced on the SERVER (not
 * merely hidden in the UI), and that status changes are validated.
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
vi.mock("@/lib/notifications", () => ({
  notify: vi.fn(async () => undefined),
  notifySecretariat: vi.fn(async () => undefined),
}));

import { POST as WORKFLOW } from "@/server/api/borang-entries-$id$-workflow";

const fake = getFakePrisma();

const ROOM_A = "room_a";
const ROOM_B = "room_b";

function karuUser(id: string, roomIds: string[]): TestUser {
  const u = {
    id,
    roles: ["KEPALA_RUANG"],
    permissions: new Set(["borang.logbook.read", "borang.karu.review"]),
    hasPermission: (p: string) => ["borang.logbook.read", "borang.karu.review"].includes(p),
    isSuperAdmin: () => false,
    hasRole: (r: string) => r === "KEPALA_RUANG",
    staff: { id: `stf_${id}`, roomId: roomIds[0] ?? null },
  };
  return u as unknown as TestUser;
}

function superadmin(): TestUser {
  const u = {
    id: "user_super",
    roles: ["SUPERADMIN"],
    permissions: new Set<string>(),
    hasPermission: () => true,
    isSuperAdmin: () => true,
    hasRole: (r: string) => r === "SUPERADMIN",
    staff: null,
  };
  return u as unknown as TestUser;
}

function sekretariat(): TestUser {
  const u = {
    id: "user_sekret",
    roles: ["DIKLAT_BORANG"],
    permissions: new Set(["borang.logbook.read", "borang.admin.review", "borang.press.print"]),
    hasPermission: (p: string) => ["borang.logbook.read", "borang.admin.review", "borang.press.print"].includes(p),
    isSuperAdmin: () => false,
    hasRole: (r: string) => r === "DIKLAT_BORANG",
    staff: null,
  };
  return u as unknown as TestUser;
}

async function seedEntry(status: string, roomId: string, opts: Partial<Record<string, unknown>> = {}) {
  for (const m of Object.values(fake.models)) m.rows = [];
  await fake.models.room.create({ data: { id: ROOM_A, name: "Ruang A", isActive: true } });
  await fake.models.room.create({ data: { id: ROOM_B, name: "Ruang B", isActive: true } });
  await fake.models.staff.create({ data: { id: "stf_owner", name: "Owner", roomId } });
  await fake.models.borangEntry.create({
    data: {
      id: "borang_1",
      staffId: "stf_owner",
      roomId,
      status,
      period: "2026-01",
      actionType: "Tindakan",
      quantity: 1,
      createdById: "user_owner",
      submittedById: null,
      kepalaRuangUserId: null,
      ...opts,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("D3 — backend workflow enforcement", () => {
  it("a Kepala Ruang of ANOTHER room cannot approve (403 FORBIDDEN_ROOM)", async () => {
    // Entry is in ROOM_A; the actor leads ROOM_B only.
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_b", [ROOM_B]));
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    const body = await readResponse(res);
    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN_ROOM");
    const row = fake.models.borangEntry.rows[0];
    expect(row.status).toBe("SUBMITTED"); // unchanged
  });

  it("the assigned Kepala Ruang CAN approve (SUBMITTED → APPROVED_KARU)", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_a", [ROOM_A]));
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    expect(res.status).toBe(200);
    expect(fake.models.borangEntry.rows[0].status).toBe("APPROVED_KARU");
  });

  it("cannot skip steps: DRAFT → APPROVED_KARU is rejected (409)", async () => {
    await seedEntry("DRAFT", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_a", [ROOM_A]));
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    expect(res.status).toBe(409);
    expect(fake.models.borangEntry.rows[0].status).toBe("DRAFT");
  });

  it("a wrong-role actor without the review permission is denied (403)", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser({
      id: "user_x",
      roles: ["USER"],
      permissions: new Set(["borang.logbook.read"]),
      hasPermission: (p: string) => p === "borang.logbook.read",
      isSuperAdmin: () => false,
      hasRole: () => false,
      staff: null,
    } as unknown as TestUser);
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    expect(res.status).toBe(403);
  });

  it("Superadmin may review any room (lateral access)", async () => {
    await seedEntry("SUBMITTED", ROOM_B, { kepalaRuangUserId: "user_karu_b" });
    setCurrentUser(superadmin());
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    expect(res.status).toBe(200);
    expect(fake.models.borangEntry.rows[0].status).toBe("APPROVED_KARU");
  });

  it("the submitter cannot approve their own entry (separation of duties)", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a", submittedById: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_a", [ROOM_A]));
    const res = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    const body = await readResponse(res);
    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("SEPARATION_OF_DUTIES");
  });

  it("REQUEST_REVISION requires a note (422) and records the transition", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_a", [ROOM_A]));
    const noNote = await WORKFLOW(jsonRequest("/x", { action: "REQUEST_REVISION" }), ctx("borang_1"));
    expect(noNote.status).toBe(422);
    const withNote = await WORKFLOW(jsonRequest("/x", { action: "REQUEST_REVISION", notes: "Perbaiki" }), ctx("borang_1"));
    expect(withNote.status).toBe(200);
    expect(fake.models.borangEntry.rows[0].status).toBe("REVISION_REQUIRED");
  });

  it("Sekretariat CANNOT do stage-2 (READY_TO_PRINT) before Kepala Ruang approves", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(sekretariat());
    const res = await WORKFLOW(jsonRequest("/x", { action: "READY_TO_PRINT" }), ctx("borang_1"));
    // SUBMITTED is not a valid `from` for READY_TO_PRINT (needs APPROVED_KARU).
    expect(res.status).toBe(409);
    expect(fake.models.borangEntry.rows[0].status).toBe("SUBMITTED");
  });

  it("full chain: KARU approves then Sekretariat finalises (SUBMITTED → APPROVED_KARU → READY_TO_PRINT)", async () => {
    await seedEntry("SUBMITTED", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser(karuUser("user_karu_a", [ROOM_A]));
    const k1 = await WORKFLOW(jsonRequest("/x", { action: "APPROVE_KARU" }), ctx("borang_1"));
    expect(k1.status).toBe(200);
    expect(fake.models.borangEntry.rows[0].status).toBe("APPROVED_KARU");

    setCurrentUser(sekretariat());
    const k2 = await WORKFLOW(jsonRequest("/x", { action: "READY_TO_PRINT" }), ctx("borang_1"));
    expect(k2.status).toBe(200);
    expect(fake.models.borangEntry.rows[0].status).toBe("READY_TO_PRINT");
  });

  it("an unauthorised actor cannot change status via a direct API call", async () => {
    await seedEntry("APPROVED_KARU", ROOM_A, { kepalaRuangUserId: "user_karu_a" });
    setCurrentUser({
      id: "user_x",
      roles: ["USER"],
      permissions: new Set(["borang.logbook.read"]),
      hasPermission: (p: string) => p === "borang.logbook.read",
      isSuperAdmin: () => false,
      hasRole: () => false,
      staff: null,
    } as unknown as TestUser);
    const res = await WORKFLOW(jsonRequest("/x", { action: "READY_TO_PRINT" }), ctx("borang_1"));
    expect(res.status).toBe(403);
    expect(fake.models.borangEntry.rows[0].status).toBe("APPROVED_KARU");
  });
});
