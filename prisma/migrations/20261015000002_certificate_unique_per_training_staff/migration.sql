-- Certificate idempotency guard — ADDITIVE ONLY.
--
-- One certificate per (training, participant). Combined with the unique
-- certificateNumber this makes automated/concurrent issuance safe against
-- duplicates. Verified before adding: no existing duplicate (trainingId, staffId)
-- rows in staging or production.

CREATE UNIQUE INDEX "certificates_trainingId_staffId_key" ON "certificates"("trainingId", "staffId");
