# RKK — Prosedur Impor Terkontrol (Staging) & Pemulihan

Dokumen ini menjelaskan cara menjalankan impor RKK secara aman **setelah persetujuan
pemilik**. Impor massal ke produksi TIDAK termasuk di sini (butuh keputusan &
migrasi/penyimpanan terpisah).

## 0. Prasyarat

- Berkas sumber RKK: `C:\Users\HandlerOne\Downloads\RKK PK I + PK II` (sudah terpisah per staf).
- Paket terverifikasi: `RKK_package.zip` + `validation-report.json` (+ `RKK_review_report.md`).
- Branch `feat/full-revision-v1`, HEAD `edde303`, working tree bersih.
- **Importir bersifat self-contained**: memuat `.env.local` (staging) sendiri dan
  **memaksa `STORAGE_PROVIDER=local`** untuk proses itu. Tidak perlu menyetel env manual.

## 1. Isolasi (sudah dipastikan di kode)

| Aspek | Nilai | Bukti |
|---|---|---|
| DB target | staging `ep-flat-shadow…` | guard: menolak host selain `ep-flat-shadow` |
| Storage target | `local` (disk) | guard: `--apply` wajib provider local; `.env` produksi (Drive) tidak dipakai |
| Storage root | `<repo>/storage/staff/{staffId}/rkk/*` | `src/lib/storage/index.ts` (`path.join(process.cwd(),"storage",…)`) |
| Akses publik file | **Tidak** (auth-gated) | `/api/documents/:id/download` butuh `komite.document.read`; `nosniff`+CSP sandbox |
| Git | `storage/` di-`.gitignore` (tidak ter-commit) | `.gitignore` `/storage/` |
| Konfigurasi prod | **Tidak diubah** | tidak ada penulisan `.env`/`vercel.json` |

> `STORAGE_PROVIDER=local` hanya di-set **di dalam proses importer** (in-memory),
> tidak menulis file dan tidak memengaruhi deployment produksi.

## 2. Langkah impor terkontrol

```powershell
# 1. Dry-run (WAJIB lebih dulu) — tidak menulis apa pun
npx tsx scripts/rkk-import.mts "C:\Users\HandlerOne\AppData\Local\Temp\opencode\rkk-out\validation-report.json"
#    Harus menampilkan: mode DRY-RUN, storageProvider=local,
#    dbHostPrefix=ep-flat-shadow…, imported=361, unmatched=8, review=3, missing=0

# 2. (Setelah persetujuan) Impor sungguhan ke STAGING
npx tsx scripts/rkk-import.mts "C:\Users\HandlerOne\AppData\Local\Temp\opencode\rkk-out\validation-report.json" --apply
```

Idempotent: aman dijalankan ulang (dokumen dengan `legacySourceId` sama dilewati).

## 3. Pemeriksaan hasil (setelah `--apply`)

1. Output importer: `imported` ≈ 361; `unmatched`=8; `review`=3; `skippedExisting`=0 (run pertama).
2. Hitung dokumen RKK di staging:
   `Document` dengan `documentType.code = "RKK"` → jumlah = jumlah `imported`.
3. Cek file fisik: `<repo>/storage/staff/*/rkk/*` ada dan berjumlah sama.
4. Buka satu staf di UI Komite → Dokumen → pastikan RKK tampil & bisa diunduh
   (via `/api/documents/:id/download`, perlu login).
5. Pastikan 8 unmatched & 3 NEEDS_REVIEW **tidak** terimpor.

## 4. Prosedur pemulihan (rollback) bila impor keliru

Hanya menyasar dokumen buatan importer (`legacySourceId LIKE 'rkk:%'`), tidak
menyentuh dokumen lain:

```powershell
# a) Daftar & hapus (staging) — script pemulihan yang dipakai saat insiden uji:
#    - hapus file di storage/staff/*/rkk/ yang tertaut legacySourceId rkk:*
#    - hapus baris Document dengan legacySourceId rkk:*
# (Jalankan pada STAGING; guard DB yang sama berlaku.)
```

Pemulihan tidak diperlukan jika dry-run/apply benar. **Selalu dry-run lebih dulu.**

## 5. Yang masih butuh keputusan pemilik

1. **8 unmatched** — konfirmasi apakah staf belum terdaftar atau perlu pemetaan nama/NIP (lihat `RKK_review_report.md`).
2. **3 NEEDS_REVIEW** — putuskan klasifikasi/identitas (nama SK ≠ nama RKK).
3. **Izin menjalankan `--apply`** ke staging — **SUDAH dijalankan** (361 dokumen di staging, 2026-10-10).
4. **Produksi**: impor ke produksi menyentuh **Google Drive produksi** (kredensial produksi). Ini **terpisah** dan butuh keputusan + guard khusus (mis. branch staging Drive) — belum disiapkan.

## 6. Status impor staging (2026-10-10) — SELESAI

- 361 dokumen RKK dibuat di staging (`ep-flat-shadow-b3vifsk0`): PK1 296, PK2 39, BK1 21, BK2 5.
- 361 file tersimpan lokal di `storage/staff/*/rkk/` (358 PDF + 3 DOCX), 0 rusak, 0 duplikat checksum.
- Audit manifest: `rkk-audit-manifest.json`/`.csv` (ID dokumen, staffId, NIP, nama, jenjang, checksum). Upload plan: `rkk-upload-plan.json`.

## 7. Pengiriman ke Google Drive — SELESAI (2026-10-10)

Target disetujui pemilik: akun Drive utama MYSIMNUSA **`friewhy3173@gmail.com`** (koneksi `DESTINATION`, root `MYSIMNUSA/`).

- **Uploader:** `scripts/rkk-drive-upload.mts` (`--apply`). Target folder: `MYSIMNUSA/staff/<staffId>/rkk/`, satu file per staf, tanpa menimpa, tanpa link publik.
- **Hasil:** 361/361 dokumen ada di Drive. Laporan `rkk-drive-delivery-report.json/.csv` — `UPLOADED_VERIFIED` 18 + `ALREADY_EXISTS_IDENTICAL` 343 = 361; 0 gagal/konflik.
- **Verifikasi independen:** 361/361 ditemukan via token `mysimnusaKey`; 3 file acak diunduh dari Drive → SHA-256 **identik** dengan lokal (konten utuh).
- **Catatan penting:** provider menyimpan `appProperties.mysimnusaKey` sebagai **token hash** (`sha256(key).slice(0,24)`), bukan key mentah — penting saat mencari duplikat. Jangan query dengan key mentah.
- File lokal staging **tetap utuh** (tidak dihapus).

## 8. Sisa keputusan pemilik

1. **8 unmatched** & **3 NEEDS_REVIEW** (lihat `RKK_review_report.md`) — belum diimpor/diunggah.
2. Retensi salinan lokal staging (`storage/staff/*/rkk/`).
3. Soft-delete/`@unique legacySourceId` (opsional, butuh migration).
