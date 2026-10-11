# Revisi MYSIMNUSA — Status & Item yang Membutuhkan Keputusan Pemilik

Branch kerja: `feat/full-revision-v1` (belum di-commit/deploy).

## A. Selesai diimplementasikan + teruji

| ID | Revisi | Status | Bukti |
|---|---|---|---|
| B | Landing page section 1–4 → UPPERCASE (via CSS, konten tak berubah) | Selesai | `src/app/scroll-story.css` (+`page.tsx` section) |
| C2 | Matriks kompetensi extensible (data-driven, tidak mengunci jenis) | Selesai (tanpa perubahan) | `komite/kompetensi/page.tsx:82` memakai `competency.findMany` |
| C3 | Istilah RN/KD → "Resusitasi Neonatus"/"Kardiologi Dasar" | Selesai | `migration-client.tsx`, `migration/source.ts` (value internal tetap) |
| D1 | Hapus menu "Input Borang" (Logbook tetap; route `/borang/entry` tetap) | Selesai | `src/lib/nav.ts`; `tests/nav-visibility.test.ts` |
| D3 | Workflow STAFF→KARU→SEKRETARIAT, enforcement backend + audit | Selesai + tes integrasi | `tests/borang-workflow-integration.test.ts` |
| D4 | Kode tindakan otomatis (sistem; user isi nama/kategori/deskripsi) | Selesai + tes | `src/lib/borang-action-code.ts`, `tests/borang-action-code.test.ts` |
| D5 | Hapus Borang semua status + konfirmasi persis | Selesai + tes | `borang-entries-$id$.ts`, `tests/borang-delete-integration.test.ts` |
| E | Gabung Dashboard Diklat + JPL (hapus menu duplikat, redirect `/diklat/jpl`) | Selesai | `diklat/page.tsx`, `diklat/jpl/page.tsx`, `nav.ts` |
| F | Filter/search auto-apply (komponen `AutoFilter` + debounce) | Selesai | `src/components/layout/auto-filter.tsx` diterapkan di 7 halaman filter |
| G | Matriks role × modul × aksi (least privilege) + tes | Selesai + tes | `tests/role-permission-matrix.test.ts` |
| RKK (mesin) | Pencocokan staf untuk bulk import RKK (NIP→nama→token, ambiguitas ditandai) | Selesai + tes | `src/lib/komite/rkk-match.ts`, `tests/rkk-match.test.ts` |
| RKK (paket) | Paket RKK dari berkas pemilik: ZIP + manifest + laporan validasi | Selesai (terverifikasi) | `scripts/rkk-build-package.mts` → `RKK_package.zip` (372 item; 369 PDF + 3 DOCX valid) |
| RKK (preview API) | Endpoint preview pencocokan (read-only) | Selesai + tes | `src/server/api/komite-rkk-match.ts`, `tests/komite-rkk-match.test.ts` |
| RKK (importer) | CLI impor ke dokumen staf existing (idempotent, staging-guarded, dry-run default) | Siap; `--apply` BELUM dijalankan | `scripts/rkk-import.mts` (dry-run: 361 siap impor, 8 unmatched, 3 review) |
| H | Audit kapasitas 400 + skenario load test | Selesai (audit); load test BLOCKED | `docs/capacity-400-users.md` |

## B. Membutuhkan keputusan / berkas dari pemilik

### B1. RKK — berkas sudah diterima; impor final menunggu izin
- **Berkas RKK sudah diterima** di `C:\Users\HandlerOne\Downloads\RKK PK I + PK II` (sudah terpisah per staf).
- **Paket terintegrasi dibangun & terverifikasi:** `RKK_package.zip` — 372 item (369 PDF valid + 3 DOCX valid), dengan `manifest.json` + laporan validasi. Klasifikasi **PK 1 / PK 2 / BK 1 / BK 2 diambil apa adanya dari laporan pemilik** (bukan tebakan): PK1=304, PK2=39, BK1=21, BK2=5, NEEDS_REVIEW=3 (dari lembar "Perlu_Pemeriksaan_Manual" pemilik).
- **Pencocokan ke staf staging:** 338 cocok NIP + 26 cocok nama = **356/372 (95,7%)**, **0 ambigu**, 8 unmatched (5 NIP tak ada di staging + 3 tanpa NIP), 26 tanpa NIP di sumber (mayoritas tercocok via nama).
- **Importer siap** (`scripts/rkk-import.mts`, idempotent via `legacySourceId`, staging-guarded): **dry-run → 361 siap impor**, 8 unmatched, 3 NEEDS_REVIEW. **`--apply` BELUM dijalankan** (operasi tulis massal ke staging + storage; menunggu keputusan operator).
- **Keputusan pemilik yang tersisa:**
  1. **Izin menjalankan impor** ke staging (`npx tsx scripts/rkk-import.mts <manifest> --apply`) — menulis ~361 dokumen ke DB staging + file ke provider storage staging.
  2. **8 unmatched** — konfirmasi apakah staf tsb memang belum terdaftar (maka RKK-nya menyusul) atau ada varian nama/NIP yang perlu dipetakan manual.
  3. **3 NEEDS_REVIEW** — diputuskan manual oleh pemilik (nama di SK ≠ nama di RKK) sebelum diklasifikasikan.
  4. **Dashboard Komite %PK1/PK2 (C1)** — implementasi bergantung pada impor selesai + penetapan bagaimana % dihitung (unit: jumlah staf vs jumlah dokumen).

### B2. Register Pasien per Ruangan (D6) + Integrasi ke Borang (D7) + Template (D8)
- Membutuhkan **model/tabel baru** (mis. `RoomPatientRegister`) → **migration baru**.
- **Tidak dijalankan** (aturan: migration production butuh persetujuan terpisah; tidak mengubah skema production dalam sesi ini).
- **Dibutuhkan keputusan:** persetujuan menambah migration baru (aditif) + definisi perilaku impor (mengganti vs menambah baris register).

### B3. Penugasan peran aktual (people mapping)
- Struktur role & pengaturan Kepala Ruang **sudah ada** (`RoomKepalaRuang`, `/settings/system/kepala-ruang`, endpoint superadmin-only).
- **Pemetaan pengguna → role** (mis. siapa Admin Diklat, Admin Borang, Kasi Keperawatan) **menunggu daftar pengguna dari pemilik**. Tidak dipindahkan/diubah massal.

### B4. Role "Kasi Keperawatan" (read-only lintas modul)
- **Belum ada** sebagai role tersimpan (menambah role = menulis tabel `roles` via seed → butuh izin).
- Fungsi read-only "overview + dashboard Komite/Borang/Diklat tanpa akses tulis" dapat dipenuhi dengan role baru; **menunggu keputusan pemilik** untuk membuatnya.

### B5. Staff "Cetak Borang"
- Pemilik meminta Staff dapat "Cetak Borang". Permission `BORANG_PRINT` saat ini terikat pada halaman **Cetak & Selesai** (tahap sekretariat, mencakup menandai COMPLETED) — memberi ke USER berisiko eskalasi.
- **Dibutuhkan klarifikasi:** apakah Staff mencetak borangnya **sendiri** (cetak dokumen, tanpa menandai selesai) atau melalui sekretariat. Agar least-privilege terjaga, tidak diubah tanpa kejelasan.

### B6. Load test kapasitas (H)
- Tool (k6/Artillery) & environment non-production terisolasi belum tersedia. **Tidak dipasang tanpa persetujuan.** Lihat `docs/capacity-400-users.md`.

## C. Catatan teknis (rekomendasi terpisah, butuh migration)

1. **Soft delete Borang (D5):** saat ini hard-delete (audit history dipertahankan/di-detach). Soft delete (`deletedAt`) butuh kolom baru → migration + keputusan retensi.
2. **`Competency.category` (C2):** penambahan kolom kategori matriks (mis. untuk anestesi) bersifat opsional; UI sudah data-driven sehingga penambahan jenis cukup lewat data.
