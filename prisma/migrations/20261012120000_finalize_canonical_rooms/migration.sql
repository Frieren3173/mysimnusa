-- MYSIMNUSA — finalize canonical Room master.
--
-- Goals:
--   1. Add canonical grouping columns (category, subcategory) to "rooms".
--   2. Backfill category/subcategory for the 17 canonical rooms.
--   3. Permanently delete the 14 legacy/duplicate rooms — but ONLY when they
--      are provably unused (no staff, no borang entries). Legacy rooms are
--      matched by their exact audited primary-key ids, never by wildcard, so
--      canonical rooms can never be affected.
--
-- Safety:
--   * Additive column changes use IF NOT EXISTS (idempotent).
--   * The DELETE is restricted to an explicit id allow-list AND guarded by
--     NOT EXISTS checks against "staff" and "borang_entries".
--   * room_nursing_actions has ON DELETE CASCADE, so links of deleted rooms
--     are removed automatically and no other table is affected.

-- ─────────────────────────────────────────────────────────────
-- 1. Canonical grouping columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

CREATE INDEX IF NOT EXISTS "rooms_category_idx" ON "rooms"("category");

-- ─────────────────────────────────────────────────────────────
-- 2. Backfill canonical rooms (idempotent — matched by canonical name)
-- ─────────────────────────────────────────────────────────────
UPDATE "rooms" SET
  "category" = CASE "name"
    WHEN 'KRIS LANTAI 4'      THEN 'RAWAT INAP'
    WHEN 'KRIS LANTAI 5'      THEN 'RAWAT INAP'
    WHEN 'FORKLIN'            THEN 'RAWAT INAP'
    WHEN 'VK/KEBIDANAN'       THEN 'RAWAT INAP'
    WHEN 'ISOLASI'            THEN 'RAWAT INAP'
    WHEN 'VIP'                THEN 'RAWAT INAP'
    WHEN 'HD'                 THEN 'RAWAT INAP'
    WHEN 'IBS'                THEN 'IBS / BEDAH'
    WHEN 'CATHLAB'            THEN 'IBS / BEDAH'
    WHEN 'IGD'                THEN 'KEGAWATDARURATAN'
    WHEN 'ICU'                THEN 'KEGAWATDARURATAN'
    WHEN 'PICU'               THEN 'KEGAWATDARURATAN'
    WHEN 'NICU/PERINA'        THEN 'KEGAWATDARURATAN'
    WHEN 'PONEK'              THEN 'KEGAWATDARURATAN'
    WHEN 'POLI'               THEN 'RAWAT JALAN'
    WHEN 'PPI'                THEN 'MANAGEMENT'
    WHEN 'KOMITE KEPERAWATAN' THEN 'MANAGEMENT'
  END,
  "subcategory" = CASE "name"
    WHEN 'VK/KEBIDANAN'       THEN 'KEBIDANAN'
    WHEN 'HD'                 THEN 'HEMODIALISA'
    WHEN 'IBS'                THEN 'BEDAH / OPERASI'
    WHEN 'CATHLAB'            THEN 'KATETERISASI / CARDIAC PROCEDURE'
    WHEN 'IGD'                THEN 'IGD'
    WHEN 'ICU'                THEN 'ICU'
    WHEN 'PICU'               THEN 'PICU'
    WHEN 'NICU/PERINA'        THEN 'NICU / PERINATOLOGI'
    WHEN 'PONEK'              THEN 'OBSTETRI & NEONATAL EMERGENCY'
    WHEN 'POLI'               THEN 'RAWAT JALAN'
    WHEN 'PPI'                THEN 'PPI'
    WHEN 'KOMITE KEPERAWATAN' THEN 'KOMITE / KREDENSIAL / MUTU'
  END
WHERE "name" IN (
  'KRIS LANTAI 4','KRIS LANTAI 5','FORKLIN','VK/KEBIDANAN','ISOLASI','VIP','HD',
  'IBS','CATHLAB','IGD','ICU','PICU','NICU/PERINA','PONEK','POLI','PPI','KOMITE KEPERAWATAN'
);

-- ─────────────────────────────────────────────────────────────
-- 3. Delete the 14 legacy rooms.
--
-- Delete by explicit primary-key id: this is a precise, reviewed allow-list
-- of the exact legacy rows audited on production. It can never match a
-- canonical room, regardless of name/code.
--
-- Each delete is additionally guarded by NOT EXISTS checks against "staff"
-- and "borang_entries" so the migration aborts the row (deletes nothing) if
-- any reference ever appears. Idempotent: re-running deletes zero rows.
--
-- Note: canonical rooms (IBS, HD, POLI, PONEK, NICU/PERINA, PICU) have a
-- NULL code, while the legacy duplicates carry the code values below; the
-- id allow-list removes any ambiguity entirely.
-- ─────────────────────────────────────────────────────────────
DELETE FROM "rooms" r
WHERE r."id" IN (
  'cmutl9lbj001svjewk8emlv7i', -- Rawat Inap Bedah
  'cmutl9ldt001tvjewcyao2hl1', -- Rawat Inap Penyakit Dalam
  'cmutl9lg4001uvjew4us8w1u9', -- Kamar Operasi (OK)
  'cmutl9lig001vvjew6qlo5t95', -- VK / Bersalin
  'cmutl9lku001wvjew5ptuyiia', -- Poli Rawat Jalan
  'cmutl9ln2001xvjewsq2qh781', -- Hemodialisa
  'cmutl9luw001yvjewv4703s4w', -- Rawat Inap 1
  'cmutl9m0l001zvjewu47ad2uf', -- Intensive Cardiac Care Unit
  'cmutl9m2w0020vjewq4jjusdy', -- Neonatal Intensive Care Unit
  'cmutl9m540021vjewj4tmqiie', -- Pediatric Intensive Care Unit
  'cmutl9m7d0022vjew0c8deh7z', -- Instalasi Bedah Sentral
  'cmutl9m9p0023vjew7zxmmme6', -- Recovery Room
  'cmutl9mfi0024vjewl6g1btp5', -- Ruang Nifas
  'cmutl9mmg0025vjewhoj5x8lt'  -- Pelayanan Obstetri Neonatal Emergensi
)
AND NOT EXISTS (SELECT 1 FROM "staff" s WHERE s."roomId" = r."id")
AND NOT EXISTS (SELECT 1 FROM "borang_entries" b WHERE b."roomId" = r."id");
