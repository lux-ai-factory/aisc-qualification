-- The card is the filled AIRO graph (ontologyExtracted and ontologyPatch). The columns that held
-- a rendered card were never read: they go. IF EXISTS, so a database without them migrates too.
ALTER TABLE qualification.qualification
  DROP COLUMN IF EXISTS "systemCard",
  DROP COLUMN IF EXISTS "systemCardJson",
  DROP COLUMN IF EXISTS system_card_at,
  DROP COLUMN IF EXISTS "systemCardPdfPath";
