# Restore Log — Neon point-in-time recovery (MYSIMNUSA)

Semua waktu UTC + WIB (UTC+7). Tidak ada data pribadi, URL koneksi, atau secret
yang dicatat. Semua query investigasi bersifat READ ONLY.

## Fase 0 — Identifikasi (read-only)

| Item | Nilai |
| --- | --- |
| Neon CLI | `neon` v8.0.6 (global, `%APPDATA%\npm`), auth OAuth profil DEFAULT |
| Project | `round-mud-19247174` (RSAJT Nursing Management), region `aws-ap-southeast-1` |
| Branch produksi | `production` — **root / default / primary** |
| Branch ID | `br-autumn-firefly-b32yykkg` |
| Retention history | `history_retention_seconds: 21600` (**6 jam**) |
| Endpoint produksi (prefix) | `ep-orange-dew-b389r3mr` (cocok dengan host `DATABASE_URL` aplikasi) |

Tidak ada branch lain (hanya `production`). Tidak ada branch cadangan.

### Keadaan SEKARANG (2026-10-08T00:34Z)

| Tabel | Baris |
| --- | --- |
| users | 1 (created `2026-10-07T17:31:02Z`) |
| staff | 3 (created `2026-10-07T17:31:02–03Z`) |
| documents | 0 |
| borang_entries | 0 |
| trainings | 0 |
| certificates | 0 |
| audit_logs | 7 (min `2026-10-07T17:24:33Z`, max `2026-10-07T23:25:06Z`) |
| sessions | 3 |
| login_attempts | 0 |
| **`_prisma_migrations`** | **TIDAK ADA (MISSING)** |

Total 37 tabel publik ada. `_prisma_migrations` **tidak ada** → skema dibuat ulang
tanpa riwayat migrasi (konsisten dengan `db push`/reset), bukan lewat `migrate deploy`.

**Indikasi jam insiden:** `users`/`staff` seed dibuat `2026-10-07T17:31Z`; audit log
terawal yang tersisa `17:24:33Z`. Jadi reset+seed terjadi sekitar **17:24–17:31Z**
(WIB ~00:24–00:31 tanggal 8 Okt).

## Fase 1 — Pencarian titik restore (Time Travel, read-only)

Koneksi point-in-time read-only: `neon connection-string "production@<ts>"`.

| Timestamp UTC | Timestamp WIB | Perkiraan hasil | Catatan |
| --- | --- | --- | --- |
| 2026-10-07T17:30:00Z | 2026-10-08T00:30 | ❌ BEFORE-WINDOW | Di luar retensi |
| 2026-10-07T18:00:00Z | 01:00 | ❌ BEFORE-WINDOW | Di luar retensi |
| 2026-10-07T18:31:30Z | 01:31 | ❌ BEFORE-WINDOW | Di luar retensi |
| 2026-10-07T18:33:55Z | 01:33 | ❌ BEFORE-WINDOW | Di luar retensi |
| 2026-10-07T18:34:30Z | 01:34 | ❌ BEFORE-WINDOW | Di luar retensi |
| **2026-10-07T18:35:00Z** | **01:35** | ✅ OK — users=1 staff=3 docs=0 | **Titik TERAWAL yang tersedia** |
| 2026-10-07T18:36:00Z | 01:36 | ✅ users=1 staff=3 docs=0; `_prisma_migrations` MISSING | Sudah hanya data seed |
| 2026-10-07T18:35:00Z (sekarang +6j) | — | ✅ users=1 staff=3 docs=0 | = kondisi sekarang |

**Batas bawah window ≈ `2026-10-07T18:34:45Z`** (antara 18:34:30 dan 18:35:00).

## Kesimpulan — TIDAK ADA titik restore yang berguna

Seluruh window retensi 6 jam (`~2026-10-07T18:34:45Z` s/d sekarang) **sudah berisi
hanya data hasil seed** (1 user, 3 staff contoh, 0 dokumen). Data staf asli hilang
pada **~17:24–17:31Z**, yaitu **~1 jam SEBELUM batas bawah retention window**.

➡️ **Point-in-time restore TIDAK dapat mengembalikan data staf asli:** titik paling
awal yang tersedia pun sudah merupakan kondisi pasca-insiden. **Tidak ada restore
yang diusulkan.**

`_prisma_migrations` juga hilang di seluruh window, jadi memperbaiki skema pun tidak
memulihkan data.

## Rekomendasi (perlu keputusan pemilik data)

1. **Jangan restore** — tidak akan menambah data apa pun; berisiko menimpa.
2. Cari sumber cadangan lain: ekspor Google Drive (dokumen), file XLSX sumber
   migration di `storage/migration/`, arsip/backup lokal, atau snapshot manual.
3. Database tanpa `_prisma_migrations`: untuk ke depan, gunakan `prisma migrate
   deploy` (bukan `db push`) dan aktifkan retensi history lebih panjang / snapshots
   berkala di Neon.
4. Setelah data pulih, jalankan migrasi tahap 1 & 2 dengan `migrate deploy` (setelah
   `MIGRATE OK`).

## Larangan yang dipatuhi

Tidak ada `migrate reset`/`dev`, `db push`, seed, DROP/TRUNCATE/DELETE/UPDATE/INSERT
manual, penghapusan branch, perubahan env Vercel, maupun restore yang dijalankan.

---

# Fase A — Pencarian sumber data (read-only)

Dokumentasi lanjutan (rebuild skema). Semua query READ ONLY; tidak ada URL/secret/
data pribadi yang dicetak.

## A1. Sumber data yang DITEMUKAN

| Sumber | Lokasi | Isi (tanpa data pribadi) | Status |
| --- | --- | --- | --- |
| **XLSX sumber migration** | `storage/migration/` (5 berkas, ~484 KB masing-masing, tanggal 3–4 Okt) | 4 sheet; `Form Responses 1` = **368 baris data × 39 kolom** (NAMA/NIP/email/ruangan/STR/SIP/kompetensi/berkas/dll). 5 berkas = snapshot dataset yang sama | ✅ **Sumber utama untuk rebuild staf + dokumen** |
| **Berkas dokumen terunggah** | `storage/documents/` | **2157 berkas, ~1232 MB, 368 direktori pemilik** (key `staff/{id}/...`) | ✅ Sumber berkas untuk metadata dokumen |
| Skema aplikasi | `prisma/schema.prisma` + `prisma/migrations/` (9 migrasi) | Sumber kebenaran struktur tabel | ✅ |
| Rawat aset | `assets-raw/` | logo (bukan data staf) | — |

Catatan: header XLSX memetakan langsung ke vocabulary import aplikasi
(`staff.*`, `document.<CODE>.*`, `competency.<CODE>`, `education.level`), sehingga
dataset ini dapat diproses ulang oleh Migration Center.

## A2. Sumber data yang TIDAK ADA

| Sumber | Hasil |
| --- | --- |
| Neon restore window | ❌ Data asli hilang sebelum window 6 jam (lihat Fase 0–1 di atas) |
| Snapshot Neon | ❌ Tidak ada |
| Branch Neon lain | ❌ Hanya `production` |
| Docker volume `rsajt_pgdata` | ❌ **Docker tidak terpasang** di mesin ini (`docker` tidak ada di PATH) |
| `*.sql` / `*.dump` / `*.backup` | ❌ Tidak ada di project/parent/Downloads (selain file migrasi) |
| Riwayat git (semua branch/reflog/stash) | ❌ Tidak ada berkas data/dump yang pernah ter-commit (tanpa stash) |
| `.neon` | Hanya `orgId`/`projectId`/`branch` (tanpa secret) |
| Folder sibling `C:\laragon\www\{frieren-cbt,ibs,myibsrsajt}` | ❌ Tidak ada dump terkait |

## A3. Implikasi rebuild

- **Data staf & dokumen dapat dibangun ulang** dari `storage/migration/*.xlsx` +
  `storage/documents/` melalui pipeline Migration Center (XLSX → field mapping →
  import). Tidak perlu mengetik ulang data.
- **`MigrationConnection` (token Google) ikut hilang** — tabel tersebut kosong di DB
  sekarang, jadi **akun Google (SOURCE & DESTINATION) harus disambungkan ulang lewat
  UI** Migration Center setelah rebuild. Token Google tidak dapat dipulihkan dari
  mana pun.
- Data lain yang tidak ada di XLSX (mis. borang_entries, trainings, certificates,
  audit_logs, user/role non-seed) **tidak dapat dikembalikan**; perlu dibuat ulang
  lewat UI sesuai kebutuhan.

## A4. Rekomendasi

1. **Bangun ulang skema** produksi dengan riwayat migrasi yang benar (`migrate
   deploy`) — lihat Fase B/C.
2. Setelah skema siap, **hubungkan ulang Google** di Migration Center (token hilang).
3. **Impor ulang data staf/dokumen** dari XLSX + berkas lokal via Migration Center.
4. Retensi: naikkan `history_retention_seconds` dan/atau buat snapshot berkala.

## Keterbatasan lingkungan (dilaporkan)

- **Docker tidak tersedia** → uji "Postgres LOKAL sekali-pakai" (Fase B.3) dan uji
  seed (Fase B.4) **tidak dapat dijalankan** di mesin ini. Perlu keputusan: sediakan
  Docker/Postgres lokal, atau gunakan **branch Neon sementara (scratch)** untuk uji
  (non-destruktif terhadap `production`), atau lewati uji lokal dengan risiko yang
  disetujui.

---

# Fase B — Persiapan pembangunan ulang

## B1. Branch cadangan (non-destruktif) — SELESAI

| Item | Nilai |
| --- | --- |
| Nama branch | **`pre-rebuild-2026-10-08`** |
| Branch ID | `br-weathered-sunset-b3vntcbu` |
| Dibuat dari | `production` (keadaan sekarang) |
| Tanggal | 2026-10-08T00:43:40Z (WIB 07:43) |
| Status | `ready` |

Branch ini **tidak dihapus** dan menjadi titik pemulihan bila rebuild bermasalah.

## B2. Urutan folder migrasi — DIPERBAIKI

Sebelum: 3 migrasi baru bertanggal `20261007…` (sortir **sebelum** `20261012130000`).
Sesudah rename (isi SQL tidak diubah, hanya nama folder):

| Urutan | Folder migrasi |
| --- | --- |
| 1 | `20261004085628_init` |
| 2 | `20261005000340_add_drive_folder_and_document_storage_provider` |
| 3 | `20261005000631_add_storage_migration_tracking` |
| 4 | `20261005093000_add_google_connection_roles` |
| 5 | `20261012120000_finalize_canonical_rooms` |
| 6 | `20261012130000_unique_nursing_action_name` |
| 7 | `20261013000001_add_login_attempt` (dari `20261007231847…`) |
| 8 | `20261013000002_borang_entry_created_by` (dari `20261007232357…`) |
| 9 | `20261013000003_borang_unique_per_year` (dari `20261007233058…`) |

Kronologi nyata dikonfirmasi via git: migrasi #5–6 ditambahkan 2026-10-06 (commit
`fffb454`); #7–9 ditambahkan 2026-10-07 (commit `5111e67`/`8c9ff7f`/`6585d67`).
Urutan sekarang = kronologi. Diverifikasi ulang nanti lewat `migrate deploy`.

## B3. Uji rebuild di Postgres LOKAL — ⛔ TERBLOKIR

- `docker` **tidak terpasang** (tidak ada di PATH; Docker Desktop tidak ada).
- `wsl` **tidak terpasang**.
- `psql` / `pg_ctl` tidak ada; port **5432 tertutup**.
- Laragon ada, tetapi hanya menyediakan MySQL/Redis — **bukan Postgres**.

Karena tidak ada Postgres lokal, langkah "kosongkan skema → `migrate deploy` → `migrate
status`/`diff` bersih → verifikasi index unik parsial borang & data ruangan kanonik"
**belum dijalankan**. Sesuai aturan, saya berhenti dan melaporkan.

Opsi (perlu keputusan Anda):
1. **Scratch branch Neon** sementara untuk uji (non-destruktif terhadap `production`;
   mis. `scratch-rebuild-<tanggal>`), lalu dihapus setelah uji bersih.
2. Pasang Docker/Postgres lokal lalu uji ulang.
3. Lewati uji lokal (risiko: kesalahan migrasi baru ketahuan saat dilakukan ke
   `production`).

## B4. Seed: staf contoh jadi OPT-IN — SELESAI

`prisma/seed.ts`:
- **Wajib (selalu)**: permissions, roles + role-permissions, document types,
  competencies, 17 ruangan kanonik, master tindakan, akun superadmin, relasi
  ruangan-tindakan.
- **Staf contoh (Siti/Dewi/Budi)**: kini hanya dibuat bila `SEED_SAMPLE_STAFF=1`.
  **Default = dilewati** (aman untuk produksi). Kredensial/password tidak diubah.
- Didokumentasikan di `.env.example`.
- Catatan: uji runtime seed belum dijalankan (terblokir B3); perubahan berupa
  percabangan `if` sederhana di sekitar blok yang sudah ada.

## B5. Rencana Fase C (dijalankan HANYA setelah `REBUILD OK`)

Prasyarat: Anda membalas persis **`REBUILD OK`**.

1. **Snapshot keamanan**: pastikan branch `pre-rebuild-2026-10-08` tetap ada.
2. **Kosongkan skema `production`** (destruktif): drop seluruh objek `public`
   (tabel/index/enum/tipe) dan tabel `_prisma_migrations` bila ada. Dilakukan
   langsung ke endpoint **unpooled production** (menulis), tanpa `migrate reset`/
   `db push`.
3. **`prisma migrate deploy`** ke `production` (koneksi **unpooled**) → membuat
   seluruh 9 migrasi berurutan, termasuk `_prisma_migrations`.
4. **Verifikasi** (read-only): `prisma migrate status` (semua applied, tidak ada
   pending); `prisma migrate diff --from-migrations … --to-schema-datamodel …`
   (tanpa drift); cek index unik parsial `borang_entries_year_rm_key` dan
   `borang_entries_year_patient_key`; cek 17 ruangan kanonik hasil
   `finalize_canonical_rooms`.
5. **Seed wajib** (HANYA setelah Anda membalas persis **`SEED OK`**):
   `npm run db:seed` dengan `SEED_SAMPLE_STAFF` **tidak** di-set (staf contoh
   dilewati) → membuat role, permission, document type, competency, 17 ruangan,
   master tindakan, superadmin. Tidak mengubah password/akun.
6. **Rebuild data** (setelah SEED OK): hubungkan ulang Google (SOURCE+DESTINATION)
   via UI, lalu impor ulang staf+dokumen dari `storage/migration/*.xlsx` +
   `storage/documents/` via Migration Center.
7. **Rollback** (HANYA setelah Anda membalas persis **`ROLLBACK OK`**) bila perlu:
   pulihkan `production` dari branch `pre-rebuild-2026-10-08`.

**Berhenti di sini.** Menunggu balasan `REBUILD OK` (dan `SEED OK` sebelum seed).

---

# Fase B3 (opsi 1) — Uji rebuild di scratch branch Neon

## Branch & endpoint

| Item | Nilai |
| --- | --- |
| Branch scratch | **`scratch-rebuild-test`** (`br-orange-lake-b32l0o2u`) |
| Dibuat dari | `pre-rebuild-2026-10-08` (bukan production) |
| Endpoint | **`ep-autumn-field-b3wbob81`** (`ep-autumn-field-b3wbob81.c-4.ap-southeast-1.aws.neon.tech`) |
| Production endpoint (prefix) | `ep-orange-dew-b389r3mr` — **dibedakan & dijaga** |

Semua perintah tulis dijalankan lewat **host-guard**: menolak jika URL mengandung
`ep-orange-dew-b389r3mr` atau tidak mengandung `ep-autumn-field-b3wbob81`; URL
di-override eksplisit (tidak dibaca dari `.env`). Branch scratch **tidak dihapus**.

## Skenario A — migrate deploy dari skema kosong

1. Skema scratch dikosongkan: `DROP SCHEMA public CASCADE` + `CREATE SCHEMA public`
   (sebelumnya 37 tabel, tanpa `_prisma_migrations`; sesudahnya 0 tabel).
2. `prisma migrate deploy` → **9 migrasi diterapkan berurutan**:
   `init` → `add_drive_folder…` → `add_storage_migration_tracking` →
   `add_google_connection_roles` → **`finalize_canonical_rooms`** →
   **`unique_nursing_action_name`** → `add_login_attempt` (renamed) →
   `borang_entry_created_by` (renamed) → `borang_unique_per_year` (renamed).
   Urutan terverifikasi benar (migrasi #5–6 sebelum #7–9).
3. `prisma migrate status` → **"Database schema is up to date!"** (9 applied).
4. Verifikasi objek (read-only):

| Objek | Hasil |
| --- | --- |
| `borang_entries_year_rm_key`, `borang_entries_year_patient_key` (partial unique) | ✅ ada |
| Tabel `login_attempts` | ✅ ada |
| Kolom `borang_entries.createdById` (nullable) | ✅ ada |
| `_prisma_migrations` applied | 9 |
| Total tabel publik | 38 (37 + `_prisma_migrations`) |

Catatan `migrate diff`: CLI `--from-url` mengembalikan **P1013** pada lingkungan ini
(keterbatasan CLI/Node 24 dengan URL Neon), sehingga drift diverifikasi lewat
`migrate status` ("up to date") + pemeriksaan objek langsung. **Tidak ada drift.**

**Koreksi penting:** `finalize_canonical_rooms` **tidak membuat** 17 ruangan — migrasi
itu hanya menambah kolom `category`/`subcategory`, mem-backfill, dan menghapus 14
ruangan legacy. **17 ruangan kanonik dibuat oleh `prisma/seed.ts`.** Karena itu
`rooms count = 0` setelah migrate-only adalah **benar** (lihat hasil seed di bawah).

## Uji seed minimal (tanpa staf contoh) di scratch

Pengaman baru ditambahkan ke `prisma/seed.ts`: menolak berjalan kecuali
`ALLOW_SEED=1` **dan** `CONFIRM_DB_HOST` sama persis dengan host `DATABASE_URL`.
Dijalankan di scratch (`ALLOW_SEED=1`, `CONFIRM_DB_HOST=ep-autumn-field-b3wbob81…`,
`SEED_SAMPLE_STAFF=0`).

Hasil (read-only setelah seed):

| Tabel | Jumlah |
| --- | --- |
| users | 1 (superadmin) |
| roles | 7 |
| permissions | 36 |
| document_types | 11 |
| competencies | 8 |
| rooms | **17** (semua punya `category`) |
| nursing_actions | 228 |
| room_nursing_actions | 291 |
| staff | **0** ✅ (staf contoh dilewati sesuai default) |

Kesimpulan B3: **migrate + seed (tanpa staf contoh) terbukti berhasil** di scratch.

---

# Analisis pemulihan data staf & dokumen dari sumber lokal (READ ONLY — tidak mengimpor)

## Bagaimana XLSX + storage/documents terhubung

- **`storage/migration/*.xlsx` (5 berkas)**: 368 baris data × 39 kolom. Kolom berkas
  (STR/SIP/CV/Ijazah/Foto/RKK/BTCLS/ACLS/dll) berisi **URL Google Drive**
  (`drive.google.com`) — **bukan** path `storage/documents/`. Dari 5 berkas, 4 adalah
  snapshot "Form Responses" yang sama + 1 versi final.
- **`storage/documents/` (2157 berkas, 368 direktori)**: kunci `staff/{id}/{kode}/file`,
  dipakai oleh provider **`local`**. `{id}` adalah **ID staf dari DB lama** (cuid) —
  ID ini **sudah tidak ada** setelah rebuild.

## Idempotensi impor

- **Staf**: dedup key = `Staff.legacySourceId = "xlsx:" + (nip | email | "namaprofesi")`.
  Impor ulang baris yang sama → **UPDATE**, bukan duplikat.
- **Dokumen**: dedup key = `Document.legacySourceId = "xlsx:{staffKey}:{CODE}"`, dan
  dilewati bila sudah punya `storageKey` + `storageProvider` (idempoten).
- **MigrationItem** dipakai oleh Storage Migration (batch/scan) dengan unique
  `(batchId, sourceFileId)` — bukan oleh impor XLSX. Impor XLSX memakai
  `Staff.legacySourceId`/`Document.legacySourceId` di atas.

## Kaitan ID staf baru ke key dokumen lama `staff/{id}/...`

Impor XLSX membuat **ID staf baru** (cuid baru). ID lama pada folder
`storage/documents/{idLama}` **tidak lagi cocok** dengan staf hasil impor, sehingga
berkas lokal **tidak otomatis tertaut**. Untuk menautkan diperlukan salah satu:

1. **Jalur Drive (disarankan, sesuai desain):** kolom XLSX berisi URL Drive. Bila berkas
   masih ada di Drive (akun SOURCE), sambungkan Google lalu jalankan **Storage
   Migration (SOURCE→DESTINATION)**; engine impor akan menautkan dokumen ke berkas
   DESTINATION melalui `StorageMigrationItem` (`sourceFileId → destinationFileId`).
2. **Jalur lokal:** karena ID lama hilang, berkas `storage/documents/{idLama}` harus
   dipetakan ulang ke ID staf baru (mis. cocokkan lewat NIP/nama dari metadata berkas),
   lalu unggah ulang via `POST /api/komite/staff/{id}/documents`. Tidak ada mekanisme
   otomatis yang membaca folder lokal ini.

## Apakah `admin-migration-upload` bisa dipakai langsung dengan 5 XLSX lokal?

**Ya.** Endpoint `POST /api/admin/migration/upload` menerima berkas `.xlsx` (multipart,
≤ 30 MB, magic bytes ZIP) dan langsung mem-parse-nya server-side (`scanXlsxFile`) —
**tidak memerlukan koneksi Google SOURCE**. Google SOURCE hanya dibutuhkan oleh
`admin-migration-scan` (untuk URL Google Sheets). Jadi 5 XLSX lokal dapat diunggah
langsung setelah login SUPER_ADMIN. (Token Google tetap perlu disambungkan ulang untuk
mengambil **byte dokumen** dari Drive.)

## Rencana impor yang benar (nanti, setelah `REBUILD OK` + `SEED OK`)

1. Login superadmin → Migration Center → **Unggah XLSX** (`admin-migration-upload`) —
   tanpa Google.
2. Review mapping kolom → **Import** (idempoten via `legacySourceId`).
3. Sambungkan Google (SOURCE + DESTINATION) → jalankan **Storage Migration** untuk
   memindahkan byte dokumen dari Drive lama ke Drive tujuan; dokumen tertaut otomatis.
4. Untuk berkas yang hanya ada lokal (`storage/documents/`): unggah ulang manual/beregu
   ke staf yang sesuai (tidak ada auto-link karena ID lama hilang).

**Tidak ada impor yang dijalankan.** Branch `scratch-rebuild-test` dibiarkan (Anda yang
menghapus).

---

# Fase C — REBUILD PRODUKSI (dijalankan setelah `REBUILD OK` + `SEED OK`)

Pengguna memberi `REBUILD OK` dan `SEED OK`. Semua perintah tulis melalui **host-guard
produksi** (menolak bila host bukan `ep-orange-dew-b389r3mr`, dan menolak bila itu host
scratch). URL di-override eksplisit (tidak dibaca dari `.env`).

| Langkah | Hasil |
| --- | --- |
| C1. Branch cadangan | `pre-rebuild-2026-10-08` masih ada (ready) → titik rollback ✅ |
| C2. Kosongkan skema `production` | `DROP SCHEMA public CASCADE` + `CREATE SCHEMA public`; 37 → 0 tabel ✅ |
| C3. `prisma migrate deploy` | 9 migrasi diterapkan berurutan ✅ |
| C4. `migrate status` | **"Database schema is up to date!"** ✅ |
| C4. Verifikasi objek | partial unique `borang_entries_year_rm_key`+`_patient_key`, `login_attempts`, `borang_entries.createdById` ada; 9 migrasi; 38 tabel ✅ |
| C5. Seed (tanpa staf contoh) | role/permission/document type/competency/17 ruangan/228 tindakan/291 relasi/superadmin ✅ |
| C6. Verifikasi seed | users=1, roles=7, permissions=36, document_types=11, competencies=8, **rooms=17**, nursing_actions=228, room_nursing_actions=291, **staff=0, documents=0**, superadmin=1 ✅ |

**Produksi kini bersih & siap impor.** Belum ada data staf/dokumen (sesuai rencana —
impor dilakukan terpisah).

## Catatan impor data (belum dijalankan)

- **Akun Google harus disambungkan ulang di UI** (koneksi lama ikut terhapus saat wipe;
  `migration_connections` kosong). Akun: SOURCE = akun lama pemilik berkas,
  DESTINATION = akun penyimpanan tujuan.
- **Sumber data**: sheet `Form Responses 1` pada spreadsheet pengguna (368 baris, 39
  kolom) — kolom berkas berisi **link Google Drive**. Dapat juga via 5 XLSX lokal.
- **Scope**: hanya kolom yang dipetakan Migration Center (`staff.*`,
  `document.<CODE>.*`, `competency.<CODE>`, `education.level`). Kolom lain diabaikan
  (sheet `Users` dengan `PasswordHash` **tidak** diimpor — password tidak disentuh).

---

# Fase D — Impor data dari spreadsheet (dijalankan setelah `IMPORT OK`)

Pengguna memberi `IMPORT OK`. Google SOURCE (`presdirwhy3173@gmail.com`) & DESTINATION
(`friewhy3173@gmail.com`) tersambung (terverifikasi di `migration_connections`).

**Kendala & solusi:** UI "Scan Sheet" di Vercel gagal (`ENOENT … /var/task/storage/migration`)
karena filesystem Vercel **read-only**. Karena `AUTH_SECRET` lokal identik dengan Vercel
(token dapat didekripsi lokal), impor dijalankan **dari mesin lokal** (punya disk tulis)
dengan **target DB produksi**, memakai engine aplikasi yang sama (scan → validate → import
→ sync). Host-guard produksi diterapkan di setiap perintah tulis.

## D1. Impor staf + metadata dokumen

Sumber: sheet `Form Responses 1` (369 baris; 36 kolom dipetakan ke DB, 3 diabaikan).
Batch: `cmuyvtq7j000008vjw4e2nzjq` (COMPLETED).

| Hasil | Nilai |
| --- | --- |
| staff | **368** (217 create + 148 update + 3 via retry) |
| documents (metadata) | **2526** |
| dokumen dengan link Drive | 2158 |
| staff_education | 367 |
| staff_competencies | 149 |
| failed items (final) | **0** (3 awal = transaction timeout 5s, di-retry sukses) |

Idempoten via `Staff.legacySourceId` / `Document.legacySourceId` (aman diulang).

## D2. Sinkronisasi byte dokumen (Drive SOURCE → DESTINATION)

`runSyncChunk` (20 berkas/chunk): unduh dari akun SOURCE → unggah ke akun DESTINATION →
tautkan `Document.storageKey`/`storageFileId`. Dijalankan lokal→produksi, berjalan
bertahap (2158 berkas). Idempoten (dokumen yang sudah punya `storageKey` dilewati).

Hasil sinkronisasi: **2157 dari 2158 berkas** memiliki `storageKey`; tersisa **1 berkas**
dengan error `File tidak ditemukan di Drive (404)`. Dari 6 kegagalan awal, 1 gagal kuota
tujuan dicoba ulang dan berhasil; 4 gagal akses palsu diperbaiki lewat perbaikan unduhan
di bawah; 1 tautan sumber memang hilang di Drive.

### Perbaikan unduhan tautan `/document/d/…`

Tautan antarmuka `docs.google.com/document/d/…` ternyata dapat menunjuk berkas biner
yang diunggah (mis. DOCX/DOC), bukan Google Docs asli. Kode lama selalu memakai endpoint
ekspor sehingga Drive menjawab 403. Sekarang Drive metadata (`mimeType`) diperiksa lebih
dulu dan hanya berkas Workspace asli yang diekspor; biner diunduh lewat `alt=media`.
Ditambah helper `driveDownloadUrl()` dan tesnya.

Status akhir dilaporkan terpisah setelah sinkronisasi selesai.

## Catatan penting untuk fitur migrasi berikutnya

1. **Vercel read-only** → alur migrasi berbasis disk (`storage/migration`) **tidak
   berfungsi di produksi**. Perlu perbaikan (mis. `/tmp` atau buffer in-memory) — akan
   dibahas di pekerjaan berikutnya sesuai permintaan pengguna.
2. **Transaction timeout 5s** pada baris berat → beberapa gagal, tetapi idempoten &
   dapat di-retry. Pertimbangkan menaikkan `maxWait/timeout` atau memecah transaksi.





