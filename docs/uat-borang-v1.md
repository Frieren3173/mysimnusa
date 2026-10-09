# Borang Workflow V1 — UAT Readiness

Branch: `feat/borang-workflow-v1` · Commit: `dbe636b`
Status: **staging + Preview wired to an ISOLATED database; UAT not yet executed.**

> Do **not** run write-based UAT against Production. Preview is wired to an
> isolated Neon branch (see below). Production env and data are untouched.

---

## 1. Environment matrix (names/targets only — no secret values)

| Variable | Production | Preview (`feat/borang-workflow-v1`) | Development (local) |
|---|---|---|---|
| `DATABASE_URL` | ✅ (prod Neon) | ✅ **staging Neon branch** | via `.env` (local) |
| `DATABASE_URL_UNPOOLED` | ✅ (prod Neon) | ✅ **staging Neon branch** | via `.env` (local) |
| `AUTH_SECRET` | ✅ | ✅ (preview-only secret) | via `.env` (local) |
| `GOOGLE_*`, `STORAGE_PROVIDER`, `NEXT_PUBLIC_*`, `NEXTAUTH_URL` | ✅ | ➖ not set (not needed by the Borang flow) | via `.env` |

- Before this work: **all** Vercel env vars were scoped to `production` **only**,
  so Preview deployments had **no `DATABASE_URL`** (they could not write to
  production — and could not run at all).
- Added (Preview only, git-branch scoped to `feat/borang-workflow-v1`):
  `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`.
  **No Production variable was created, edited, or removed.**

## 2. Isolated staging database

| Item | Value |
|---|---|
| Neon project | `RSAJT Nursing Management` (`round-mud-19247174`) |
| Branch | `uat-borang-v1` (`br-lingering-rain-b3rz7gzj`) |
| Parent | `production` (point-in-time copy — schema + seed, isolated thereafter) |
| Compute host | `ep-flat-shadow-b3vifsk0*.c-4.ap-southeast-1.aws.neon.tech` |
| Migrations | 10 / 10 applied — **schema up to date** (verified via `prisma migrate status`) |
| Baseline | staff 369, rooms 17, roles 12, permissions 40, borang 0 |

Read-only verification so far: `borang = 2`, `mappings = 1` (created by the smoke
run). Production still reports `borang = 0`, `mappings = 0`.

## 3. Migrations

`20261014000001_borang_kepala_ruang_workflow` is present and already applied on
staging (inherited from the production copy). **No migration was run against
Production during this work.**

## 4. UAT test accounts (staging only)

Provisioned by `scripts/seed-uat-fixtures.mts` (guarded to the staging host).

| Username | Role | Notes |
|---|---|---|
| `superadmin` | SUPERADMIN | password reset to the UAT default (staging only) |
| `uat.komite` | KOMITE_KEPERAWATAN_KEBIDANAN | committee-only |
| `uat.diklat` | DIKLAT_BORANG | secretariat |
| `uat.user` | USER | linked to a staff row in the mapped room |
| `uat.karu` | KEPALA_RUANG | assigned as Kepala Ruang of `ICU` |

- Shared password: the value of `UAT_PASSWORD` used when seeding (default in the
  script). **Rotate/confirm out-of-band; do not commit the real password.**
- Room mapping: **`ICU` → `uat.karu`**. Room **`IGD` is intentionally unmapped**
  (negative test: submit must be blocked; KARU of ICU must not review IGD).

## 5. Run the UAT

1. Open the environment-aware Preview for the UAT branch (Vercel SSO required —
   use a team account):
   `https://mysimnusa-m0is7o7qc-frie-why.vercel.app` (branch HEAD `92c8462`,
   docs-only on top of the tested code `dbe636b`; inherits the staging env vars).
   Any Preview created before the staging env vars were attached must **not** be
   used.
2. Sign in with each `uat.*` account and execute `docs/uat-checklist.md`.
3. Record pass/fail + screenshots per resolution.
4. Capture any defect with: role, action, expected vs actual, network response.

## 6. Known prerequisites / limitations

- **Vercel SSO** protects all Preview URLs — global access must be via the Vercel
  team (or add the UAT users to the team; or a protection bypass for the branch).
- **Google Drive / storage** env vars are not set on Preview → document
  upload/thumbnail flows are out of scope for this UAT (they are not part of the
  Borang workflow).
- **Email/WhatsApp** notifications are out of scope in V1 (in-app only).
- Signature and physical print/stamp steps are manual (no digital signature in V1).
