# Borang Workflow — Audit & Finalisasi

## Status workflow aktual (sebelum & sesudah)
Workflow existing **sudah benar** (single source of truth: `src/lib/borang-workflow.ts`):

```
DRAFT ──SUBMIT──▶ SUBMITTED ──APPROVE_KARU──▶ APPROVED_KARU ──READY_TO_PRINT──▶ READY_TO_PRINT ──PRINT──▶ PRINTED ──COMPLETE──▶ COMPLETED
                     │                              │
                     └──REQUEST_REVISION──▶ REVISION_REQUIRED ◀──ADMIN_REVISION──┘
```

| Tahap | Aktor | Aksi | Permission | Status hasil |
|---|---|---|---|---|
| A | Staff | `SUBMIT` | `borang.logbook.submit` | `SUBMITTED` |
| B | Kepala Ruang (ruangannya) | `APPROVE_KARU` / `REQUEST_REVISION` | `borang.karu.review` | `APPROVED_KARU` / `REVISION_REQUIRED` |
| C | Sekretariat (DIKLAT_BORANG / ADMIN_BORANG) | `READY_TO_PRINT` / `ADMIN_REVISION` | `borang.admin.review` | `READY_TO_PRINT` / `REVISION_REQUIRED` |
| D | Sekretariat | `PRINT` → `COMPLETE` | `borang.press.print` / `borang.press.complete` | `PRINTED` → `COMPLETED` |

## Perbaikan yang dilakukan (tugas ini)

### FIND-WF-01 (P1) — Hasil cetak final tidak digate di backend — **FIXED**
- **Bug:** `GET /api/borang/export` hanya memeriksa `BORANG_LOGBOOK_READ` dan mengekspor SEMUA entri tahun itu — sehingga hasil cetak "final" (DOCX) dapat diunduh walau workflow belum lolos verifikasi.
- **Root cause:** tidak ada sumber kebenaran status "boleh dicetak final"; endpoint mengabaikan `status`.
- **Perbaikan:**
  - `src/lib/borang-workflow.ts`: tambah `FINAL_PRINTABLE_STATUSES = ["READY_TO_PRINT","PRINTED","COMPLETED"]` + `canPrintFinal(status)` (satu sumber kebenaran, dipakai backend).
  - `src/server/api/borang-export.ts`: (a) **filter** entri ke `canPrintFinal`; (b) tolak **409 NOT_VERIFIED** bila tidak ada entri terverifikasi; (c) **ownership**: non-printer hanya boleh mengekspor staf miliknya (else 403).
- **Regression test:** `tests/borang-export-gate.test.ts` (5) — non-verified→409, APPROVED_KARU saja→409, READY_TO_PRINT→200, cross-staff→403, own record→200. Plus `canPrintFinal` unit di `borang-workflow-v1.test.ts`.

## Kebijakan cetak final (satu sumber kebenaran)
- `DRAFT`/`SUBMITTED`/`REVISION_REQUIRED`/`REJECTED`/`APPROVED_KARU` → **tidak** dapat cetak final.
- `READY_TO_PRINT`/`PRINTED`/`COMPLETED` → dapat cetak (sesuai permission).
- Ditegakkan di **backend** (`borang-export.ts`), bukan hanya tombol UI.

## Catatan kebenaran (tidak mengklaim lebih dari implementasi)
- Persetujuan Sekretariat (`READY_TO_PRINT`) berarti borang **siap untuk proses permintaan tanda tangan Kasi Keperawatan** — aplikasi **belum** memiliki tanda tangan elektronik. Print page menyatakan "setelah tanda tangan basah & stempel". Tidak diklaim tanda tangan final diberikan.
- Histori verifikasi (`BorangVerification`) tidak dihapus pada perubahan status.

## Uji yang dijalankan
- `tests/borang-workflow-integration.test.ts` (10): cross-room, KARU approve, skip, wrong-role, superadmin, SoD, revision note, **Sekretariat sebelum KARU→409**, **chain KARU→Sekretariat**, **direct API unauthorised→403**.
- `tests/borang-workflow-v1.test.ts`: transisi + `canPrintFinal`.
- `tests/borang-export-gate.test.ts` (5).
- `tests/role-permission-matrix.test.ts` (12): pemetaan tahap KARU/Sekretariat/Staff/read-only.
- `tests/borang-actions-integration.test.ts` (5), `borang-delete-integration.test.ts` (11).

## Belum dapat diuji
- UAT browser interaktif (tanpa sesi/kredensial) — **BLOCKED**.
