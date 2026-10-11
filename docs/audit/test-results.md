# Test Results — MYSIMNUSA (Staging Migration & Verification)

Dijalankan: 2026-10-10 · branch `feat/full-revision-v1` @ `edde303` (working tree: perubahan belum di-commit).

## Perintah & hasil aktual
| Perintah | Exit | Hasil |
|---|---|---|
| `npx tsc --noEmit` | 0 | **PASS** |
| `npm run lint` | 0 | **PASS** (0 error/0 warning) |
| `npm test` | 0 | **PASS** — 39 file, **413 passed / 2 skipped / 0 failed** |
| `npm run build` | 0 | **PASS** |
| `git diff --check` | 0 | **PASS** |
| Smoke HTTP | — | `/borang/register` 307; endpoint register/export 401 tanpa auth — **tidak ada 500** |

## Migration (bukti)
| Target | Status | Bukti |
|---|---|---|
| Disposable `ep-autumn-field` | diterapkan & diuji | `migrate deploy` exit 0; smoke OK |
| **Staging `ep-flat-shadow`** | **diterapkan** | `migrate deploy` exit 0; `migrate status` = "up to date"; index `..._roomId_rmNumber_key` (unique) + FK `..._roomId_fkey`; smoke Prisma insert+read OK; P2002 unique OK; cleanup OK |
| Produksi `ep-orange-dew` | **tidak diterapkan** | di luar tugas |

## Test register pasien (semua lulus)
- parser (10) · endpoint authz/scoping/verify RM (12) · template kompatibel parser (2).
- Regression relevan: workflow (10), export gate (5), RBAC (13) — tanpa regresi.

## Skipped / Blokir
| Item | Status | Alasan |
|---|---|---|
| `diklat-integration-staging.test.ts` (2) | SKIPPED | staging-gated by design |
| UAT browser / HTTP terautentikasi | BLOCKED | tanpa sesi/kredensial |
| Load test 400 pengguna | BLOCKED | tanpa tool/env |
| Migration produksi | BLOCKED | butuh persetujuan eksplisit |
