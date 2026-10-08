-- Borang Kepala Ruang workflow — ADDITIVE ONLY.
--
-- Introduces the Room → Kepala Ruang mapping table and the nullable workflow
-- columns / new status values required by the pengajuan-review-print lifecycle.
--
-- Safety:
--   * No DROP, no TRUNCATE, no data rewrite of existing rows.
--   * New enum values are appended; legacy statuses (VERIFICATION, APPROVED,
--     REJECTED, ARCHIVED) are preserved so pre-workflow entries keep working.
--   * All new columns on "borang_entries" are NULLABLE; existing rows are
--     untouched.
--   * New table "room_kepala_ruang" is empty on creation.

-- ── 1. New Borang lifecycle status values (append-only) ─────────────────────
ALTER TYPE "BorangStatus" ADD VALUE IF NOT EXISTS 'REVISION_REQUIRED';
ALTER TYPE "BorangStatus" ADD VALUE IF NOT EXISTS 'APPROVED_KARU';
ALTER TYPE "BorangStatus" ADD VALUE IF NOT EXISTS 'READY_TO_PRINT';
ALTER TYPE "BorangStatus" ADD VALUE IF NOT EXISTS 'PRINTED';
ALTER TYPE "BorangStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- ── 2. Room → Kepala Ruang mapping (Superadmin-managed) ─────────────────────
CREATE TABLE "room_kepala_ruang" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_kepala_ruang_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_kepala_ruang_roomId_key" ON "room_kepala_ruang"("roomId");
CREATE INDEX "room_kepala_ruang_userId_idx" ON "room_kepala_ruang"("userId");

ALTER TABLE "room_kepala_ruang"
    ADD CONSTRAINT "room_kepala_ruang_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_kepala_ruang"
    ADD CONSTRAINT "room_kepala_ruang_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. New nullable workflow columns on "borang_entries" ────────────────────
ALTER TABLE "borang_entries" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "kepalaRuangUserId" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "kepalaRuangName" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "kepalaRuangNip" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "kepalaRuangAt" TIMESTAMP(3);
ALTER TABLE "borang_entries" ADD COLUMN "adminReviewedAt" TIMESTAMP(3);
ALTER TABLE "borang_entries" ADD COLUMN "adminReviewedById" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "printReadyAt" TIMESTAMP(3);
ALTER TABLE "borang_entries" ADD COLUMN "printedAt" TIMESTAMP(3);
ALTER TABLE "borang_entries" ADD COLUMN "printedById" TEXT;
ALTER TABLE "borang_entries" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "borang_entries" ADD COLUMN "completedById" TEXT;

CREATE INDEX "borang_entries_roomId_idx" ON "borang_entries"("roomId");
CREATE INDEX "borang_entries_kepalaRuangUserId_idx" ON "borang_entries"("kepalaRuangUserId");

ALTER TABLE "borang_entries"
    ADD CONSTRAINT "borang_entries_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "borang_entries"
    ADD CONSTRAINT "borang_entries_printedById_fkey"
    FOREIGN KEY ("printedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "borang_entries"
    ADD CONSTRAINT "borang_entries_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
