# Security & RBAC Audit — MYSIMNUSA

## 1. Cakupan authorization (read-only)
- **67** handler di `src/server/api`. Audit: **tidak ada** handler non-publik yang melewatkan authorization.
  - `checkPermission`/`checkAnyPermission`: mayoritas modul (komite, borang, diklat, admin-*).
  - `requireMigrationUser()` (`src/lib/migration/auth.ts:7-12`): 17 handler `admin-migration-*` → hanya `admin.migration.manage` atau superadmin.
  - Publik (wajar): `auth-login`, `auth-logout`, `csp-report`.
  - `admin-migration-google-callback`: cek `hasPermission(ADMIN_MIGRATION) || isSuperAdmin()`.

## 2. Matriks role × modul (dari `src/lib/constants.ts` + `ROLE_PERMISSIONS`)
| Role | Komite | Borang | Diklat | Admin |
|---|---|---|---|---|
| SUPERADMIN | semua | semua | semua | semua |
| KOMITE_KEPERAWATAN_KEBIDANAN (Admin_Komite) | read/create/update/delete + license + competency + document | read | read | — |
| DIKLAT_BORANG (Sekretariat: Admin Borang+Diklat) | read | read/archive/admin_review/print/complete | full | — |
| ADMIN_BORANG (legacy Sekretariat) | read | read/create/update/submit/verify/approve/reject/archive + admin_review/print/complete | — | — |
| ADMIN_DIKLAT (legacy) | read | — | read/create/update/manage_* + certificate | — |
| USER (Staff) | read | read/create/update/submit | — | — |
| KEPALA_RUANG | read | read/karu_review | — | — |
| VIEWER (read-only; pola "Kasi Keperawatan") | read | read | read | — |

Terkunci oleh `tests/role-permission-matrix.test.ts` (**12 test**).

### Pemetaan tahap verifikasi Borang → permission
| Tahap | Permission | Role |
|---|---|---|
| Staff submit | `borang.logbook.submit` | USER |
| Tahap 1 (Kepala Ruang) | `borang.karu.review` | KEPALA_RUANG |
| Tahap 2 (Sekretariat) | `borang.admin.review` | DIKLAT_BORANG, ADMIN_BORANG |
| Cetak & selesai | `borang.press.print`, `borang.press.complete` | DIKLAT_BORANG, ADMIN_BORANG |

### Catatan role (keputusan pemilik)
- **Sekretariat Keperawatan & Kebidanan** dipetakan ke `DIKLAT_BORANG` (business) / `ADMIN_BORANG` (legacy) — keduanya memegang verifikasi tahap 2 + cetak. **Tidak dibuat role baru** (permission existing memadai).
- **Kasi Keperawatan (read-only)** fungsional setara role **`VIEWER`** (read semua modul, tanpa tulis). Membuat role literal `KASI_KEPERAWATAN` = entri tabel `roles` (butuh seed/migration) → **menunggu keputusan pemilik**; tidak diubah massal.
- Role tidak saling bertentangan dengan requirement; tidak ada eskalasi lintas modul.

## 3. Room scoping (cross-room isolation)
- `src/lib/borang-scope.ts` (`canAccessBorangEntry`, `borangListWhere`) + `canReviewAsKaru` (`borang-workflow.ts`).
- Kepala Ruang hanya dapat akses/verifikasi ruangan yang ditugaskan (snapshot `kepalaRuangUserId` atau `assignedRoomIds`).
- Diverifikasi: `tests/borang-workflow-integration.test.ts` — cross-room ditolak (403 FORBIDDEN_ROOM); superadmin lintas ruangan.

## 4. Autentikasi & session
- Cookie `rsajt_session`: `httpOnly`, `secure` (production), `sameSite: lax` (`src/lib/auth.ts:48-50`) → mitigasi dasar CSRF/XSS-cookie-theft.
- Sesi diverifikasi dari DB (`session.findUnique` + user aktif); token JWT diverifikasi.

## 5. Header keamanan (`next.config.ts`)
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (production), CSP (report-only default; enforce via `CSP_MODE=enforce`).

## 6. Download dokumen
- `documents-$id$-download.ts`: auth (`komite.document.read`), `nosniff`, `CSP: sandbox`, `Cache-Control: private`; MIME dari ekstensi key (bukan mimeType tersimpan) — aman.

## 7. Upload file
- `komite-staff-$id$-documents.ts`: `validateUpload` (ekstensi + **magic bytes**, tidak percaya `file.type`), batas 15 MB, key storage `staff/<id>/<code>/<uuid>` (tanpa input path pengguna → mitigasi path traversal).

## 8. Input validation
- Zod pada semua body API (mis. borang, diklat, komite). Prisma parameterized (tidak ada raw SQL dengan input pengguna).

## 9. Rate limiting
- `login_attempts` (login rate limit) — ada; `tests/login-rate-limit.test.ts` (15 test).

## 10. Register pasien per ruangan (Task 3) — SELESAI (backend) & dipetakan
- Model `PatientRegisterEntry` (per ruangan) + endpoint `GET/POST /api/borang/patient-register` (lihat `docs/audit/patient-register.md`).
- **Upload/manage:** hanya **Kepala Ruang ruangannya** (gate `borang.karu.review` + `RoomKepalaRuang`), superadmin bypass.
- **Read:** superadmin/sekretariat semua; Kepala Ruang ruangannya; Staff ruangan sendiri.
- Staff/VIEWER/role lain ditolak upload (403) — diuji.
- Migration `20261018000001_patient_register` diuji pada **DB disposable** (`ep-autumn-field`); belum diterapkan ke staging/produksi.
- **Tersisa:** UI (unggah + pemilih pasien di form Borang).

## 11. Temuan keamanan
- **Tidak ada P0/P1** ditemukan dalam cakupan yang diaudit.
- Risiko tersisa: `legacySourceId` belum `@unique`; CSP default report-only.

## 12. BLOCKED
- Verifikasi authorization end-to-end via browser (tanpa sesi).
- Penerapan migration ke staging/produksi (menunggu keputusan).
