# Patient Register — Implementasi & Verifikasi

## Ringkasan
Register pasien per ruangan **diimplementasikan** (model + endpoint + validasi + migration teruji pada DB disposable). Hanya **Kepala Ruang** yang dapat mengunggah/mengelola register **ruangannya** — ditegakkan server-side.

## Desain data
Model baru (aditif): `PatientRegisterEntry` (`prisma/schema.prisma`).
| Field | Tipe | Catatan |
|---|---|---|
| id | String @id | cuid |
| roomId | String | FK → `Room` (onDelete Cascade) |
| no | Int? | nomor urut dari file (informasional) |
| patientName | String | nama pasien (permintaan pemilik) |
| rmNumber | String | nomor rekam medis (identifier stabil) |
| diagnosis | String? | diagnosis |
| createdById | String? | pengunggah |
| createdAt/updatedAt | DateTime | konvensi aplikasi |

Constraints: `@@unique([roomId, rmNumber])` (dedup + matching), `@@index([roomId])`, FK `roomId → rooms(id)`.

> **Tidak** mengubah `BorangEntry.patientIdentifier` anonim (form `TN.X`/`NY.Y`, RM acak) — register terpisah, sesuai instruksi kompatibilitas.

## Migration
`prisma/migrations/20261018000001_patient_register/migration.sql` — **aditif** (CREATE TABLE + 2 index + FK; tanpa DROP/ALTER data).

## Isolasi & uji DB disposable (bukti)
- Target uji: branch Neon **`scratch-rebuild-test`** → host **`ep-autumn-field-b3wbob81`** — **berbeda** dari produksi (`ep-orange-dew…`) & staging (`ep-flat-shadow…`). Terverifikasi sebelum menulis (guard menolak host non-`ep-autumn-field`).
- `prisma migrate deploy` ke disposable → **semua migration diterapkan** (termasuk `20261018000001_patient_register`).
- Verifikasi schema disposable: tabel ada; index `patient_register_entries_pkey`, `patient_register_entries_roomId_idx`, `patient_register_entries_roomId_rmNumber_key`; FK `patient_register_entries_roomId_fkey`.
- Smoke fungsional: Prisma insert+read OK; **unique(roomId, rmNumber) ditegakkan** (P2002); data sintetis dibersihkan.
- **Produksi & staging TIDAK diterapkan.** Penerapan staging/produksi = menunggu keputusan pemilik.

## Otorisasi (server-side)
| Operasi | Gate | Room scoping |
|---|---|---|
| Upload/manage register | `borang.karu.review` (hanya Kepala Ruang; superadmin bypass) | room harus ∈ `RoomKepalaRuang` milik aktor |
| Baca register | `borang.logbook.read` | superadmin/sekretariat → semua; Kepala Ruang → ruangannya; Staff → ruangan sendiri (via `staff.roomId`) |

- Staff/VIEWER/role lain → **403** pada upload (diuji).
- Validasi: format (.xlsx/.xls/.csv), ukuran ≤5 MB, header wajib (Nama Pasien, Nomor RM), baris kosong dilewati, RM kosong/duplikat → tolak; **all-or-nothing** (tak ada import parsial).
- Kebijakan update: **add-or-update by (roomId, rmNumber)**; baris lama yang tidak ada di file **dipertahankan** (tidak ada mass-delete).

## Endpoint
- `GET  /api/borang/patient-register?roomId=` — list (scoped). Opsional `&rm=<no>` → verifikasi satu RM di register ruangan ini (404 bila tidak ada; nama pasien **tidak** dikembalikan).
- `POST /api/borang/patient-register` (multipart: roomId + file) — import.
- `GET  /api/borang/patient-register/template` — unduh template Excel (header persis = parser).

## UI
- **Halaman `(/borang/register)`** — `src/app/(dashboard)/borang/register/page.tsx` (server) + `patient-register-client.tsx`.
  - Gate: `borang.karu.review` (Kepala Ruang; superadmin bypass).
  - Memuat HANYA ruangan yang dikelola aktor (RoomKepalaRuang; superadmin semua).
  - Fitur: pilih ruangan, unduh template, unggah file, lihat hasil import (created/updated) & kesalahan per baris, tabel register tersimpan + pencarian.
  - Role tanpa kewenangan tidak melihat menu/kontrol; API tetap menolak (server-side).
- **Nav:** item "Register Pasien" (`/borang/register`) di grup Borang, permission `borang.karu.review`.
- **Pemilih pasien di form Logbook** — `logbook/logbook-client.tsx` + `register-picker.tsx`:
  - Muncul saat ruangan dipilih; memuat register ruangan (scoped).
  - "Sisipkan RM ke catatan" → **memverifikasi RM di server** dulu (GET `&rm=`), lalu menambahkan rujukan `RM: <no>` ke **catatan**.
  - **Nama pasien TIDAK disimpan** ke Borang — identifier Borang tetap anonim (kompatibilitas dipertahankan).
  - Empty state informatif bila register kosong.

## Prasyarat deployment (migration)
- **STAGING: sudah diterapkan** (2026-10-10) — `20261018000001_patient_register` via `prisma migrate deploy` ke host **`ep-flat-shadow-b3vifsk0`** (staging, terverifikasi ≠ produksi). `migrate status`: "Database schema is up to date!".
- Verifikasi pasca-migration (staging): index `..._pkey`, `..._roomId_idx`, `..._roomId_rmNumber_key` (unique), FK `..._roomId_fkey`; Prisma insert+read OK; unique(roomId, rmNumber) → P2002; data sintetis dibersihkan.
- **PRODUKSI: BELUM diterapkan** (dan tidak dalam tugas ini). Penerapan produksi = persetujuan eksplisit terpisah.
- Migration sebelumnya juga telah diuji pada DB disposable `ep-autumn-field` sebagai latihan.

## Test
- `tests/patient-register.test.ts` (10) — parser/validasi.
- `tests/patient-register-endpoint.test.ts` (12) — upload authz + read scoping + verify RM.
- `tests/patient-register-template.test.ts` (2) — template kompatibel parser.
- Relevan: `borang-workflow-integration` (10), `borang-export-gate` (5), `role-permission-matrix` (13).

## UAT integrasi (status)
- **API/integration (unit+route)**: PASS (semua skenario authz/scoping/validasi).
- **DB staging**: PASS (migration diterapkan; smoke Prisma OK).
- **HTTP terautentikasi end-to-end / browser**: **BLOCKED** — tanpa sesi/kredensial (dilarang meminta password akun nyata). Smoke publik: endpoint register/export → 401 tanpa auth; `/borang/register` → 307 (auth).
