-- Per-year uniqueness for anonymised RM / patient codes.
--
-- Pre-flight (READ-ONLY audit run on production — scripts/check-borang-duplicates.mts):
--   * borang_entries has 0 rows → no duplicate rmNumber / patientIdentifier
--     values exist, so these unique indexes are safe to create.
--
-- Uniqueness is scoped to the calendar year (the first 4 chars of `period`),
-- matching the application rule (codes only need to be unique within a year).
-- Partial indexes: rows with NULL/blank codes are exempt.
--
-- Additive and production-safe: creates indexes only, no data changes.

CREATE UNIQUE INDEX IF NOT EXISTS "borang_entries_year_rm_key"
  ON "borang_entries" (substring("period" FROM 1 FOR 4), "rmNumber")
  WHERE "rmNumber" IS NOT NULL AND "rmNumber" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "borang_entries_year_patient_key"
  ON "borang_entries" (substring("period" FROM 1 FOR 4), "patientIdentifier")
  WHERE "patientIdentifier" IS NOT NULL AND "patientIdentifier" <> '';
