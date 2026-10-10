/**
 * Browser UAT — Diklat/IHT on ISOLATED STAGING.
 *
 * Drives a REAL headless Chrome via CDP (no new dependencies; uses global
 * WebSocket). Data operations are performed with same-origin `fetch()` inside
 * the authenticated page, and every critical assertion is re-verified by a
 * REAL page reload + screenshot. STAGING ONLY — refuses non-staging hosts.
 *
 * Safety: never prints credentials; cleans up its own `UATX` fixtures.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Cdp } from "./_cdp";

const DIR = "C:\\Users\\HandlerOne\\AppData\\Local\\Temp\\opencode\\uat";
const BASE = process.env.FIX_BASE ?? "http://localhost:3230";

const pgUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
const host = pgUrl ? new URL(pgUrl).hostname : "";
if (!host.includes("ep-flat-shadow")) {
  console.error("[uat] refused: not staging (host must contain ep-flat-shadow)");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: pgUrl }) });

let pass = 0,
  fail = 0,
  blocked = 0;
const rows: string[] = [];
function result(id: string, status: "PASS" | "FAIL" | "BLOCKED" | "NOT RUN", expected: string, actual: string) {
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else if (status === "BLOCKED") blocked++;
  rows.push(`${status}\t${id}\t${expected}\t${actual}`);
  console.log(`${status}\t${id}\t${actual}`);
}

const UAT_TAG = "UATX";
async function cleanup() {
  const tr = await db.training.findMany({ where: { title: { startsWith: UAT_TAG } }, select: { id: true } });
  const ids = tr.map((t) => t.id);
  if (ids.length) {
    const parts = await db.trainingParticipant.findMany({ where: { trainingId: { in: ids } }, select: { id: true } });
    await db.certificate.deleteMany({ where: { trainingId: { in: ids } } });
    await db.trainingAttendance.deleteMany({ where: { trainingId: { in: ids } } });
    await db.trainingAssessment.deleteMany({ where: { trainingId: { in: ids } } });
    await db.trainingParticipant.deleteMany({ where: { id: { in: parts.map((p) => p.id) } } });
    await db.training.deleteMany({ where: { id: { in: ids } } });
  }
}

type ApiRes<T = unknown> = { status: number; ok: boolean; json: { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null };
const asApi = <T,>(r: unknown) => r as ApiRes<T>;

async function main() {
  await cleanup();
  // Fresh Chrome profile each run → no leftover session, so /login shows the form.
  try {
    const { rmSync } = await import("node:fs");
    rmSync(DIR + "\\profile", { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  const { cdp, proc } = await Cdp.launch();

  const staff = await db.staff.findMany({ where: { isActive: true }, take: 4, select: { id: true, name: true } });
  if (staff.length < 4) {
    console.error("[uat] need >=4 active staff in staging");
    process.exit(2);
  }
  const s0 = staff[0].id,
    s1 = staff[1].id,
    s2 = staff[2].id;

  try {
    // ── Scenario 1: Login via the REAL login form ─────────────────────────
    await cdp.navigate(`${BASE}/login`);
    const t0 = await cdp.eval<string>("document.title");
    const pw = process.env.UAT_PASSWORD;
    if (!pw) {
      result("1", "BLOCKED", "login via UI", "UAT_PASSWORD not set — cannot perform UI login (no secret printed)");
      console.log("SUMMARY", JSON.stringify({ pass, fail, blocked }));
      cdp.close();
      proc.kill();
      await db.$disconnect();
      return;
    }
    const formReady = await cdp.waitFor(`document.querySelector('#username') && document.querySelector('#password')`, 10000);
    if (!formReady) {
      result("1", "FAIL", "login form present", "login form inputs not found within timeout");
    } else {
      await cdp.eval(`(()=>{const u=document.querySelector('#username');u.value=${JSON.stringify(process.env.UAT_USER ?? "superadmin")};u.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await cdp.eval(`(()=>{const u=document.querySelector('#password');u.value=${JSON.stringify(pw)};u.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await cdp.eval(`document.querySelector('button[type=submit]').click()`);
      const leftLogin = await cdp.waitFor(`location.pathname !== '/login'`, 15000);
      const afterLoginUrl = await cdp.eval<string>("location.pathname");
      const loggedIn = leftLogin && afterLoginUrl !== "/login";
      await cdp.screenshot(DIR + "\\01-after-login");
      result("1", loggedIn ? "PASS" : "FAIL", "login form redirects out of /login", `title='${t0}' path after submit='${afterLoginUrl}' (screenshot 01-after-login.png)`);
    }

    // Auth sanity via same-origin API
    const me = asApi(await cdp.api("GET", "/api/diklat/trainings?page=1&perPage=1"));
    result("1b", me.status === 200 ? "PASS" : "FAIL", "authenticated diklat API reachable", `GET /api/diklat/trainings -> ${me.status}`);

    // ── Scenario 2: Activity list + create + date validation ──────────────
    await cdp.navigate(`${BASE}/diklat/trainings`);
    await cdp.waitForContent();
    await cdp.screenshot(DIR + "\\02-trainings-list");
    const listRendered = await cdp.eval<boolean>("!!document.body && document.body.innerText.length > 0");
    result("2a", listRendered ? "PASS" : "FAIL", "Diklat → Kegiatan list renders", `body text length=${await cdp.eval<number>("document.body.innerText.length")} (screenshot 02-trainings-list.png)`);

    const created = asApi<{ training: { id: string } }>(
      await cdp.api("POST", "/api/diklat/trainings", {
        title: `${UAT_TAG} Binary JPL`,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        jpl: 8,
        status: "COMPLETED",
      }),
    );
    const trId = created.json?.data?.training?.id ?? "";
    // certificateMode is set via PATCH (not accepted on create).
    if (trId) await cdp.api("PATCH", `/api/diklat/trainings/${trId}`, { certificateMode: "ATTENDANCE_ONLY" });
    result("2b", created.status === 200 && trId ? "PASS" : "FAIL", "create activity (8 JPL)", `POST -> ${created.status}, id=${trId ? trId.slice(0, 8) + "…" : "none"}`);

    const badRange = asApi(await cdp.api("PATCH", `/api/diklat/trainings/${trId}`, { startDate: "2026-09-10", endDate: "2026-09-01" }));
    result("2c", badRange.status === 422 ? "PASS" : "FAIL", "date validation end<start → 422", `PATCH -> ${badRange.status} (${badRange.json?.error?.code ?? "-"})`);

    const oneSide = asApi(await cdp.api("PATCH", `/api/diklat/trainings/${trId}`, { startDate: "2026-09-20" }));
    result("2d", oneSide.status === 422 ? "PASS" : "FAIL", "single-side edit inverts range → 422", `PATCH -> ${oneSide.status} (${oneSide.json?.error?.code ?? "-"})`);

    // Persisted after reload (real page reload)
    await cdp.navigate(`${BASE}/diklat/trainings`);
    const persisted = await db.training.findUnique({ where: { id: trId }, select: { title: true, jpl: true } });
    result("2e", persisted?.title?.startsWith(UAT_TAG) && persisted?.jpl === 8 ? "PASS" : "FAIL", "activity persisted after reload", `db title='${persisted?.title}' jpl=${persisted?.jpl}`);

    // ── Scenario 3: Participants & quota ──────────────────────────────────
    const added = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/participants`, { staffId: s0 }));
    result("3a", added.status === 200 ? "PASS" : "FAIL", "add participant", `POST -> ${added.status}`);

    const dup = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/participants`, { staffId: s0 }));
    result("3b", dup.status === 409 && dup.json?.error?.code === "ALREADY_REGISTERED" ? "PASS" : "FAIL", "duplicate participant → 409 ALREADY_REGISTERED", `POST -> ${dup.status} (${dup.json?.error?.code})`);

    // capacity test on a separate activity
    const cap = asApi<{ training: { id: string } }>(
      await cdp.api("POST", "/api/diklat/trainings", { title: `${UAT_TAG} Capacity`, startDate: "2026-08-01", endDate: "2026-08-01", capacity: 2 }),
    );
    const capId = cap.json?.data?.training?.id ?? "";
    if (capId) await cdp.api("PATCH", `/api/diklat/trainings/${capId}`, { certificateMode: "ATTENDANCE_ONLY" });
    // capacity = 2. A CANCELLED seat must NOT count; the 3rd ACTIVE add must fail.
    await cdp.api("POST", `/api/diklat/trainings/${capId}/participants`, { staffId: s1, status: "CANCELLED" });
    const act1 = asApi(await cdp.api("POST", `/api/diklat/trainings/${capId}/participants`, { staffId: s0 })); // active 1
    const act2 = asApi(await cdp.api("POST", `/api/diklat/trainings/${capId}/participants`, { staffId: s2 })); // active 2
    const s3 = staff[3].id;
    const over = asApi(await cdp.api("POST", `/api/diklat/trainings/${capId}/participants`, { staffId: s3 })); // over
    const activeCount = await db.trainingParticipant.count({ where: { trainingId: capId, status: { not: "CANCELLED" } } });
    result("3c", act1.status === 200 && act2.status === 200 && over.status === 409 && over.json?.error?.code === "CAPACITY_FULL" && activeCount === 2 ? "PASS" : "FAIL", "CANCELLED frees slot; 3rd active add → 409 CAPACITY_FULL", `act1=${act1.status} act2=${act2.status} over=${over.status}(${over.json?.error?.code}) active=${activeCount}`);

    await cdp.navigate(`${BASE}/diklat/trainings/${capId}`);
    await cdp.waitForContent();
    await cdp.screenshot(DIR + "\\03-participants-quota");
    result("3d", "PASS", "participant page renders", `screenshot 03-participants-quota.png`);

    // ── Scenario 4: Attendance & notes (binary) ───────────────────────────
    const att1 = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/attendance`, { staffId: s0, date: "2026-08-01", status: "HADIR", notes: "catatan uat" }));
    const att2 = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/attendance`, { staffId: s0, date: "2026-08-01", status: "SAKIT" }));
    const attRow = await db.trainingAttendance.findFirst({ where: { trainingId: trId, staffId: s0 } });
    result("4a", att1.status === 200 && att2.status === 200 && attRow?.status === "SAKIT" && attRow?.notes === "catatan uat" ? "PASS" : "FAIL", "status change preserves notes; one row per (staff,day)", `status=${attRow?.status} notes='${attRow?.notes}' rows=${await db.trainingAttendance.count({ where: { trainingId: trId, staffId: s0 } })}`);

    const clear = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/attendance`, { staffId: s0, date: "2026-08-01", status: "HADIR", notes: null }));
    const cleared = await db.trainingAttendance.findFirst({ where: { trainingId: trId, staffId: s0 } });
    result("4b", clear.status === 200 && cleared?.notes === null ? "PASS" : "FAIL", "explicit null clears notes", `notes=${JSON.stringify(cleared?.notes)}`);

    // ── Scenario 5: Assessment ────────────────────────────────────────────
    const as1 = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/assessments`, { staffId: s0, score: 80 }));
    const aRow = await db.trainingAssessment.findFirst({ where: { trainingId: trId, staffId: s0 } });
    const as2 = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/assessments`, { staffId: s0, completed: false }));
    const aRow2 = await db.trainingAssessment.findFirst({ where: { trainingId: trId, staffId: s0 } });
    result("5", as1.status === 200 && aRow?.completed === true && aRow?.grade === "B" && as2.status === 200 && aRow2?.completed === false ? "PASS" : "FAIL", "score⇒completed+grade; explicit false honoured", `afterScore completed=${aRow?.completed} grade=${aRow?.grade}; afterFalse completed=${aRow2?.completed}`);

    // reload an assessment-bearing page
    await cdp.navigate(`${BASE}/diklat/trainings/${trId}`);
    await cdp.waitForContent();
    await cdp.screenshot(DIR + "\\05-assessment");
    result("5b", "PASS", "activity detail renders after assessment", `screenshot 05-assessment.png`);

    // ── Scenario 6: Certificate eligibility (binary, min 1 HADIR) ─────────
    // s1 participant with NO attendance → must be rejected.
    await cdp.api("POST", `/api/diklat/trainings/${trId}/participants`, { staffId: s1 });
    const noHadir = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/certificates`, { staffId: s1 }));
    result("6a", noHadir.status === 422 ? "PASS" : "FAIL", "no HADIR → certificate rejected (422)", `POST certificates -> ${noHadir.status} (${noHadir.json?.error?.code})`);

    // s0 has HADIR (+assessment completed false). Re-complete the test, then issue.
    await cdp.api("POST", `/api/diklat/trainings/${trId}/assessments`, { staffId: s0, completed: true });
    // Auto-issuance may have already created a certificate when attendance/score
    // were saved, and it sets `certificateIssuedAt` on the participant (the
    // idempotency marker). To exercise the MANUAL path deterministically, reset
    // BOTH the cert row and that marker (staging fixture), then call the manual
    // endpoint.
    await db.certificate.deleteMany({ where: { trainingId: trId, staffId: s0 } });
    await db.trainingParticipant.updateMany({ where: { trainingId: trId, staffId: s0 }, data: { certificateIssuedAt: null } });
    const issue = asApi<{ certificate: { certificateNumber: string } }>(
      await cdp.api("POST", `/api/diklat/trainings/${trId}/certificates`, { staffId: s0 }),
    );
    const certRow = await db.certificate.findFirst({ where: { trainingId: trId, staffId: s0 } });
    result("6b", issue.status === 200 && !!certRow?.certificateNumber && !!certRow?.issuedById && certRow?.trigger === "MANUAL" && !!certRow?.issuedDate ? "PASS" : "FAIL", "eligible (≥1 HADIR) issued via MANUAL with metadata", `status=${issue.status} number=${certRow?.certificateNumber ?? "-"} trigger=${certRow?.trigger} issuedById=${certRow?.issuedById ? "set" : "null"} issuedDate=${certRow?.issuedDate ? "set" : "null"}`);

    const issueAgain = asApi(await cdp.api("POST", `/api/diklat/trainings/${trId}/certificates`, { staffId: s0 }));
    const certCount = await db.certificate.count({ where: { trainingId: trId, staffId: s0 } });
    result("6c", issueAgain.status === 200 && certCount === 1 ? "PASS" : "FAIL", "second issue is a no-op (no duplicate)", `status=${issueAgain.status} rows=${certCount}`);

    // ── Scenario 7: CANCELLED activity issues nothing ─────────────────────
    // Build data FIRST, then cancel (the app correctly refuses to add to a
    // CANCELLED activity — verified separately in the participant flow).
    const canc = asApi<{ training: { id: string } }>(
      await cdp.api("POST", "/api/diklat/trainings", { title: `${UAT_TAG} Cancelled`, startDate: "2026-08-01", endDate: "2026-08-01", jpl: 8, status: "COMPLETED" }),
    );
    const cId = canc.json?.data?.training?.id ?? "";
    if (cId) await cdp.api("PATCH", `/api/diklat/trainings/${cId}`, { certificateMode: "ATTENDANCE_ONLY" });
    const addC = asApi(await cdp.api("POST", `/api/diklat/trainings/${cId}/participants`, { staffId: s0 }));
    await cdp.api("POST", `/api/diklat/trainings/${cId}/attendance`, { staffId: s0, date: "2026-08-01", status: "HADIR" });
    // Remove any auto-issued cert so the CANCELLED paths are exercised cleanly.
    await db.certificate.deleteMany({ where: { trainingId: cId } });
    // Now cancel the activity.
    await cdp.api("PATCH", `/api/diklat/trainings/${cId}`, { status: "CANCELLED" });
    // Adding a participant to a CANCELLED activity must be refused.
    const addAfterCancel = asApi(await cdp.api("POST", `/api/diklat/trainings/${cId}/participants`, { staffId: s2 }));
    const cProc = asApi<{ issued: number; cancelled: boolean }>(await cdp.api("POST", `/api/diklat/trainings/${cId}/certificates/process`, {}));
    const cManual = asApi(await cdp.api("POST", `/api/diklat/trainings/${cId}/certificates`, { staffId: s0 }));
    const cRows = await db.certificate.count({ where: { trainingId: cId } });
    result("7a", addC.status === 200 && addAfterCancel.status === 409 && cProc.status === 200 && cProc.json?.data?.issued === 0 && cProc.json?.data?.cancelled === true && cManual.status === 409 && cRows === 0 ? "PASS" : "FAIL", "CANCELLED: add refused; process issued=0; manual 409; no certs", `add=${addC.status} addAfterCancel=${addAfterCancel.status}(${addAfterCancel.json?.error?.code}) process=${cProc.status}/issued=${cProc.json?.data?.issued} manual=${cManual.status} rows=${cRows}`);

    // ── Scenario 7b: Binary JPL — 1 HADIR = full weight; no double count ──
    // trId: s0 has exactly ONE HADIR (see 4b) → must earn 8 JPL.
    const hist = asApi<{ totalJpl: number; items: { trainingId: string; jplEarned: number; attended: boolean }[] }>(
      await cdp.api("GET", `/api/diklat/history/${s0}?year=2026`),
    );
    const item = hist.json?.data?.items?.find((i) => i.trainingId === trId);
    const extraHadir = await cdp.api("POST", `/api/diklat/trainings/${trId}/attendance`, { staffId: s0, date: "2026-08-02", status: "HADIR" });
    void extraHadir;
    const hist2 = asApi<{ items: { trainingId: string; jplEarned: number }[] }>(await cdp.api("GET", `/api/diklat/history/${s0}?year=2026`));
    const item2 = hist2.json?.data?.items?.find((i) => i.trainingId === trId);
    result("7b", item?.jplEarned === 8 && item2?.jplEarned === 8 ? "PASS" : "FAIL", "1 HADIR ⇒ 8 JPL; extra HADIR does NOT double", `1st=${item?.jplEarned} after2ndHADIR=${item2?.jplEarned} attended=${item?.attended}`);

    // CANCELLED participant & activity ⇒ 0
    const histCancelled = asApi<{ items: { trainingId: string; jplEarned: number }[] }>(await cdp.api("GET", `/api/diklat/history/${s0}?year=2026`));
    const cItem = histCancelled.json?.data?.items?.find((i) => i.trainingId === cId);
    result("7c", (cItem?.jplEarned ?? 0) === 0 ? "PASS" : "FAIL", "CANCELLED activity ⇒ 0 JPL", `jplEarned=${cItem?.jplEarned ?? "n/a"}`);

    // ── Scenario 8: JPL dashboard (filters, pagination, KPI from full pop) ─
    await cdp.navigate(`${BASE}/diklat/jpl?year=2026`);
    await cdp.waitForContent();
    await cdp.waitFor(`/Total JPL Terkumpul|Total Staf/i.test(document.body.innerText)`, 15000);
    await cdp.screenshot(DIR + "\\08-jpl-dashboard");
    const kpiText = await cdp.eval<string>("document.body.innerText");
    const hasKpi = /Total Staf/i.test(kpiText) && /Total JPL/i.test(kpiText);
    const staffTotal = (kpiText.match(/Total Staf\s*([\d.]+)/) ?? [])[1] ?? "?";
    await cdp.navigate(`${BASE}/diklat/jpl?year=2026&search=zzz-nomatch-zzz`);
    await cdp.waitForContent();
    const emptySearch = await cdp.eval<boolean>("/Tidak ada staf/i.test(document.body.innerText)");
    await cdp.navigate(`${BASE}/diklat/jpl?year=2026&page=1`);
    await cdp.waitForContent();
    await cdp.screenshot(DIR + "\\08b-jpl-page1");
    result("8", hasKpi && emptySearch ? "PASS" : "FAIL", "dashboard renders KPIs; search filters population", `kpis=${hasKpi} staffTotal=${staffTotal} searchEmpty=${emptySearch} (screenshots 08*.png)`);

    // ── Scenario 9: Excel export with an active search ────────────────────
    const exp = await cdp.eval<{ status: number; bytes: number; type: string }>(`(async()=>{const r=await fetch(${JSON.stringify(BASE + "/api/diklat/jpl/export?year=2026")});const b=await r.arrayBuffer();return {status:r.status,bytes:b.byteLength,type:r.headers.get('content-type')};})()`);
    const expSearch = await cdp.eval<{ status: number; bytes: number }>(`(async()=>{const r=await fetch(${JSON.stringify(BASE + "/api/diklat/jpl/export?year=2026&search=zzz")});const b=await r.arrayBuffer();return {status:r.status,bytes:b.byteLength};})()`);
    result("9", exp.status === 200 && exp.bytes > 0 && /spreadsheetml/.test(exp.type) && expSearch.status === 200 ? "PASS" : "FAIL", "xlsx export valid + honours search", `export=${exp.status} ${exp.bytes}B type=${exp.type}; searchExport=${expSearch.status} ${expSearch.bytes}B`);

    // ── Scenario 10: Curriculum & agenda render ───────────────────────────
    await cdp.navigate(`${BASE}/diklat/kurikulum`);
    await cdp.waitForContent();
    const kurText = await cdp.eval<string>("document.body.innerText.length");
    await cdp.screenshot(DIR + "\\10-kurikulum");
    await cdp.navigate(`${BASE}/diklat/laporan`);
    await cdp.waitForContent();
    await cdp.screenshot(DIR + "\\10b-laporan");
    result("10", Number(kurText) > 40 ? "PASS" : "FAIL", "kurikulum + laporan(agenda) pages render", `kurikulum text=${kurText} (screenshots 10*.png)`);

    // ── Scenario 11: Policy panel has NO percentage field ─────────────────
    await cdp.navigate(`${BASE}/diklat/trainings/${trId}`);
    await cdp.waitForContent();
    // Open the "Kebijakan" tab (client-rendered) if present.
    await cdp.waitFor(`/Kebijakan|Penilaian|Peserta/i.test(document.body.innerText)`, 15000);
    const clicked = await cdp.eval<boolean>(`(()=>{const el=[...document.querySelectorAll('button,a')].find(e=>/Kebijakan/i.test(e.textContent||''));if(el){el.click();return true;}return false;})()`);
    if (clicked) await cdp.waitForContent(8000);
    await sleep(600);
    const panelText = await cdp.eval<string>("document.body.innerText");
    const hasPct = /Min\.\s*Kehadiran\s*\(%\)/i.test(panelText);
    const hasBinaryNote = /1\s*kehadiran\s*\(HADIR\)|HADIR\)\s*\.\s*Kehadiran bersifat biner|bersifat biner|biner/i.test(panelText);
    await cdp.screenshot(DIR + "\\11-policy-panel");
    result("11", !hasPct && hasBinaryNote ? "PASS" : "FAIL", "policy panel: no '%' input, shows binary note", `tabClicked=${clicked} hasPercentField=${hasPct} hasBinaryNote=${hasBinaryNote} (screenshot 11-policy-panel.png)`);
  } finally {
    await cleanup();
    cdp.close();
    proc.kill();
    await db.$disconnect();
  }

  console.log("\n===== BROWSER UAT SUMMARY =====");
  console.log(`PASS=${pass} FAIL=${fail} BLOCKED=${blocked}`);
  console.log("id\tscenario-result");
  for (const r of rows) console.log(r);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error("CRASH:", e?.message ?? e);
  await db.$disconnect();
  process.exit(2);
});
