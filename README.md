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
                                       └──→  Google Drive (penyimpanan berkas produksi)
                                              (alternatif: Cloudflare R2 / disk lokal)
```

| Lapisan | Teknologi |
| --- | --- |
| Repositori | GitHub |
| Hosting / runtime aplikasi | Vercel (Next.js App Router, Node.js runtime) |
| Framework | Next.js 16 + React 19 |
| ORM | Prisma 6 (`@prisma/client` + `@prisma/adapter-neon`) |
| Database | Neon PostgreSQL (data terstruktur + metadata dokumen) |
| Penyimpanan berkas | **Google Drive** (produksi), atau Cloudflare R2 / disk lokal |

> **Catatan:** Cloudflare Workers bukan lagi runtime aplikasi. Konfigurasi Worker/vinext sudah dihapus.
> Cloudflare R2 tetap didukung sebagai penyimpanan **alternatif** (lihat `STORAGE_PROVIDER`).

## Menjalankan Secara Lokal

```bash
npm install
npx prisma generate
npx prisma migrate status   # pastikan skema DB sinkron
npm run dev                 # http://localhost:3000
npm test                    # unit test (vitest)
```

## Variabel Lingkungan

Salin `.env.example` menjadi `.env` lalu isi nilainya. **Jangan pernah commit berkas `.env` atau
nilai kredensial apa pun.**

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi Neon PostgreSQL (pooled) untuk aplikasi |
| `DATABASE_URL_UNPOOLED` | Koneksi langsung Neon (unpooled), untuk migrasi/seed |
| `AUTH_SECRET` | Secret untuk penandatanganan sesi. **Wajib** di produksi dan minimal 32 karakter |
| `TOKEN_ENCRYPTION_KEY` | (Opsional) kunci khusus enkripsi token Google. Bila kosong, diturunkan dari `AUTH_SECRET` |
| `NEXTAUTH_URL` | URL publik aplikasi |
| `STORAGE_PROVIDER` | `google-drive` (produksi) / `r2` / `local` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Integrasi Google (penyimpanan + Migration Center) |
| `R2_ACCOUNT_ID` | Cloudflare account ID untuk R2 (opsional, provider alternatif) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Kredensial API token R2 (S3-compatible) |
| `R2_BUCKET_NAME` | Nama bucket R2 |
| `R2_PUBLIC_BASE_URL` | (Opsional) Domain publik/CDN untuk berkas R2 |
| `LOGIN_RATE_LIMIT_MAX` | (Opsional) batas percobaan login per IP (default `5`) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | (Opsional) jendela waktu rate limit dalam ms (default `900000`) |
| `LOGIN_RATE_LIMIT_USER_MAX` | (Opsional) batas percobaan login per username (default `2 × LOGIN_RATE_LIMIT_MAX`) |

Pada Vercel, daftarkan variabel yang sama di **Project → Settings → Environment Variables**.

### Rahasia & enkripsi token Google

`AUTH_SECRET` ditandatangani sesi dan, bila `TOKEN_ENCRYPTION_KEY` tidak diisi, juga menjadi dasar
(SHA-256) untuk mengenkripsi token OAuth Google di database.

- **Mengganti `AUTH_SECRET` (atau `TOKEN_ENCRYPTION_KEY`)** membuat token Google yang tersimpan
  tidak dapat didekripsi lagi — koneksi Google harus **disambungkan ulang**.
- Nilai divalidasi secara *lazy*: di runtime produksi `AUTH_SECRET` yang kosong/< 32 karakter akan
  melempar error saat pertama dipakai (bukan saat build), sehingga `next build` di Vercel tetap aman.

## Prisma

```bash
npx prisma generate         # generate client
npx prisma migrate status   # cek status migrasi terhadap DB
npx prisma migrate deploy   # menerapkan migrasi (gunakan koneksi unpooled untuk CI/CD)
npm run db:seed             # opsional, seed data awal
```

### Menerapkan migrasi baru (produksi)

Migrasi ditulis secara **aditif** (hanya menambah tabel/kolom/index, tanpa mengubah data). Untuk
menerapkannya ke database produksi, jalankan dengan koneksi **unpooled**:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy
```

Setelah `deploy`, jalankan `npx prisma generate` bila skema client berubah.

## Penyimpanan Berkas

Provider penyimpanan dipilih lewat `STORAGE_PROVIDER`:

| Nilai | Backend | Keterangan |
| --- | --- | --- |
| `google-drive` | Google Drive | **Produksi saat ini**. Berkas privat; akses hanya lewat route aplikasi |
| `r2` | Cloudflare R2 | Alternatif (S3-compatible) |
| `local` | Disk lokal | Hanya untuk pengembangan (`storage/`) |

Database (Neon) hanya menyimpan metadata + referensi objek (`storageKey`), tidak pernah byte berkas.

**Validasi unggahan:** tipe berkas ditentukan di server dari **ekstensi** (tabel ekstensi→MIME milik
server) dan diverifikasi lewat **magic bytes**, bukan dari `file.type` kiriman klien. Saat disajikan,
`Content-Type` diambil dari ekstensi `storageKey`, dilengkapi `X-Content-Type-Options: nosniff`;
hanya PDF & gambar yang disajikan `inline`, sisanya `attachment`.

## Pengujian

```bash
npm test           # sekali jalan (vitest run)
npm run test:watch # mode watch
```

Tes unit mencakup logika tanpa database: validasi `AUTH_SECRET`, penentuan tipe/magic bytes unggahan,
pemisahan tugas (separation of duties) & transisi workflow borang, rate limit login, serta format
nomor RM / kode pasien.

## Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan server pengembangan Next.js |
| `npm run build` | Build produksi Next.js |
| `npm run start` | Menjalankan hasil build produksi |
| `npm run lint` | Menjalankan ESLint |
| `npm test` | Menjalankan unit test (vitest) |
| `npm run db:seed` | Seed database dari `prisma/seed.ts` |

## Deployment (Vercel)

1. Hubungkan repositori GitHub ke Vercel.
2. Set environment variables (lihat tabel di atas).
3. Build command: `npm run build` (Vercel otomatis; pastikan `prisma generate` berjalan — lihat
   *Manual Steps*).
4. Deploy.

### Region fungsi (penting)

`vercel.json` menetapkan `"regions": ["sin1"]` agar fungsi berjalan di **Singapore** — satu region
dengan database Neon (`ap-southeast-1`). Ini memangkas latensi setiap query dari ~200 ms menjadi
beberapa milidetik jaringan lokal; tanpa ini waktu respons naik ke 2–3 detik.

Jika database dipindah ke region lain, sesuaikan `regions` di `vercel.json` agar tetap
sekongkolasi dengan Neon.

### Runtime Prisma

`src/lib/prisma.ts` memakai satu `PrismaClient` per instance serverless dengan **Neon driver
adapter (WebSocket, pooled)**. Pool koneksi aman digunakan ulang antar-request pada runtime
Node.js Vercel, sehingga tidak ada handshake per-request.

## Keamanan

Jangan pernah commit atau mencetak nilai: `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, secret autentikasi, atau secret Vercel. Berkas `.env*`
sudah diabaikan oleh Git.

### Header keamanan

`next.config.ts` menambahkan header untuk semua rute: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
(camera/microphone/geolocation/payment/usb dimatikan), dan `Strict-Transport-Security` (produksi).

### CSP hardening (report-only → blocking)

CSP saat ini dipasang sebagai **`Content-Security-Policy-Report-Only`** — hanya melaporkan, tidak
memblokir. Kebijakan yang dipasang:

```
default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
object-src 'none'; img-src 'self' data: blob:; media-src 'self'; font-src 'self' data:;
style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';
connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'
```

**Cara memeriksa laporan pelanggaran:**

1. Buka aplikasi di browser, lalu **DevTools → Console**. Pelanggaran CSP muncul sebagai
   *"Refused to load/execute … because it violates the … Content Security Policy"*.
2. Filter kata `Content Security Policy` di Console untuk melihat semua pelanggaran.
3. Setelah beberapa waktu pemakaian tanpa pelanggaran, ubah di `next.config.ts` header dari
   `Content-Security-Policy-Report-Only` menjadi `Content-Security-Policy` untuk mulai memblokir.
   Bila muncul pelanggaran, tambahkan origin yang diperlukan pada direktif terkait sebelum beralih.
