ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "ontologyExtracted" JSONB;
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "ontologyPatch" JSONB;
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "ontologyAt" TIMESTAMP(3);
