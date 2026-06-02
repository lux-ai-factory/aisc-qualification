-- AlterTable
ALTER TABLE "Qualification" ADD COLUMN     "sectorId" TEXT,
ADD COLUMN     "systemCardJson" JSONB,
ADD COLUMN     "systemCardPdfPath" TEXT,
ADD COLUMN     "targetSystemId" TEXT,
ADD COLUMN     "targetSystemSubId" TEXT;
