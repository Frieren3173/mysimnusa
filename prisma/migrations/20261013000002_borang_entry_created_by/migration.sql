-- Track the creating user on Borang entries for ownership + separation of duties.
--
-- Additive and safe for production: adds a nullable column + FK + index. Existing
-- rows keep createdById = NULL (treated as "owner unknown" by the API, which only
-- ever relaxes the ownership check for legacy entries).

ALTER TABLE "borang_entries" ADD COLUMN "createdById" TEXT;

CREATE INDEX "borang_entries_createdById_idx" ON "borang_entries"("createdById");

ALTER TABLE "borang_entries"
  ADD CONSTRAINT "borang_entries_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
