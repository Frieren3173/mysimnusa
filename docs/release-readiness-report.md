# Release Readiness Report — MYSIMNUSA

Tanggal: 2026-10-10 · Branch `feat/full-revision-v1` @ `edde303`.

## Status: **READY WITH KNOWN LIMITATIONS**

Tidak ada P0/P1; semua gate teknis lulus (413 test, tsc, lint, build); **Browser UAT staging terautentikasi dijalankan (10/10 PASS)** untuk register pasien + print gate. **Keterbatasan:** UAT belum mencakup seluruh modul (Diklat/Komite alur panjang) & load test; migration **produksi belum diterapkan** (butuh persetujuan). **Bukan izin deploy.**

## A. Ringkasan
- **Fokus tugas ini:** final staging UAT (register + workflow/print), audit kesiapan produksi (read-only), role/RKK, quality gate.
- **Temuan:** tidak ada bug baru; 2 "FAIL" awal UAT ternyata **cacat harness** (dibuktikan; gate berperilaku benar).
- **Keputusan pemilik:** 3.

## B. Hasil pengujian (aktual)
| Jenis | Hasil |
|---|---|
| Unit + Integration (`npm test`) | **413 passed / 2 skipped / 0 failed** (39 file) |
| **Browser UAT staging (headless Chrome, sesi fixture)** | **10/10 PASS** (lihat §C) |
| Typecheck / Lint / Build / `git diff --check` | semua **exit 0** |
| Load test 400 pengguna | **BLOCKED** (tanpa tool/env) |

## C. Browser UAT staging (terautentikasi) — 2026-10-10
Metode: headless Chrome via CDP + **sesi sah** dibuat untuk akun **fixture UAT staging** (`uat.karu`, `uat.user`, `superadmin`) memakai `createSession` aplikasi (tanpa meminta/menuliskan password). Data uji sintetis; dibersihkan setelahnya.

| ID | Skenario | Status | Bukti |
|---|---|---|---|
| A1 | Halaman Register Pasien dimuat (Kepala Ruang) | PASS | render + screenshot `uat-register-karu.png` |
| B1 | Unduh template (format impor) | PASS | HTTP 200, xlsx 16401B |
| C1 | Kepala Ruang upload ruangannya sendiri | PASS | HTTP 200 |
| D1 | Upload ruangan LAIN ditolak | PASS | HTTP 403 |
| E1 | Staff upload ditolak | PASS | HTTP 403 |
| F1 | Verifikasi RM (ruangan sendiri) | PASS | HTTP 200 |
| F2 | Verifikasi RM lintas ruangan ditolak | PASS | HTTP 403 |
| G1 | Cetak final diblokir (staff tanpa verifikasi) | PASS | HTTP 409 |
| G2 | Cetak diblokir saat hanya DRAFT | PASS | HTTP 409 |
| G3 | Cetak diizinkan setelah READY_TO_PRINT (printer) | PASS | HTTP 200 |

Pembersihan terverifikasi: 0 ruangan synthetic, 0 baris register, 0 staff/entry synthetic tersisa; sesi fixture dihapus.

## D. Migration (status aktual)
| Target | Status |
|---|---|
| Disposable `ep-autumn-field-b3wbob81` | diterapkan & diuji (latihan) |
| **Staging `ep-flat-shadow-b3vifsk0`** | **DITERAPKAN & terverifikasi** (unique/FK/smoke OK) |
| Produksi `ep-orange-dew-b389r3mr` | **BELUM** (dalam tugas ini tidak dijalankan) |

## E. Rencana deployment bertahap (rekomendasi; belum dijalankan)
1. **Preflight produksi:** pastikan backup/PITR Neon production tersedia (bukti faktual).
2. **Urutan:** produksi saat ini di `20261014000001`. Terapkan migration berurutan `…borang_kepala_ruang_workflow → …diklat_certificate_policy → …certificate_unique → …diklat_jpl_curriculum → …training_attendance_unique → …patient_register` via `prisma migrate deploy` (koneksi unpooled).
3. **Verifikasi:** `migrate status` = up to date; index/FK/unique `patient_register_entries` ada; smoke Prisma.
4. **Deploy aplikasi** (Vercel) setelah migration.
5. **Smoke test produksi** (read-only) + UAT manual pemilik.
6. **Rollback:** deployment rollback Vercel (kode). Migration bersifat **aditif** → tidak perlu rollback data; bila perlu, restore dari snapshot Neon.

## F. Role VIEWER (Kasi Keperawatan)
- Read-only untuk dashboard Komite/Borang/Diklat (`komite.staff.read`, `borang.logbook.read`, `diklat.training.read`) + `komite.license.read`.
- Tidak: create/update/delete/verify/upload register/print. Dikunci di `role-permission-matrix.test.ts`. **Tidak diperluas.**

## G. 11 dokumen RKK (tertahan)
- 8 unmatched + 3 NEEDS_REVIEW — **tetap tertahan**, tidak diimpor/diubah/diunggah. Artefak (`RKK_review_report.md`, `validation-report.json`) tersedia. 361 dokumen verified tidak tersentuh.

## H. Status Git
- Branch `feat/full-revision-v1`, HEAD `edde303` — **tidak berubah**. **Tidak ada commit/push/merge/deploy**; data/config produksi tidak diubah; migration hanya **staging**; 11 dokumen RKK tidak disentuh.

## I. File laporan
`docs/audit/{patient-register,test-results,progress,findings,security-rbac,functional-matrix,performance,backlog,baseline}.md` + `docs/release-readiness-report.md`.

## J. Keputusan yang dibutuhkan pemilik
1. **Migration produksi** `patient_register` + deployment (persetujuan eksplisit).
2. **11 dokumen RKK** — konfirmasi identitas/jenjang.
3. **Role "Kasi Keperawatan"** — cukup `VIEWER`?
