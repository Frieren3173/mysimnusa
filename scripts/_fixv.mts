/**
 * Staging verification of all audit fixes (B1-B6, C3, D).
 * Uses curl for reliable cookie handling. Staging only.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/** Shape of a JSON API response used by this verification (loosely typed). */
interface ApiResponse {
  status: number;
  body: ApiBody | null;
}
interface ApiBody {
  success?: boolean;
  data?: Record<string, unknown> & { certificate?: unknown };
  error?: { code?: string; message?: string };
}

/** Minimal training-policy fields this script writes when seeding fixtures. */
interface TrainingSeed {
  certificateMode?: "ATTENDANCE_ONLY" | "TEST_SCORED" | "TEST_COMPLETION";
  requireMinScore?: boolean;
  minScore?: number;
  showScore?: boolean;
  minAttendanceRate?: number;
  status?: "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED" | "CANCELLED";
  capacity?: number;
  jpl?: number;
}

const BASE = process.env.FIX_BASE ?? "http://localhost:3230";
const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!;
const host = new URL(url).hostname;
if (!host.includes("ep-flat-shadow")) { console.error("refused: not staging"); process.exit(1); }

/**
 * Credentials come ONLY from the environment — never hardcoded, never printed.
 * When absent, tests that need an authenticated session are skipped (not failed)
 * with a safe message, so the script is usable without leaking secrets.
 */
const UAT_USER = process.env.UAT_USER ?? "superadmin";
const UAT_PASSWORD = process.env.UAT_PASSWORD;

const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
const dir = mkdtempSync(join(tmpdir(), "fixv-"));
let pass = 0, fail = 0; const fails: string[] = [];
function chk(n: string, c: boolean, x = "") { if (c) { pass++; console.log("PASS", n); } else { fail++; fails.push(n + " " + x); console.log("FAIL", n, x); } }
function curl(a: string[]) { return execFileSync("curl.exe", ["-s", ...a], { encoding: "utf8", maxBuffer: 2e7 }); }
function login(u: string): string | null {
  if (!UAT_PASSWORD) return null; // no credential → caller skips auth-dependent checks
  const jar = join(dir, u + ".txt");
  curl(["-c", jar, "-X", "POST", `${BASE}/api/auth/login`, "-H", "Content-Type: application/json", "-d", JSON.stringify({ username: u, password: UAT_PASSWORD })]);
  return jar;
}
function api(jar: string | null, method: string, path: string, body?: unknown): ApiResponse {
  if (!jar) return { status: 0, body: null };
  const f = join(dir, `r${Math.random().toString(36).slice(2)}.json`);
  const a = ["-b", jar, "-c", jar, "-o", f, "-w", "%{http_code}", "-X", method, `${BASE}${path}`];
  if (body !== undefined) a.push("-H", "Content-Type: application/json", "--data-binary", JSON.stringify(body));
  const code = Number(curl(a).trim());
  let b: ApiBody | null = null; try { b = JSON.parse(readFileSync(f, "utf8")) as ApiBody; } catch {}
  return { status: code, body: b };
}

async function cleanup() {
  const tr = await p.training.findMany({ where: { title: { startsWith: "FIXV" } }, select: { id: true } });
  const ids = tr.map((t) => t.id);
  if (ids.length) {
    await p.certificate.deleteMany({ where: { trainingId: { in: ids } } });
    await p.trainingAttendance.deleteMany({ where: { trainingId: { in: ids } } });
    await p.trainingAssessment.deleteMany({ where: { trainingId: { in: ids } } });
    await p.trainingParticipant.deleteMany({ where: { trainingId: { in: ids } } });
    await p.training.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  await cleanup();
  const admin = login(UAT_USER);
  if (!admin) {
    // No credential in the environment → the API-dependent checks cannot run.
    // Exit safely WITHOUT printing anything secret, and WITHOUT failing CI.
    console.error("SKIP: UAT_PASSWORD not set — authenticated API checks were not run.");
    console.error("Set UAT_PASSWORD (and optionally UAT_USER) to run the full suite against staging.");
    process.exit(0);
  }
  const staff = await p.staff.findMany({ where: { isActive: true }, take: 6, select: { id: true } });

  const mk = (t: string, pol: TrainingSeed = {}) => p.training.create({ data: { title: t, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-01"), status: "COMPLETED", ...pol } });
  const part = (tid: string, sid: string, st = "CONFIRMED") => p.trainingParticipant.create({ data: { trainingId: tid, staffId: sid, status: st } });
  const hadir = (tid: string, sid: string, d = "2026-08-01", s = "HADIR") => p.trainingAttendance.create({ data: { trainingId: tid, staffId: sid, date: new Date(d), status: s } });

  // ── B1: manual issue must enforce eligibility ─────────────────────────────
  console.log("\n== B1: manual certificate enforces eligibility ==");
  const tB1 = await mk("FIXV B1", { certificateMode: "TEST_SCORED", requireMinScore: true, minScore: 90, jpl: 4 });
  await part(tB1.id, staff[0].id); // no attendance, no score
  let r = api(admin, "POST", `/api/diklat/trainings/${tB1.id}/certificates`, { staffId: staff[0].id });
  chk("B1: manual issue WITHOUT attendance/score → rejected (422)", r.status === 422, `got ${r.status} ${JSON.stringify(r.body)}`);
  chk("B1: no certificate row created", (await p.certificate.count({ where: { trainingId: tB1.id } })) === 0);
  // now make eligible: attendance + passing score + completed
  await hadir(tB1.id, staff[0].id);
  await p.trainingAssessment.create({ data: { trainingId: tB1.id, staffId: staff[0].id, score: 95, completed: true } });
  r = api(admin, "POST", `/api/diklat/trainings/${tB1.id}/certificates`, { staffId: staff[0].id });
  chk("B1: manual issue WITH eligibility → 200 + cert", r.status === 200 && !!r.body?.data?.certificate, `got ${r.status}`);
  chk("B1: cert persisted with trigger MANUAL", (await p.certificate.count({ where: { trainingId: tB1.id, trigger: "MANUAL" } })) === 1);
  // idempotent re-call
  r = api(admin, "POST", `/api/diklat/trainings/${tB1.id}/certificates`, { staffId: staff[0].id });
  chk("B1: re-call idempotent (no duplicate)", (await p.certificate.count({ where: { trainingId: tB1.id } })) === 1);

  // ── B2: CANCELLED activity must not issue ────────────────────────────────
  console.log("\n== B2: CANCELLED activity issues nothing ==");
  const tB2 = await mk("FIXV B2", { certificateMode: "ATTENDANCE_ONLY", status: "CANCELLED", jpl: 8 });
  await part(tB2.id, staff[0].id); await hadir(tB2.id, staff[0].id);
  r = api(admin, "POST", `/api/diklat/trainings/${tB2.id}/certificates/process`, {});
  chk("B2: process on CANCELLED → issued=0", r.status === 200 && r.body?.data?.issued === 0 && r.body?.data?.cancelled === true, `got ${r.status} ${JSON.stringify(r.body?.data)}`);
  r = api(admin, "POST", `/api/diklat/trainings/${tB2.id}/certificates`, { staffId: staff[0].id });
  chk("B2: manual issue on CANCELLED → 409", r.status === 409, `got ${r.status}`);
  chk("B2: no cert rows for CANCELLED", (await p.certificate.count({ where: { trainingId: tB2.id } })) === 0);

  // ── B3: global unique numbering across activities ────────────────────────
  console.log("\n== B3: generate global-unique numbers ==");
  const tB3a = await mk("FIXV B3a", { jpl: 4 });
  const tB3b = await mk("FIXV B3b", { jpl: 4 });
  await part(tB3a.id, staff[1].id); await hadir(tB3a.id, staff[1].id);
  await part(tB3b.id, staff[1].id); await hadir(tB3b.id, staff[1].id);
  const genBody = (sid: string) => ({ staffIds: [sid], mode: "single", tema: "T", tanggal: "2026-08-15", tempat: "L", jpl: 4, numberPrefix: "FIXV/", numberPattern: "{PREFIX}{SEQ:3}/{MONTH}/{YEAR}" });
  const genA = api(admin, "POST", `/api/diklat/trainings/${tB3a.id}/certificates/generate`, genBody(staff[1].id));
  const genB = api(admin, "POST", `/api/diklat/trainings/${tB3b.id}/certificates/generate`, genBody(staff[1].id));
  chk("B3: gen A 200", genA.status === 200, `got ${genA.status}`);
  chk("B3: gen B 200", genB.status === 200, `got ${genB.status}`);
  const certs = await p.certificate.findMany({ where: { trainingId: { in: [tB3a.id, tB3b.id] } }, select: { certificateNumber: true, trainingId: true, issuedById: true, trigger: true } });
  chk("B3: TWO cert rows persisted (no silent skip)", certs.length === 2, JSON.stringify(certs));
  chk("B3: numbers DIFFERENT across activities", new Set(certs.map((c) => c.certificateNumber)).size === certs.length, JSON.stringify(certs.map((c) => c.certificateNumber)));
  chk("B3: issuedById + trigger persisted", certs.every((c) => c.issuedById && c.trigger === "MANUAL"), JSON.stringify(certs));

  // ── B4: PATCH invalid date range rejected ────────────────────────────────
  console.log("\n== B4: PATCH date range validation ==");
  const tB4 = await mk("FIXV B4", {});
  r = api(admin, "PATCH", `/api/diklat/trainings/${tB4.id}`, { startDate: "2026-09-10", endDate: "2026-09-01" });
  chk("B4: PATCH endDate<startDate → 422", r.status === 422, `got ${r.status}`);
  r = api(admin, "PATCH", `/api/diklat/trainings/${tB4.id}`, { startDate: "2026-09-20" }); // would invert with existing end 08-01
  chk("B4: PATCH startDate-only inverts → 422", r.status === 422, `got ${r.status}`);
  r = api(admin, "PATCH", `/api/diklat/trainings/${tB4.id}`, { startDate: "2026-07-01", endDate: "2026-07-05" });
  chk("B4: valid range → 200", r.status === 200, `got ${r.status}`);

  // ── B5: attendance notes preserved when omitted ──────────────────────────
  console.log("\n== B5: attendance notes preserved ==");
  const tB5 = await mk("FIXV B5", {});
  await part(tB5.id, staff[2].id);
  r = api(admin, "POST", `/api/diklat/trainings/${tB5.id}/attendance`, { staffId: staff[2].id, date: "2026-08-01", status: "HADIR", notes: "catatan awal" });
  chk("B5: create with notes 200", r.status === 200, `got ${r.status}`);
  // update status WITHOUT notes
  r = api(admin, "POST", `/api/diklat/trainings/${tB5.id}/attendance`, { staffId: staff[2].id, date: "2026-08-01", status: "SAKIT" });
  const att = await p.trainingAttendance.findFirst({ where: { trainingId: tB5.id, staffId: staff[2].id } });
  chk("B5: status updated to SAKIT", att?.status === "SAKIT");
  chk("B5: notes PRESERVED", att?.notes === "catatan awal", `got ${att?.notes}`);
  // explicit null clears
  r = api(admin, "POST", `/api/diklat/trainings/${tB5.id}/attendance`, { staffId: staff[2].id, date: "2026-08-01", status: "HADIR", notes: null });
  const att2 = await p.trainingAttendance.findFirst({ where: { trainingId: tB5.id, staffId: staff[2].id } });
  chk("B5: explicit null clears notes", att2?.notes === null, `got ${att2?.notes}`);

  // ── B6: assessment completed precedence ──────────────────────────────────
  console.log("\n== B6: assessment completed precedence ==");
  const tB6 = await mk("FIXV B6", {});
  await part(tB6.id, staff[3].id);
  // score without completed → completed true
  api(admin, "POST", `/api/diklat/trainings/${tB6.id}/assessments`, { staffId: staff[3].id, score: 80 });
  let a = await p.trainingAssessment.findFirst({ where: { trainingId: tB6.id, staffId: staff[3].id } });
  chk("B6: score only → completed true", a?.completed === true);
  // explicit false then score again → stays false
  api(admin, "POST", `/api/diklat/trainings/${tB6.id}/assessments`, { staffId: staff[3].id, completed: false });
  api(admin, "POST", `/api/diklat/trainings/${tB6.id}/assessments`, { staffId: staff[3].id, score: 90 });
  a = await p.trainingAssessment.findFirst({ where: { trainingId: tB6.id, staffId: staff[3].id } });
  chk("B6: explicit false then score → completed true (score implies)", a?.completed === true, JSON.stringify(a));
  // explicit false after
  api(admin, "POST", `/api/diklat/trainings/${tB6.id}/assessments`, { staffId: staff[3].id, completed: false });
  a = await p.trainingAssessment.findFirst({ where: { trainingId: tB6.id, staffId: staff[3].id } });
  chk("B6: explicit false honoured", a?.completed === false);

  // ── C3: capacity excludes CANCELLED + race-safe ──────────────────────────
  console.log("\n== C3: capacity excludes CANCELLED ==");
  const tC3 = await mk("FIXV C3", { capacity: 2 });
  await part(tC3.id, staff[0].id, "CANCELLED"); // cancelled → frees a slot
  await part(tC3.id, staff[1].id, "CONFIRMED");
  r = api(admin, "POST", `/api/diklat/trainings/${tC3.id}/participants`, { staffId: staff[2].id });
  chk("C3: add with 1 cancelled + 1 active, cap 2 → success", r.status === 200, `got ${r.status}`);
  r = api(admin, "POST", `/api/diklat/trainings/${tC3.id}/participants`, { staffId: staff[3].id });
  chk("C3: now full (2 active) → 409", r.status === 409, `got ${r.status}`);

  // ── C2: attendance duplicate prevented by unique constraint ──────────────
  console.log("\n== C2: attendance upsert no duplicate ==");
  const tC2 = await mk("FIXV C2", {});
  await part(tC2.id, staff[4].id);
  await hadir(tC2.id, staff[4].id, "2026-08-05", "HADIR");
  await hadir(tC2.id, staff[4].id, "2026-08-05", "TIDAK_HADIR").catch(() => {});
  chk("C2: duplicate (training,staff,date) rejected by unique constraint", (await p.trainingAttendance.count({ where: { trainingId: tC2.id, staffId: staff[4].id } })) === 1);

  await cleanup();
  console.log(`\n==== FIXV: ${pass} passed, ${fail} failed ====`);
  if (fails.length) console.log(" - " + fails.join("\n - "));
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error("CRASH:", e?.message ?? e); await p.$disconnect(); process.exit(2); });
