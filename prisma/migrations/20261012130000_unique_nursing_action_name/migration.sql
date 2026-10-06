-- MYSIMNUSA — enforce unique nursing action names.
--
-- Pre-flight (verified on production before writing this migration):
--   * nursing_actions has 0 duplicate names after the seed de-duplication.
--   * borang_entries count is 0, so no historical entry depends on a merged
--     action row.
--   * room_nursing_actions has 0 orphan rows and 0 duplicate links for the
--     surviving action per unique (roomId, nursingActionId).
--
-- The unique index makes duplicate actions impossible at the database level.

CREATE UNIQUE INDEX IF NOT EXISTS "nursing_actions_name_key" ON "nursing_actions"("name");
