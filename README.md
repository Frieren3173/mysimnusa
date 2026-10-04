# MYSIMNUSA

**Sistem Informasi Manajemen Keperawatan & Kebidanan**

Aplikasi internal untuk pengelolaan Komite Keperawatan & Kebidanan: data SDM (perawat & bidan),
legalitas, kompetensi, borang (logbook & rekap tindakan), diklat, serta administrasi pengguna.

- **Nama teknis / project**: `mysimnusa`
- **Branding aplikasi**: MYSIMNUSA
- **Subjudul**: Sistem Informasi Manajemen Keperawatan & Kebidanan

## Arsitektur

```
GitHub  →  Vercel  →  Next.js  →  Prisma  →  Neon PostgreSQL
                                       └──→  Cloudflare R2 (penyimpanan berkas)
```

| Lapisan | Teknologi |
| --- | --- |
| Repositori | GitHub |
| Hosting / runtime aplikasi | Vercel (Next.js App Router, Node.js runtime) |
| Framework | Next.js 16 + React 19 |
| ORM | Prisma 6 (`@prisma/client` + `@prisma/adapter-neon`) |
| Database | Neon PostgreSQL (data terstruktur + metadata dokumen) |
| Penyimpanan berkas | Cloudflare R2 (berkas/dokumen: STR, SIP, BTCLS/ACLS, sertifikat kompetensi, CV, dokumen pendidikan, foto profil, borang, diklat, dsb.) |

> **Catatan:** Cloudflare Workers bukan lagi runtime aplikasi. Konfigurasi Worker/vinext sudah dihapus.
> Cloudflare tetap dipakai **hanya** untuk penyimpanan berkas (R2).

## Menjalankan Secara Lokal

```bash
npm install
npx prisma generate
npx prisma migrate status   # pastikan skema DB sinkron
npm run dev                 # http://localhost:3000
```

## Variabel Lingkungan

Salin `.env.example` menjadi `.env` lalu isi nilainya. **Jangan pernah commit berkas `.env` atau
nilai kredensial apa pun.**

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi Neon PostgreSQL (pooled) untuk aplikasi |
| `DATABASE_URL_UNPOOLED` | Koneksi langsung Neon (unpooled), untuk migrasi/seed |
| `AUTH_SECRET` | Secret untuk penandatanganan sesi |
| `NEXTAUTH_URL` | URL publik aplikasi |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Opsional, integrasi Google |
| `R2_ACCOUNT_ID` | Cloudflare account ID untuk R2 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Kredensial API token R2 (S3-compatible) |
| `R2_BUCKET_NAME` | Nama bucket R2 |
| `R2_PUBLIC_BASE_URL` | (Opsional) Domain publik/CDN untuk berkas R2 |

Pada Vercel, daftarkan variabel yang sama di **Project → Settings → Environment Variables**.

## Prisma

```bash
npx prisma generate         # generate client
npx prisma migrate status   # cek status migrasi terhadap DB
npx prisma migrate deploy   # menerapkan migrasi (gunakan koneksi unpooled untuk CI/CD)
npm run db:seed             # opsional, seed data awal
```

Arsitektur Prisma dipertahankan apa adanya (schema + migrasi yang sudah ada tidak diubah).

## Penyimpanan Berkas (Cloudflare R2)

Berkas dokumen akan disimpan di **Cloudflare R2** dan database hanya menyimpan metadata + referensi
objek (key). Tahap persiapan saat ini:

1. Variabel lingkungan R2 sudah didokumentasikan (lihat `.env.example`).
2. Integrasi bucket, unggah berkas, dan migrasi koleksi berkas lama **belum** dilakukan.

Langkah yang masih perlu dilakukan secara manual (lihat *Manual Steps* di bawah).

## Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan server pengembangan Next.js |
| `npm run build` | Build produksi Next.js |
| `npm run start` | Menjalankan hasil build produksi |
| `npm run lint` | Menjalankan ESLint |
| `npm run db:seed` | Seed database dari `prisma/seed.ts` |

## Deployment (Vercel)

1. Hubungkan repositori GitHub ke Vercel.
2. Set environment variables (lihat tabel di atas).
3. Build command: `npm run build` (Vercel otomatis; pastikan `prisma generate` berjalan — lihat
   *Manual Steps*).
4. Deploy.

## Keamanan

Jangan pernah commit atau mencetak nilai: `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, secret autentikasi, atau secret Vercel. Berkas `.env*`
sudah diabaikan oleh Git.
