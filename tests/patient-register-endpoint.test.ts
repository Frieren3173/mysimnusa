import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, type TestUser } from "./helpers/route-harness";

/**
 * Patient register endpoint — authorization is enforced on the SERVER:
 *  • only the Kepala Ruang of the room may import (room ownership verified),
 *  • Staff / VIEWER / other roles are rejected from upload,
 *  • invalid file/headers are rejected with no partial import,
 *  • read is scoped to the actor's own room.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/logger", () => ({ logServerError: vi.fn(), safeErrorMessage: (c: string) => `err ${c}` }));

import { GET, POST } from "@/server/api/borang-patient-register";

const fake = getFakePrisma();
const ROOM_A = "room_a";
const ROOM_B = "room_b";

function user(roles: string[], perms: string[], staffRoom: string | null = null, id = "u1"): TestUser {
  const set = new Set(perms);
  return {
    id,
    roles,
    permissions: set,
    hasPermission: (p: string) => set.has(p),
    isSuperAdmin: () => false,
    hasRole: (r: string) => roles.includes(r),
    staff: staffRoom ? { id: `stf_${id}`, roomId: staffRoom } : null,
  } as unknown as TestUser;
}

function xlsxFile(rows: (string | number)[][], name = "register.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buf)], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function formReq(roomId: string, file: File | null): NextRequest {
  const fd = new FormData();
  fd.set("roomId", roomId);
  if (file) fd.set("file", file);
  return new NextRequest("http://localhost:3230/api/borang/patient-register", { method: "POST", body: fd });
}
const getReq = (roomId: string) => new NextRequest(`http://localhost:3230/api/borang/patient-register?roomId=${roomId}`);
const HEADER = ["No.", "Nama Pasien", "Nomor RM", "Diagnosis"];
const GOOD = [HEADER, [1, "Pasien A", "RM-001", "Dx A"], [2, "Pasien B", "RM-002", "Dx B"]];

beforeEach(async () => {
  vi.clearAllMocks();
  for (const m of Object.values(fake.models)) m.rows = [];
  await fake.models.room.create({ data: { id: ROOM_A, name: "Ruang A", isActive: true } });
  await fake.models.room.create({ data: { id: ROOM_B, name: "Ruang B", isActive: true } });
});

describe("patient register — upload authorization", () => {
  beforeEach(async () => {
    // karu_a leads ROOM_A only.
    await fake.models.roomKepalaRuang.create({ data: { roomId: ROOM_A, userId: "karu_a" } });
  });

  it("Kepala Ruang can import THEIR room's register (200, rows persisted)", async () => {
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read", "borang.karu.review"], null, "karu_a"));
    const res = await POST(formReq(ROOM_A, xlsxFile(GOOD)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.total).toBe(2);
    expect(fake.models.patientRegisterEntry.rows.length).toBe(2);
  });

  it("Kepala Ruang of ANOTHER room cannot upload (403)", async () => {
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read", "borang.karu.review"], null, "karu_a"));
    const res = await POST(formReq(ROOM_B, xlsxFile(GOOD)));
    expect(res.status).toBe(403);
    expect(fake.models.patientRegisterEntry.rows.length).toBe(0);
  });

  it("Staff cannot upload (403)", async () => {
    setCurrentUser(user(["USER"], ["borang.logbook.read", "borang.logbook.create"], ROOM_A, "staff1"));
    const res = await POST(formReq(ROOM_A, xlsxFile(GOOD)));
    expect(res.status).toBe(403);
  });

  it("VIEWER cannot upload (403)", async () => {
    setCurrentUser(user(["VIEWER"], ["borang.logbook.read"], null, "viewer1"));
    const res = await POST(formReq(ROOM_A, xlsxFile(GOOD)));
    expect(res.status).toBe(403);
  });

  it("rejects bad format (422) before parsing", async () => {
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read", "borang.karu.review"], null, "karu_a"));
    const bad = new File([new Uint8Array([1, 2, 3])], "register.txt", { type: "text/plain" });
    const res = await POST(formReq(ROOM_A, bad));
    expect(res.status).toBe(422);
  });

  it("rejects a file missing mandatory headers (422) with no partial import", async () => {
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read", "borang.karu.review"], null, "karu_a"));
    const res = await POST(formReq(ROOM_A, xlsxFile([["No.", "Ket"], [1, "x"]])));
    expect(res.status).toBe(422);
    expect(fake.models.patientRegisterEntry.rows.length).toBe(0);
  });

  it("rejects when a row is invalid — no partial import (422)", async () => {
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read", "borang.karu.review"], null, "karu_a"));
    const res = await POST(formReq(ROOM_A, xlsxFile([HEADER, [1, "Pasien A", "RM-001", ""], [2, "", "RM-002", ""]])));
    expect(res.status).toBe(422);
    expect(fake.models.patientRegisterEntry.rows.length).toBe(0);
  });
});

describe("patient register — read scoping", () => {
  it("Kepala Ruang reads own room, is denied another room (403)", async () => {
    await fake.models.roomKepalaRuang.create({ data: { roomId: ROOM_A, userId: "karu_a" } });
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read"], null, "karu_a"));
    expect((await GET(getReq(ROOM_A))).status).toBe(200);
    expect((await GET(getReq(ROOM_B))).status).toBe(403);
  });

  it("Staff reads only their own room's register (own 200, other 403)", async () => {
    setCurrentUser(user(["USER"], ["borang.logbook.read"], ROOM_A, "staff1"));
    expect((await GET(getReq(ROOM_A))).status).toBe(200);
    expect((await GET(getReq(ROOM_B))).status).toBe(403);
  });

  it("GET ?rm= verifies an RM belongs to the room (found 200, cross-room 404)", async () => {
    await fake.models.patientRegisterEntry.create({ data: { roomId: ROOM_A, patientName: "P", rmNumber: "RM-A1", diagnosis: null } });
    setCurrentUser(user(["USER"], ["borang.logbook.read"], ROOM_A, "staff1"));
    // RM exists in own room.
    const own = await GET(new NextRequest(`http://x/api/borang/patient-register?roomId=${ROOM_A}&rm=RM-A1`));
    expect(own.status).toBe(200);
    const ownBody = await own.json();
    expect(ownBody.data.entry.patientName).toBeUndefined(); // never echo the name
    // Same RM asserted against ANOTHER room → not found.
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read"], null, "karu_a"));
    await fake.models.roomKepalaRuang.create({ data: { roomId: ROOM_B, userId: "karu_b" } });
    setCurrentUser(user(["KEPALA_RUANG"], ["borang.logbook.read"], null, "karu_b"));
    const other = await GET(new NextRequest(`http://x/api/borang/patient-register?roomId=${ROOM_B}&rm=RM-A1`));
    expect(other.status).toBe(404);
  });
});
