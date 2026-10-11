-- Per-room patient register — ADDITIVE ONLY.
--
-- Adds `patient_register_entries`: the Kepala Ruang of a room manages the
-- patient list for THEIR room; Staff select a patient from their room's register
-- when creating a Borang entry. This is SEPARATE from the anonymous
-- `borang_entries.patientIdentifier` (unchanged).
--
-- Safety: new table only. No column is dropped/altered, no existing data is
-- touched, and the new table starts empty. One RM per room is enforced by the
-- unique index (dedup + stable matching key).

CREATE TABLE "patient_register_entries" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "no" INTEGER,
    "patientName" TEXT NOT NULL,
    "rmNumber" TEXT NOT NULL,
    "diagnosis" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_register_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_register_entries_roomId_rmNumber_key"
  ON "patient_register_entries"("roomId", "rmNumber");
CREATE INDEX "patient_register_entries_roomId_idx"
  ON "patient_register_entries"("roomId");

ALTER TABLE "patient_register_entries"
  ADD CONSTRAINT "patient_register_entries_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
