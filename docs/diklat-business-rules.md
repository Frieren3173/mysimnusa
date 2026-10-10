# Diklat / IHT — Aturan Bisnis (FINAL)

Dokumen ini menetapkan aturan bisnis yang berlaku untuk modul Diklat/IHT.
Berlaku untuk dashboard JPL, riwayat staf, ekspor Excel, dan penerbitan sertifikat.

## 1. Kehadiran bersifat BINER

Status **HADIR** berarti peserta dianggap menghadiri **seluruh** kegiatan yang
diakui sistem. Tidak ada perhitungan persentase, tidak ada pembagian per sesi,
dan tidak ada model sesi formal.

| Kondisi | Kehadiran | JPL | Sertifikat |
|---|---|---|---|
| ≥1 HADIR pada kegiatan yang tidak CANCELLED, peserta tidak CANCELLED | Ya | **Bobot JPL penuh** kegiatan | Memenuhi syarat kehadiran |
| Tanpa HADIR (termasuk hanya SAKIT / IZIN / TIDAK_HADIR) | Tidak | 0 | Tidak memenuhi syarat |
| Kegiatan CANCELLED | — | 0 | Tidak diterbitkan (semua jalur) |
| Peserta CANCELLED | — | 0 | Tidak memenuhi syarat |

- Presensi tidak boleh dihitung ganda: JPL kegiatan ditambahkan **sekali** per
  pasangan unik `(kegiatan, staf)`, berapa pun jumlah baris HADIR.
- JPL **tidak** diprorata berdasarkan jumlah hari yang dihadiri.

## 2. Target JPL

- Target = **20 JPL per staf per tahun kalender** (1 Jan – 31 Des – berdasarkan
  `startDate` kegiatan).
- Total JPL selalu **diturunkan** dari satu sumber (`src/lib/diklat/jpl.ts`),
  dipakai bersama oleh dashboard, riwayat, dan ekspor.

## 3. Kelayakan sertifikat (per mode)

Field terkait: `certificateMode` = `ATTENDANCE_ONLY` (A) / `TEST_SCORED` (B) /
`TEST_COMPLETION` (C).

Urutan pemeriksaan (`evaluateEligibility`):

1. Peserta CANCELLED → tidak layak.
2. **Kehadiran (semua mode): wajib ≥1 HADIR.** Tanpa catatan presensi = belum
   lengkap → tidak layak.
3. Mode B/C: tes wajib **selesai/dikumpulkan**.
4. Jika `requireMinScore` aktif: nilai harus ada dan `≥ minScore`.
5. `showScore` hanya mengatur **tampilan** nilai pada sertifikat, bukan kelayakan.

## 4. `minAttendanceRate` — LEGACY, TIDAK DIPAKAI (keputusan C1, final)

- `minAttendanceRate` sebelumnya menghitung `HADIR / jumlah presensi tercatat`
  (persentase untuk peserta itu sendiri). Ini **menyesatkan** dan **tidak** sesuai
  kebutuhan bisnis (kehadiran biner).
- **Status final:** field **diabaikan** oleh logika kelayakan. Nilainya **tidak**
  memengaruhi JPL maupun sertifikat.
- Kolom DB & field API **tetap ada** hanya untuk **kompatibilitas data/konfigurasi**.
  Tidak ada migrasi destruktif dan tidak ada nilai lama yang diubah.
- UI **tidak lagi** menampilkan pengaturan persentase kehadiran; sebagai gantinya
  ditampilkan catatan aturan biner (minimal 1 HADIR).
- Pengiriman `minAttendanceRate` dari UI dihentikan, sehingga nilai tersimpan
  tetap utuh (PATCH bersifat opsional).

## 5. Penerbitan sertifikat — jalur & nomor

- Semua jalur (manual, batch `process`, `.pptx` `generate`, auto dari presensi/nilai)
  melewati **satu** service `issueCertificatesForTraining`.
- Idempoten: peserta yang sudah punya sertifikat tidak diterbitkan ulang.
- Nomor sertifikat **unik global**; alokasi mempertimbangkan seluruh nomor yang
  ada dengan retry pada tabrakan (P2002). Tidak ada keberhasilan palsu.
- Kegiatan CANCELLED tidak menerbitkan sertifikat pada jalur mana pun.

## 6. Referensi implementasi

- `src/lib/diklat/jpl.ts` — agregasi JPL (aturan biner, dedup).
- `src/lib/diklat/history.ts` — riwayat staf (aturan sama).
- `src/lib/diklat/certificate-policy.ts` — `evaluateEligibility` (≥1 HADIR + tes/nilai).
- `src/lib/diklat/certificate-issuance.ts` — service penerbitan bersama.
- `src/server/api/diklat-jpl-export.ts` — ekspor Excel (sumber sama dengan dashboard).
