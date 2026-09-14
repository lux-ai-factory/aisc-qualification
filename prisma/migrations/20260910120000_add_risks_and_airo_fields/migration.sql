ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "marketFormTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "localityTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Qualification" ADD COLUMN IF NOT EXISTS "intendedDeployers" TEXT;

CREATE TABLE IF NOT EXISTS "QualificationRisk" (
    "id" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "risk" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "vulnerability" TEXT,
    "consequence" TEXT NOT NULL,
    "affected" TEXT NOT NULL,
    "impactAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "control" TEXT NOT NULL,
    "followUpControl" TEXT,
    CONSTRAINT "QualificationRisk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QualificationRisk_qualificationId_idx" ON "QualificationRisk"("qualificationId");

ALTER TABLE "QualificationRisk" ADD CONSTRAINT "QualificationRisk_qualificationId_fkey"
    FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
