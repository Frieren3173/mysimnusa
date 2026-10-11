# Audit Findings — MYSIMNUSA

Status per pembaruan terakhir. Basline: branch `feat/full-revision-v1` @ `edde303`.

## Ringkasan severitas
| Severity | Ditemukan | Diperbaiki | Tersisa |
|---|---|---|---|
| P0 | 0 | 0 | 0 |
| P1 | 1 | 1 | 0 |
| P2 | 3 | 2 | 1 (UI register = enhancement) |
| P3 | 1 | 1 | 0 |

## Temuan

### FIND-PR-01 (P2, Register Pasien) — Fitur belum ada → **IMPLEMENTED** (backend + migration teruji)
- **Sebelumnya:** tidak ada model/tabel/endpoint register pasien; desain existing anonim.
- **Perubahan:** model `PatientRegisterEntry` + endpoint `GET/POST /api/borang/patient-register` + parser validasi + migration `20261018000001_patient_register`.
- **Otorisasi:** hanya Kepala Ruang ruangannya (atau superadmin) untuk upload; read scoped.
- **Migration:** diuji pada DB disposable (`ep-autumn-field`); **belum** diterapkan ke staging/produksi (menunggu keputusan).
- **Tersisa (P2 enhancement):** UI unggah register + pemilih pasien pada form Borang (backend siap).

### FIND-WF-01 (P1, Borang) — Hasil cetak final tidak digate di backend — **FIXED**
- `FINAL_PRINTABLE_STATUSES` + `canPrintFinal()`; export filter status + 409 + ownership. Regression: `borang-export-gate.test.ts` (5).

### FIND-01 (P2, Borang/D4) — Penomoran kode tindakan gap & query berulang — **FIXED**
- `borang-actions.ts` monotonik & sekali query. Regression: `borang-actions-integration.test.ts` (5).

### FIND-02 (P3, Test harness) — Fake DB tidak menghormati `mode: "insensitive"` — **FIXED**
- `tests/helpers/fake-db.ts` `matchScalar` diperbaiki.

### FIND-VIEWER-01 (—, Role) — VIEWER sesuai read-only — **NO FIX NEEDED**
- `VIEWER` memiliki read Komite/Borang/Diklat, tanpa write/verify/print/upload. Terkunci di `role-permission-matrix.test.ts`.


## Area yang diaudit — TANPA temuan (PASS)

| Area | Bukti |
|---|---|
| RBAC guards | 67 handler di `src/server/api`; semua non-publik memanggil `checkPermission`/`checkAnyPermission`/`requireMigrationUser`/superadmin. Tidak ada endpoint tanpa guard. |
| Migration admin | 17 handler `admin-migration-*` memakai `requireMigrationUser()` (menolak non-superadmin) — `src/lib/migration/auth.ts:7-12`. |
| Diklat eligibility | `src/lib/diklat/certificate-policy.ts:102-148` — ≥1 HADIR, SAKIT/IZIN bukan HADIR, `minAttendanceRate` diabaikan, `minScore` dihormati. 20 test. |
| Nav | 27 href, 0 duplikat; menu "Dashboard JPL" dihapus (`nav.ts:95` komentar). |
| RKK integrasi | 361 dokumen, jenjang PK1 296/PK2 39/BK1 21/BK2 5, MIME 358 PDF + 3 DOCX, provider `local`, `DocumentType RKK` ada & konsisten. Idempotent (`legacySourceId`). |
| Formula injection | `src/lib/spreadsheet.ts` netralisir sel formula; dipakai `xlsx-export.ts`. |
| TODO/dummy/console | Tidak ada TODO/FIXME; tidak ada `console.log` di `src/server`; "dummy/placeholder" yang ada valid (template sertifikat, timing-equalizer login). |
| Smoke HTTP | Semua route utama: **tidak ada HTTP 500** (200 publik / 307 auth). |

## BLOCKED (tidak dapat diverifikasi tanpa kredensial/alat)
- **Browser/authenticated UAT**: sesi kedaluwarsa (401), tidak ada `UAT_PASSWORD`, dan dilarang meminta password akun nyata → tidak dapat login. Ditandai BLOCKED.
- **Load test 400 pengguna**: tidak ada tool (k6/Artillery) & env terisolasi → TIDAK dijalankan; kapasitas tidak diklaim.
- **Register pasien (D6/D7/D8)**: belum ada model/tabel/template di repo → fitur belum tersedia (bukan bug).

## Keputusan pemilik (menunggu)
- 8 unmatched & 3 NEEDS_REVIEW RKK.
- Register pasien: persetujuan migration + definisi import.
- Pemetaan role pengguna aktual (Kasi Keperawatan, Admin Diklat/Borang).
- Staff "Cetak Borang" (klarifikasi cakupan).
