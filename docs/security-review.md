# Security Review — MYSIMNUSA (tahap 2)

Tinjauan keamanan modul yang belum diperiksa pada tahap 1. Setiap temuan dicatat
sebagai **Diperbaiki** atau **Dilaporkan** (butuh keputusan kebijakan, tidak
diubah). Tidak ada perubahan tampilan/layout/animation/copywriting.

Legenda risiko: **Tinggi** / **Sedang** / **Rendah** / **Info**.

---

## a) Slides — path traversal

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| `src/lib/slides.ts` | `isSafeSlideName` hanya cek regex + `path.resolve`; belum menolak null byte eksplisit, dotfile, atau panjang berlebih | Sedang | **Diperbaiki** |
| `src/server/api/admin-slides-$name$.ts` | `path.join(SLIDES_DIR, decoded)` memakai nama mentah; `decodeURIComponent` ganda | Sedang | **Diperbaiki** |
| `src/server/api/admin-slides.ts` | Hapus (DELETE) hanya untuk `ADMIN_SETTINGS` | — | Sudah benar (tidak diubah) |

**Perbaikan:** `isSafeSlideName` kini allow-list ketat (`^[A-Za-z0-9][A-Za-z0-9._-]*$`,
tanpa `..`, tanpa `/` `\`, tanpa dotfile, panjang ≤ 200, ekstensi gambar
whitelist). Ditambah `resolveSlidePath()` yang memastikan hasil resolve berisi
persis di direktori `SLIDES_DIR`. Handler DELETE memakai `resolveSlidePath()` dan
tidak lagi `decodeURIComponent` sendiri (router sudah men-decode). Tulis/hapus
tetap hanya `PERMISSIONS.ADMIN_SETTINGS`.

## b) Ekspor CSV/XLSX — formula injection

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| seluruh `src/server/api` | Tidak ada penulis CSV/XLSX sama sekali (hanya *baca* XLSX di migration). `borang-export.ts` menghasilkan DOCX (bukan sel spreadsheet) | Rendah | **Diperbaiki (pencegahan)** |

**Perbaikan:** ditambahkan modul `src/lib/spreadsheet.ts` dengan
`neutralizeSpreadsheetCell()` / `neutralizeSpreadsheetRow()` (prefix `'` untuk
nilai yang diawali `=`, `+`, `-`, `@`, TAB, CR; angka & tanggal murni dibiarkan).
Belum ada pemanggil produksi karena tidak ada ekspor CSV/XLSX; ini disiapkan agar
setiap ekspor spreadsheet berikutnya aman. **Hasil ekspor yang sah tidak berubah**
(tidak ada ekspor CSV yang terdampak).

## c) Diklat

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| `diklat-trainings-$id$-certificates-generate.ts` | `staffIds` tanpa batas jumlah → potensi CPU/memori & ZIP besar | Sedang | **Diperbaiki** |
| `diklat-trainings-$id$-certificates-generate.ts` | `catch` mengembalikan `e.message` mentah | Rendah | **Diperbaiki** |
| `diklat-certificate-template.ts` | Template dibaca tanpa validasi isi/ukuran; `readTemplate()` bisa throw tanpa ditangani | Rendah | **Diperbaiki** |
| `diklat-trainings-$id$-certificates.ts` | Deteksi duplikat via pencocokan string `e.message` | Rendah | **Diperbaiki** |
| `diklat-*` (semua method) | Izin: setiap handler memakai `checkPermission(...)`/`guard(...)` | — | Sudah benar |
| `diklat-trainings-$id$-participants-$participantId$.ts` | IDOR: dicek `existing.trainingId !== id` | — | Sudah benar |
| `diklat-trainings-$id$-assessments/-attendance.ts` | IDOR: peserta diverifikasi milik pelatihan via `trainingId_staffId` | — | Sudah benar |
| `diklat-trainings-$id$-certificates-generate.ts` | IDOR: peserta diverifikasi milik pelatihan | — | Sudah benar |
| `src/lib/diklat/certificate.ts` | Placeholder PPTX di-escape (`escapeXml`); preview HTML di-escape; `safeFileName` membatasi nama keluaran | — | Sudah benar |

**Perbaikan:**
- `staffIds` dibatasi **maksimal 200** peserta per batch.
- Error generik (`safeErrorMessage`) + log server.
- `readTemplate()` memverifikasi magic bytes ZIP (`PK`) dan batas 20 MB.
- Deteksi duplikat memakai kode Prisma **P2002** (bukan cocok string).

**Dilaporkan (bukan diubah):** tidak ada endpoint *unggah* template PPTX — template
adalah berkas tetap `public/templates/sertifikat-iht.pptx` yang di-deploy. Karena
itu "validasi unggahan template" tidak punya permukaan unggah; validasi dilakukan
saat pembacaan.

## d) Migration Center

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| `admin-migration-scan.ts` | `sheetUrl` diterima dari host apa pun selama mengandung `/spreadsheets/d/<id>` | Sedang | **Diperbaiki** |
| `admin-migration-scan.ts` | `catch` mengembalikan `e.message` mentah | Rendah | **Diperbaiki** |
| `admin-migration-upload.ts` | `catch` mengembalikan `e.message` mentah | Rendah | **Diperbaiki** |
| `src/lib/migration/source.ts` | `scanXlsxFile` memparse seluruh sheet/baris tanpa batas | Sedang | **Diperbaiki** |
| `admin-migration-*` (semua rute) | Izin: semua memakai `requireMigrationUser` (callback memakai cek `ADMIN_MIGRATION`/SUPER_ADMIN) | — | Sudah benar |
| `admin-migration-upload.ts` | Batas ukuran 30 MB + magic bytes ZIP | — | Sudah benar (stage 1) |

**Perbaikan:**
- `extractSheetIdFromUrl()` hanya menerima URL pada host Google allow-list
  (`docs.google.com`, `drive.google.com`, `sheets.google.com`,
  `spreadsheets.google.com`) atau ID polos. Note: ID kemudian hanya dipakai pada
  URL Google API yang **di-hardcode**, jadi tidak pernah ada SSRF nyata — ini
  pengerasan tambahan agar URL host asing tidak pernah dianggap sumber valid.
- `scanXlsxFile`/`readSheetObjects` dibatasi: maks **50 sheet**, **20.000 baris/sheet**,
  **200 kolom**; peringatan dilaporkan di hasil scan.
- Pesan error generik; detail asli dicatat ke log server (tanpa token/URL berisi kredensial).

## e) Admin: users / rooms / competencies / audit

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| `admin-users-$id$.ts` | User bisa **mengubah perannya sendiri** (potensi self-escalation ke SUPER_ADMIN) | Tinggi | **Diperbaiki** |
| `admin-users-$id$.ts` | SUPER_ADMIN terakhir bisa di-demote/nonaktif/dihapus (sistem tak teradministrasi) | Tinggi | **Diperbaiki** |
| `admin-users.ts` / `admin-users-$id$.ts` | Respons menyertakan `passwordHash` (stage 1 sudah diperbaiki) | Tinggi | Sudah benar (stage 1) |
| `admin-rooms*.ts`, `admin-competencies.ts`, `admin-audit.ts` | Izin per method sebelum data diambil | — | Sudah benar (tidak diubah) |

**Perbaikan:** modul `src/lib/user-admin-guards.ts` dengan
`roleChangeViolation()`, `deactivationViolation()`, `deletionViolation()`
(diuji tanpa DB). Ke `admin-users-$id$.ts`:
- PATCH: role change tidak boleh untuk akun sendiri (`SELF_ROLE_CHANGE`) dan tidak
  boleh menghapus SUPER_ADMIN terakhir (`LAST_SUPER_ADMIN`).
- PATCH: nonaktifkan tidak boleh self maupun SUPER_ADMIN terakhir.
- DELETE: tidak boleh self maupun SUPER_ADMIN terakhir.

## f) Pesan error generik + logger

| File | Temuan | Risiko | Status |
| --- | --- | --- | --- |
| ±35 handler `catch` mengembalikan `e.message` mentah | Membocorkan detail internal/kredensial/URL | Sedang | **Diperbaiki** |

**Perbaikan:** modul `src/lib/logger.ts`:
- `logServerError(scope, error)` mencatat detail asli ke **log server** dengan
  penyaringan (menyamarkan `access_token`/`code`/`client_secret`, `Bearer ...`,
  `postgres://...`).
- `safeErrorMessage(code)` mengembalikan pesan generik berbahasa Indonesia per
  kode error. **Kode error dan status HTTP tidak berubah.**

File yang diperbaiki (30 otomatis + 3 manual): `admin-competencies`,
`admin-migration-*` (22), `admin-rooms*` (3), `admin-users*` (2),
`borang-actions*`, `borang-entries*`, `diklat-trainings*`,
`documents-$id$-download`, `documents-$id$-thumbnail`, `komite-staff*`,
`admin-slides*`, `diklat-certificate-template`.

## g) Field sensitif pada respons

| Temuan | Risiko | Status |
| --- | --- | --- |
| `grep -rn "passwordHash" src` | Tinggi | **Bersih** — hanya untuk hash/tulis/compare; `USER_API_SELECT`/`CURRENT_USER_SELECT` tidak memuatnya |
| `grep -rn "tokenEncrypted" src` | Tinggi | **Bersih** — hanya `lib/google/auth.ts` (enkripsi/dekripsi server); API memakai `getConnectionPublic()` yang menyaring field internal |

## h) Tes

`tests/spreadsheet.test.ts` (b), `tests/user-admin-guards.test.ts` (e),
`tests/logger.test.ts` (f), `tests/slides.test.ts` (a), `tests/migration-source.test.ts` (d)
— semuanya tanpa database nyata. Lihat juga `tests/file-type.test.ts`,
`tests/login-rate-limit.test.ts`, `tests/borang-access.test.ts` (tahap 1).

---

## Dilaporkan saja (tidak diubah — keputusan kebijakan)

1. **Pembatasan baca dokumen per unit/ruangan** — sengaja TIDAK dikerjakan
   (keputusan kebijakan, bukan bug). Saat ini `KOMITE_DOCUMENT_READ` memberi akses
   ke semua dokumen staf.
2. **Tidak ada endpoint unggah template sertifikat** — template adalah berkas
   tetap; validasi dilakukan saat baca (lihat bagian c).
3. **`getThumbnail` Google Drive** mengambil `thumbnailLink` di sisi server, bukan
   oleh browser — tidak ada origin cross-domain pada CSP.
4. **`admin-migration-google-callback`** memakai cek izin inline (bukan
   `requireMigrationUser`) karena dipanggil oleh redirect OAuth; ekuivalen secara
   izin (ADMIN_MIGRATION atau SUPER_ADMIN).
