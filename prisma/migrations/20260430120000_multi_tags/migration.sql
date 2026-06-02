ALTER TABLE "Qualification" DROP COLUMN IF EXISTS "targetSystemId";
ALTER TABLE "Qualification" DROP COLUMN IF EXISTS "targetSystemSubId";
ALTER TABLE "Qualification" DROP COLUMN IF EXISTS "sectorId";
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "targetSystemTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "sectorTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
