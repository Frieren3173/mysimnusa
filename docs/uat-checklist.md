# Browser UAT Checklist — Borang Workflow V1

Commit under test: `dbe636b` (Preview wired to the isolated staging branch
`uat-borang-v1`). Accounts: `superadmin`, `uat.komite`, `uat.diklat`,
`uat.user`, `uat.karu` (see `docs/uat-borang-v1.md`).

**Test data:** mapped room = `ICU` (Karu `uat.karu`); unmapped room = `IGD`.

Mark each row: ☐ Pass ☐ Fail. Note the resolution for every row.

**Resolutions:** D = Desktop 1920×1080 · L = Laptop 1366×768 · M = Mobile 390×844

---

## 0. Session & menu visibility

| # | Role | Step | Expected | D | L | M |
|---|---|---|---|---|---|---|
| 0.1 | superadmin | Login; view sidebar | All groups: Komite, Borang (all items), Diklat, Administrasi, Pengaturan | ☐ | ☐ | ☐ |
| 0.2 | uat.komite | Login | Only **Komite** (+ Overview, Pengaturan). **No Borang/Diklat/Administrasi** | ☐ | ☐ | ☐ |
| 0.3 | uat.diklat | Login | **Diklat** + Borang (Dashboard, Logbook, Sekretariat, Cetak). **No Review, no Input Borang, no Administrasi** | ☐ | ☐ | ☐ |
| 0.4 | uat.user | Login | Borang (Dashboard, Logbook, Input). **No Review/Sekretariat/Cetak/Verifikasi/Master** | ☐ | ☐ | ☐ |
| 0.5 | uat.karu | Login | Borang (Dashboard, Logbook, Review). **No Input Borang/Sekretariat/Cetak** | ☐ | ☐ | ☐ |
| 0.6 | uat.komite | Navigate directly to `/borang` | 403 page (server-side, not just hidden) | ☐ | ☐ | ☐ |
| 0.7 | uat.user | Navigate directly to `/borang/review` | 403 page | ☐ | ☐ | ☐ |
| 0.8 | any | Navigate to `/settings/system/kepala-ruang` as non-superadmin | 403 page | ☐ | ☐ | ☐ |

## 1. Superadmin — Room → Kepala Ruang mapping

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 1.1 | `/settings/system/kepala-ruang` | List of all active rooms with current Kepala Ruang (ICU shows uat.karu) | ☐ | ☐ | ☐ |
| 1.2 | Observe `IGD` row | Shows "Belum ditetapkan" + warning banner counts unmapped rooms | ☐ | ☐ | ☐ |
| 1.3 | Assign `uat.karu` to `IGD` | Saved; row shows uat.karu; success message | ☐ | ☐ | ☐ |
| 1.4 | Clear `IGD` mapping | Saved; row shows "Belum ditetapkan" again | ☐ | ☐ | ☐ |
| 1.5 | Candidates dropdown | Only KEPALA_RUANG accounts appear (uat.karu) | ☐ | ☐ | ☐ |

## 2. USER — draft & submit

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 2.1 | `uat.user` → `/borang/logbook` → create draft (room ICU) | Draft saved, appears in list as DRAFT | ☐ | ☐ | ☐ |
| 2.2 | Try to create a second draft choosing room `IGD` via the form | Rejected (own-room only) or room not offered | ☐ | ☐ | ☐ |
| 2.3 | Edit the draft; save | Changes persisted | ☐ | ☐ | ☐ |
| 2.4 | Submit ("Simpan & Kirim") | Confirmation shown; status → Diajukan (SUBMITTED) | ☐ | ☐ | ☐ |
| 2.5 | Attempt to edit the SUBMITTED entry | Blocked (no edit control / API 409) | ☐ | ☐ | ☐ |
| 2.6 | Response detail (network) after submit | `kepalaRuangUserId` present (snapshot of ICU KARU) | ☐ | ☐ | ☐ |

## 3. USER — submit with NO Kepala Ruang (negative)

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 3.1 | Ensure `IGD` has no Kepala Ruang (clear in §1.4) | IGD unmapped | ☐ | ☐ | ☐ |
| 3.2 | Attempt to submit a Borang for `IGD` (via direct API/admin) | Blocked with `NO_KEPALA_RUANG` (409) — submission not allowed | ☐ | ☐ | ☐ |

## 4. KEPALA_RUANG — review & approval

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 4.1 | `uat.karu` → `/borang/review` | Queue lists ICU submissions only | ☐ | ☐ | ☐ |
| 4.2 | Verify an entry kept out of the queue if its room ≠ ICU | Not shown | ☐ | ☐ | ☐ |
| 4.3 | Open row → expand timeline | Workflow timeline shows current step | ☐ | ☐ | ☐ |
| 4.4 | "Minta Revisi" without a note | Blocked (note required, 422) | ☐ | ☐ | ☐ |
| 4.5 | "Minta Revisi" with a note | Status → Perlu Revisi (REVISION_REQUIRED) | ☐ | ☐ | ☐ |
| 4.6 | (as `uat.user`) fix & resubmit | Status → Diajukan (SUBMITTED) again | ☐ | ☐ | ☐ |
| 4.7 | (as `uat.karu`) "Setujui" | Status → Disetujui Kepala Ruang (APPROVED_KARU) | ☐ | ☐ | ☐ |
| 4.8 | `uat.karu` opens `/borang/secretariat` or `/borang/print` | 403 (not permitted) | ☐ | ☐ | ☐ |

## 5. DIKLAT_BORANG — secretariat administrative review

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 5.1 | `uat.diklat` → `/borang/secretariat` | Queue lists APPROVED_KARU entries | ☐ | ☐ | ☐ |
| 5.2 | "Kembalikan untuk Revisi" without note | Blocked (note required) | ☐ | ☐ | ☐ |
| 5.3 | "Kembalikan untuk Revisi" with note | Status → Perlu Revisi; KARU approval history preserved in timeline | ☐ | ☐ | ☐ |
| 5.4 | "Finalisasi & Siap Cetak" | Status → Siap Dicetak (READY_TO_PRINT) | ☐ | ☐ | ☐ |
| 5.5 | `uat.diklat` opens `/borang/review` | 403 (not permitted) | ☐ | ☐ | ☐ |

## 6. Print & complete

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 6.1 | `uat.diklat` → `/borang/print` | Lists READY_TO_PRINT / PRINTED | ☐ | ☐ | ☐ |
| 6.2 | "Pratinjau" opens DOCX export | DOCX downloads/opens; shows signature block + patient table | ☐ | ☐ | ☐ |
| 6.3 | "Tandai Sudah Dicetak" | Status → Sudah Dicetak (PRINTED) | ☐ | ☐ | ☐ |
| 6.4 | "Selesaikan" | Status → Selesai (COMPLETED) | ☐ | ☐ | ☐ |
| 6.5 | Step skip check: try COMPLETE on a READY_TO_PRINT item | Control not offered / blocked | ☐ | ☐ | ☐ |

## 7. Cross-room isolation (server-side)

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 7.1 | `uat.user` (room ICU) creates entry for IGD room id (crafted) | 403 FORBIDDEN_ROOM | ☐ | ☐ | ☐ |
| 7.2 | `uat.karu` (ICU) attempts APPROVE on an IGD entry | 403 (cross-room denied) | ☐ | ☐ | ☐ |
| 7.3 | `uat.user` attempts `APPROVE_KARU` on own entry | 403 | ☐ | ☐ | ☐ |
| 7.4 | Unauthenticated request to `/api/borang/entries` | 401 | ☐ | ☐ | ☐ |
| 7.5 | Any non-superadmin PUT `/api/admin/rooms/kepala-ruang` | 403 | ☐ | ☐ | ☐ |

## 8. Audit trail & notifications

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 8.1 | `superadmin` → `/admin/audit` | Entries for SUBMITTED, APPROVE_KARU, ADMINISTRATIVE_APPROVAL, PRINT, COMPLETE | ☐ | ☐ | ☐ |
| 8.2 | `uat.karu` after a new submit | In-app notification "Borang menunggu review" (bell) | ☐ | ☐ | ☐ |
| 8.3 | `uat.user` after revision request | Notification "Borang perlu revisi" | ☐ | ☐ | ☐ |
| 8.4 | `uat.diklat` when an entry reaches the secretariat | Notification "Borang masuk antrean sekretariat" | ☐ | ☐ | ☐ |
| 8.5 | `uat.user` when an entry becomes READY_TO_PRINT | Notification "Borang siap dicetak" | ☐ | ☐ | ☐ |

## 9. Responsive layout & accessibility

| # | Check | Expected | D | L | M |
|---|---|---|---|---|---|
| 9.1 | Sidebar | Collapsible on desktop; hidden on mobile without breaking content | ☐ | ☐ | ☐ |
| 9.2 | Borang tables | Horizontal scroll (no clipped columns) at each width | ☐ | ☐ | ☐ |
| 9.3 | Review/secretariat/print action buttons | Reachable and not overlapping at each width | ☐ | ☐ | ☐ |
| 9.4 | Dialogs (confirm / revision note) | Fit viewport; Esc closes | ☐ | ☐ | ☐ |
| 9.5 | Keyboard-only navigation of the review queue | Focus visible; actions operable | ☐ | ☐ | ☐ |
| 9.6 | Status badges & timeline contrast | Legible (WCAG AA) | ☐ | ☐ | ☐ |

## 10. Regression (existing modules)

| # | Step | Expected | D | L | M |
|---|---|---|---|---|---|
| 10.1 | Legacy `/borang/verification` (as `superadmin`) still loads | Works (legacy flow preserved) | ☐ | ☐ | ☐ |
| 10.2 | Legacy `/borang/archive` still loads | Works | ☐ | ☐ | ☐ |
| 10.3 | `/komite/*` (as `uat.komite`) | Loads and functions | ☐ | ☐ | ☐ |
| 10.4 | `/diklat/*` (as `uat.diklat`) | Loads and functions | ☐ | ☐ | ☐ |
| 10.5 | `/admin/users` role assignment (as `superadmin`) | Can assign the five business roles; existing roles intact | ☐ | ☐ | ☐ |

---

## Defect log

| # | Role | Action | Expected | Actual | Severity | Evidence |
|---|---|---|---|---|---|---|
| | | | | | | |

## Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| UAT lead | | | |
| Superadmin | | | |
