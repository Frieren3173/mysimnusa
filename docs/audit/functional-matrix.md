# Functional Matrix — MYSIMNUSA

Status per hasil audit aktual. PASS hanya jika fungsi inti benar-benar diuji.

| Modul | Fitur | Perilaku diharapkan | Implementasi | Status | Risiko | Bukti |
|---|---|---|---|---|---|---|
| Landing | Halaman publik | Render + section uppercase | `src/app/page.tsx`, `scroll-story.css` | PASS | P3 | smoke HTTP 200; CSS uppercase |
| Auth | Login/logout | Session cookie, redirect | `auth-login.ts`, `auth.ts` | PASS | P2 | cookie httpOnly/secure/lax; 307 redirect |
| RBAC | Guard semua endpoint | Server-side authorize | `src/lib/authorization.ts`, 67 handler | PASS | P1 | audit: 0 handler tanpa guard |
| Komite | Dashboard/KPI | Data real, konsisten | `komite/page.tsx` | PARTIAL | P2 | struktur OK; verifikasi browser BLOCKED |
| Komite | Legalitas/kompetensi/dokumen | List+filter+download | `komite/*`, `documents-*-download.ts` | PASS | P2 | download auth-gated (401) |
| Komite | RKK match/import | NIP→nama, ambiguitas ditandai | `komite/rkk-match.ts`, `komite-rkk-match.ts` | PASS | P2 | 361 docs; 0 duplikat; test 14/14 |
| Borang | Logbook input | Create/submit | `borang-entries.ts` | PASS | P1 | test integrasi |
| Borang | Workflow 3 tahap | KARU→sekretariat, cross-room | `borang-entries-$id$-workflow.ts` | PASS | P1 | test integrasi 7/7 |
| Borang | Master tindakan auto-code | Kode sistem, unik | `borang-actions.ts` | PASS | P2 | **FIXED FIND-01**; test 5/5 |
| Borang | Hapus borang | Semua status, konfirmasi | `borang-entries-$id$.ts` | PASS | P1 | test integrasi 11/11 |
| Borang | Register pasien (D6/D7/D8) | Upload/kelola oleh Kepala Ruang per ruangan | `borang-patient-register.ts`, `komite/patient-register.ts`, UI `/borang/register` | PASS | P2 | 24 test; migration belum di staging |
| Diklat | Eligibility sertifikat | ≥1 HADIR, tes/nilai | `certificate-policy.ts` | PASS | P1 | 20 test policy |
| Diklat | Issuance/nomor/idempotensi | Unik global, CANCELLED blokir | `certificate-issuance.ts` | PASS | P1 | test regresi B1-B6 |
| Diklat | JPL biner/agregasi | 1 HADIR=bobot penuh, target 20 | `jpl.ts`, `history.ts` | PASS | P1 | test jpl-binary 19/19 |
| Diklat | Dashboard gabungan | KPI+filter+pagination | `diklat/page.tsx` | PASS | P2 | redirect /diklat/jpl |
| Global | Filter auto-apply | Debounce, reset page | `auto-filter.tsx` | PASS | P2 | diterapkan 7 halaman |
| Export | Excel/DOCX | Formula injection netral | `xlsx-export.ts`, `spreadsheet.ts` | PASS | P2 | test spreadsheet |
| Storage | Download auth | 401 tanpa izin | `documents-$id$-download.ts` | PASS | P1 | smoke 401 |

Catatan: PASS di sini berarti diverifikasi via unit/integration test, audit kode, atau smoke HTTP — **bukan** klaim UI end-to-end (browser UAT BLOCKED tanpa kredensial).
