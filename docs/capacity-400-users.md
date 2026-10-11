# Kapasitas 400 Pengguna — Audit & Skenario Load Test

> **Status: BELUM DIBUKTIKAN.** Dokumen ini menyiapkan skenario dan mencatat audit
> statis. **Bukan** klaim bahwa 400 pengguna aktif bersamaan sudah teruji. Load
> test TIDAK dijalankan ke production.

## 1. Perbedaan yang harus dibedakan

| Konsep | Beban |
|---|---|
| 400 **akun terdaftar** | Ringan — tidak ada beban serentak; hanya ukuran data. |
| 400 **pengguna aktif bersamaan** | Beban nyata — concurrency, koneksi DB, CPU serverless, rate limit. |

Jangan menyatakan "aman untuk 400 pengguna" tanpa menguji yang kedua.

## 2. Audit statis (bukti dari kode)

| Area | Temuan | Sumber |
|---|---|---|
| Connection pooling | Neon driver adapter, `max: 5` koneksi per instance; pooled WebSocket | `src/lib/prisma.ts:63-65` |
| Pagination | Server-side (`ServerPagination`) di banyak halaman list; `perPage` dibatasi ≤100 | `src/components/ui/server-pagination.tsx`, endpoint list |
| Index DB | `@@index` tersebar pada FK & kolom filter (mis. `trainings.startDate`, `documents.staffId`) | `prisma/schema.prisma` |
| Rate limiting | Rate limit login tersedia (`login_attempts`) | `tests/login-rate-limit.test.ts` |
| Upload | Batas ukuran file (mis. dokumen 15 MB) + validasi magic-bytes | `src/server/api/komite-staff-$id$-documents.ts:12` |
| Impor besar | Impor migrasi berjalan bertahap (chunk), transaksi 5s | `docs/restore-log.md` |

## 3. Risiko yang disorot (perlu verifikasi saat load test)

1. **N+1 query** pada halaman dengan relasi dalam (tabel borang, JPL per-staf).
2. **Endpoints mahal** tanpa proteksi tambahan (export Excel/DOCX, rekalkulasi eligibilitas).
3. **Kapasitas koneksi Neon** bila banyak instance serverless aktif bersamaan.
4. **Operasi tulis bersamaan** (presensi/absensi, kuota peserta) — sudah dirancang serializable, perlu diuji dengan beban.

## 4. Skenario load test (untuk dijalankan di lingkungan non-production terverifikasi)

Gunakan **k6** atau **Artillery** (belum terpasang — perlu keputusan pemilik).

```
# Contoh k6 (jalankan HANYA ke environment staging terverifikasi)
k6 run --vus 400 --duration 5m loadtest/read-heavy.js
```

Profil yang diusulkan:

| Skenario | VU | Durasi | Endpoint |
|---|---|---|---|
| Read-heavy (dashboard, list) | 400 | 5m | `/dashboard`, `/komite/staff`, `/borang/logbook`, `/diklat` |
| Mixed (read 90% / write 10%) | 200 | 5m | + POST presensi/assessment (data sintetis staging) |
| Export | 50 | 2m | `/api/diklat/jpl/export`, `/api/borang/export` |
| Burst login | 400 ramp | 1m | `/api/auth/login` |

Metrik yang WAJIB diukur: throughput (rps), latency **p50/p95/p99**, error rate,
jumlah koneksi DB aktif, dan kegagalan query.

## 5. Keterbatasan saat ini (BLOCKED)

- Tidak ada tool load test terpasang (k6/Artillery) — **tidak memasang dependency baru tanpa persetujuan**.
- Tidak ada environment staging terverifikasi yang aman untuk beban tinggi & data sintetis.
- Load test **DILARANG** diarahkan ke production.

## 6. Rekomendasi

1. Pemilik menyediakan environment non-production terisolasi + izin memasang k6/Artillery.
2. Jalankan skenario di atas; dokumentasikan hasil p50/p95/p99 + error rate.
3. Hanya setelah itu, status "siap 400 pengguna aktif bersamaan" boleh diklaim.
