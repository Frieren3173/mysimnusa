-- Diklat/IHT JPL-per-activity + annual curriculum — ADDITIVE ONLY.
--
-- Adds:
--   • trainings.jpl (nullable) + trainings.curriculumItemId (nullable FK).
--   • curriculum_programs + curriculum_items tables.
--
-- Safety:
--   * No DROP / TRUNCATE / data rewrite. All new columns are NULLABLE, so
--     existing activities keep working with jpl = NULL (never fabricated).
--   * New tables start empty.

-- ── 1. Training: JPL + curriculum link column ──────────────────────────────
ALTER TABLE "trainings" ADD COLUMN "jpl" INTEGER;
ALTER TABLE "trainings" ADD COLUMN "curriculumItemId" TEXT;

CREATE INDEX "trainings_startDate_idx" ON "trainings"("startDate");
CREATE INDEX "trainings_curriculumItemId_idx" ON "trainings"("curriculumItemId");

-- ── 2. Curriculum programs ─────────────────────────────────────────────────
CREATE TABLE "curriculum_programs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DIRANCANG',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentStorageKey" TEXT,
    "documentProvider" TEXT,
    "documentName" TEXT,
    "documentMimeType" TEXT,
    "documentSize" INTEGER,

    CONSTRAINT "curriculum_programs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "curriculum_programs_year_idx" ON "curriculum_programs"("year");
CREATE INDEX "curriculum_programs_status_idx" ON "curriculum_programs"("status");

-- ── 3. Curriculum items ────────────────────────────────────────────────────
CREATE TABLE "curriculum_items" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3),
    "targetJpl" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DIRANCANG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "curriculum_items_programId_idx" ON "curriculum_items"("programId");
CREATE INDEX "curriculum_items_status_idx" ON "curriculum_items"("status");

ALTER TABLE "curriculum_items"
  ADD CONSTRAINT "curriculum_items_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "curriculum_programs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Training → curriculum item FK (after the table exists) ──────────────
ALTER TABLE "trainings"
  ADD CONSTRAINT "trainings_curriculumItemId_fkey"
  FOREIGN KEY ("curriculumItemId") REFERENCES "curriculum_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
