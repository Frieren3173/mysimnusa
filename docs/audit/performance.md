# Performance & Scalability Audit — MYSIMNUSA

> **Kapasitas 400 pengguna aktif bersamaan BELUM TERBUKTI.** Tidak ada tool load test (k6/Artillery) maupun environment non-produksi terisolasi. Angka di bawah adalah hasil **audit statis**, bukan hasil pengukuran beban.

## 1. Koneksi database
- `src/lib/prisma.ts`: Neon driver adapter, `max: 5` koneksi per instance serverless (pooled WebSocket). Wajar untuk Vercel serverless; total koneksi = 5 × jumlah instance aktif bersamaan.
- Risiko: pada lonjakan instance bersamaan, total koneksi bisa mendekati batas Neon. **Perlu diuji** dengan beban nyata.

## 2. Query & pola N+1
- Tidak ditemukan N+1 tak terbatas. Loop dengan `await prisma` yang ada bersifat **bounded**:
  - `borang-actions.ts` (retry ≤25) — diperbaiki (FIND-01) agar query agregat hanya sekali.
  - `diklat-trainings-$id$-certificates-generate.ts` (alokasi nomor, bounded).
  - `admin-migration-*` (upsert batch kecil).
- `getJplRows` (`jpl.ts`): 3 query + agregasi di JS (didesain menghindari JOIN duplikatif).

## 3. Pagination
- List utama memakai pagination server-side (`ServerPagination`), `perPage` dibatasi ≤100, `page ≥ 1`.
- `borang-actions` membatasi `perPage` (≤500 saat roomId, ≤100 default).

## 4. Filter & pencarian
- `AutoFilter` (baru): select langsung apply, input teks **debounce 350 ms**, reset `page` saat filter berubah → mencegah request per keystroke.

## 5. Index
- `@@index` tersebar pada FK & kolom filter (`staffId`, `documentTypeId`, `expiryDate`, `trainings.startDate`, `curriculumItemId`, dll).
- Unique: `certificateNumber`, `certificate(trainingId,staffId)`, `training_attendance(trainingId,staffId,date)`, `training_participants(trainingId,staffId)`.

## 6. Endpoint mahal
- Export Excel/DOCX & generate .pptx: pemrosesan in-memory. Tidak ada batas concurrency eksplisit (serverless alami membatasi). Batch generate dibatasi `staffIds` (mis. ≤200).

## 7. Cache & observability
- `src/lib/logger.ts` untuk logging server-side (tanpa data sensitif). Tidak ada metrics/APM khusus.

## 8. Timeout & retry
- Retry P2002 bounded pada create (sertifikat, tindakan). `googleFetch` retry 401 sekali.

## 9. Rekomendasi (belum dijalankan)
1. Load test nyata (k6) pada staging terisolasi: 400 VU read-heavy + mixed; ukur p50/p95/p99, error rate, koneksi DB.
2. Pertimbangkan menaikkan `max` pool / connection pooler Neon sesuai hasil ukur.
3. Tambah batas concurrency pada endpoint export/generate bila perlu.

**Status: PARTIAL — audit statis selesai, pengukuran beban BLOCKED (tool/env tidak tersedia).**
