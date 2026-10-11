# Backlog — MYSIMNUSA (pasca-audit)

Item yang **tidak wajib** untuk rilis saat ini (bukan bug kritis).

| # | Item | Prioritas | Catatan |
|---|---|---|---|
| B-1 | Load test 400 pengguna (k6) di staging terisolasi | P2 | Butuh tool + env; hasil untuk memvalidasi pool/`max:5`, index, endpoint mahal |
| B-2 | `@unique` pada `Document.legacySourceId` | P3 | Idempotensi keras; butuh migration (menunggu persetujuan) |
| B-3 | Aktifkan CSP `enforce` (`CSP_MODE=enforce`) setelah laporan bersih | P3 | Saat ini report-only |
| B-4 | Soft-delete Borang (kolom `deletedAt`) | P3 | Butuh migration + kebijakan retensi |
| B-5 | Batas concurrency eksplisit untuk export/generate | P3 | Perlindungan endpoint mahal |
| B-6 | Metrics/observability (APM) | P3 | Saat ini hanya logger |
| B-7 | Register pasien per ruangan (D6/D7/D8) | **Backend DONE** | Model+endpoint+migration (teruji di DB disposable). Sisa: **UI** (unggah Kepala Ruang + pemilih pasien di form Borang). |
| B-8 | Penerapan migration `patient_register` ke staging/produksi | P1 (menunggu keputusan) | Disetujui & terapkan sesuai prosedur; produk teruji di DB disposable |
