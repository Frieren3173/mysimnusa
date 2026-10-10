# Browser UAT Checklist — Diklat/IHT (staging)

**Purpose.** Two ways to run Diklat/IHT UAT on **staging only**:
1. **Automated browser UAT** — headless Chrome driven via the Chrome DevTools
   Protocol (no new dependencies; uses Node's global `WebSocket`). See below.
2. **Manual checklist** — the same flows performed by a human in a real browser.

> ⚠️ Do **NOT** run any UAT script against production data. Every UAT script
> refuses a non-staging host before opening a connection. Use the isolated
> staging branch (`ep-flat-shadow…`) and the UAT accounts created by
> `scripts/seed-uat-fixtures.mts`.

## Automated UAT scripts (new location)

| Script | Purpose |
|---|---|
| `scripts/uat/_cdp.ts` | Minimal Chrome DevTools Protocol driver (no dependencies). |
| `scripts/uat/_uat-browser.mts` | Full browser UAT (login form, activity, participants, attendance, assessment, certificates, JPL dashboard/export, policy panel); screenshots + DB assertions; cleans up its own `UATX` fixtures. |
| `scripts/_fixv.mts` | API-level staging verification of the audit fixes (B1–B6, C2, C3). Kept in `scripts/` (standalone, like `scripts/check-borang-duplicates.mts`). |

### Running the automated UAT (staging only)

Requirements:
- Staging app running (default `http://localhost:3230`), built from the current code.
- A **staging** database URL — the script aborts unless the host contains `ep-flat-shadow`.
- Credentials via environment (never hardcoded, never printed):
  - `UAT_PASSWORD` — **required**; the authenticated checks are skipped safely if absent.
  - `UAT_USER` (optional, default `superadmin`).

```powershell
# 1. Point at the ISOLATED staging database (never production).
$env:DATABASE_URL_UNPOOLED = "<staging url>"     # host must contain ep-flat-shadow
$env:UAT_PASSWORD = "<your uat password>"        # value is never printed
$env:FIX_BASE = "http://localhost:3230"

# 2. Run the browser UAT (writes only its own UATX/UATDIAG/FIXV fixtures, then deletes them).
npx tsx scripts/uat/_uat-browser.mts
```

**Data cleanup.** `_uat-browser.mts` deletes every activity it creates (titles
prefixed `UATX`) in a `finally` block, so no fixture is left behind. `_fixv.mts`
cleans its `FIXV` fixtures the same way. If a run is interrupted, remove leftover
rows titled `UATX…`/`FIXV…` from staging only.

## Prerequisites (staging)

1. Staging app is running (default `http://localhost:3230`).
2. UAT accounts exist: run once with the staging DB URL + a password you choose:
   ```powershell
   $env:STAGING_DB_HOST = "<staging host, must contain ep-flat-shadow>"
   $env:DATABASE_URL_UNPOOLED = "<staging url>"
   $env:UAT_PASSWORD = "<your uat password>"   # REQUIRED (no default is baked in)
   npx tsx scripts/seed-uat-fixtures.mts
   ```
3. Record the UAT password you set (it is never printed by the script).

## Checklist

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| 1 | Login & roles | Log in as `superadmin`, then `uat.diklat`, `uat.user` | Correct menu/permissions per role; 403 on forbidden pages |
| 2 | Create/edit activity (IHT) | Diklat → Kegiatan → create with dates, JPL, certificate policy (mode A/B/C) | Saved; appears in list; editing one date can’t make end < start |
| 3 | Participants & quota | Add participants; set a capacity; add beyond it; cancel one and add again | Over-capacity → "Kuota penuh"; a CANCELLED seat frees one slot |
| 4 | Attendance (notes) | Record HADIR with a note; change status WITHOUT editing the note; then clear the note | Note preserved on status-only change; explicit clear empties it; one row per (staff, day) |
| 5 | Assessment | Save a score (no “completed”); toggle completed true; then false | Score implies completed=true; explicit false is honoured; grade derived from score |
| 6 | Certificate issue — eligible vs not | For a participant with NO HADIR → try issue; add ONE HADIR (+passing score for mode B/C) → issue again; click issue twice | No HADIR → rejected with reason, no certificate; ≥1 HADIR (+test/score per mode) → issued; second click is a no-op (no duplicate). A stored legacy `minAttendanceRate` (e.g. 100) does NOT block a single-HADIR participant |
| 7 | CANCELLED activity | Set an activity to CANCELLED; try manual issue, batch process, and .pptx generate | All three refuse/skip; no certificate rows; JPL contribution = 0 |
| 7b | Binary JPL (rules) | Create an 8-JPL activity; add a participant; record ONE HADIR; view dashboard & the staff history | Full 8 JPL (not a percentage/proration). Several HADIR on the same activity still = 8 (no double count). SAKIT/IZIN only = 0 JPL |
| 8 | JPL dashboard | Open Diklat → Dashboard JPL; change year/room/search; page through | KPI counts are from the FULL filter (not the page); pagination preserved filter/search; staff with no activity show 0 JPL |
| 9 | Excel export | With a search active, click “Ekspor Excel” | .xlsx downloads; contains only the searched rows; numbers match the dashboard AND the staff history |
| 10 | Curriculum & agenda | Diklat → Kurikulum and Agenda | Items/agenda render; a CANCELLED realisation is still visible with a cancelled status |
| 11 | Policy panel (no % field) | Open the certificate policy panel for an activity | No “Min. Kehadiran (%)” input; a note stating “minimal 1 HADIR (biner)” is shown; mode/test/score controls still work |

## Sign-off

- Tester: ______  Date: ______  Environment: staging
- Result: ☐ Pass  ☐ Fail (attach notes/screenshots)
- Any FAIL: capture the exact activity ID, participant, and timestamp for triage.
