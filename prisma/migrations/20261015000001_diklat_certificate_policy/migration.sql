-- Diklat/IHT certificate automation — ADDITIVE ONLY.
--
-- Adds per-activity certificate policy, participant eligibility/issuance state,
-- assessment completion tracking, and certificate audit fields.
--
-- Safety:
--   * No DROP / TRUNCATE / data rewrite. Every new column is nullable or has a
--     DEFAULT, so existing rows keep working unchanged.
--   * Existing behaviours are preserved: default mode ATTENDANCE_ONLY and
--     requireTest/requireMinScore/showScore = false.

-- ── 1. Training: certificate policy ────────────────────────────────────────
ALTER TABLE "trainings" ADD COLUMN "certificateMode" TEXT NOT NULL DEFAULT 'ATTENDANCE_ONLY';
ALTER TABLE "trainings" ADD COLUMN "requireTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trainings" ADD COLUMN "requireMinScore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trainings" ADD COLUMN "minScore" DOUBLE PRECISION;
ALTER TABLE "trainings" ADD COLUMN "showScore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trainings" ADD COLUMN "minAttendanceRate" INTEGER;

-- ── 2. TrainingParticipant: eligibility & issuance ─────────────────────────
ALTER TABLE "training_participants" ADD COLUMN "eligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "training_participants" ADD COLUMN "eligibilityReason" TEXT;
ALTER TABLE "training_participants" ADD COLUMN "certificateIssuedAt" TIMESTAMP(3);
ALTER TABLE "training_participants" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- ── 3. TrainingAssessment: completion tracking ─────────────────────────────
ALTER TABLE "training_assessments" ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "training_assessments" ADD COLUMN "completedAt" TIMESTAMP(3);

-- ── 4. Certificate: audit fields ───────────────────────────────────────────
ALTER TABLE "certificates" ADD COLUMN "issuedById" TEXT;
ALTER TABLE "certificates" ADD COLUMN "trigger" TEXT;
