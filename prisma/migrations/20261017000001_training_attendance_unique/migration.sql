-- TrainingAttendance: one row per (activity, staff, day) — ADDITIVE.
--
-- The `date` column is normalized to UTC midnight by the API before insert, so
-- this unique index also makes concurrent attendance writes safe (an upsert /
-- retry on P2002 replaces the previous find-then-update race).
--
-- Safety: verified 0 duplicate (trainingId, staffId, date) groups in staging AND
-- production before adding, so the index cannot fail. No data is modified.

CREATE UNIQUE INDEX "training_attendance_trainingId_staffId_date_key"
  ON "training_attendance"("trainingId", "staffId", "date");
