-- CreateTable
CREATE TABLE "OntologyVersion" (
    "id" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "turtle" TEXT NOT NULL,
    "jsonld" TEXT NOT NULL,
    "stamp" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger" TEXT NOT NULL,
    "nodes" INTEGER NOT NULL,
    "triples" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OntologyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OntologyVersion_qualificationId_createdAt_idx" ON "OntologyVersion"("qualificationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OntologyVersion_qualificationId_digest_key" ON "OntologyVersion"("qualificationId", "digest");

-- AddForeignKey
ALTER TABLE "OntologyVersion" ADD CONSTRAINT "OntologyVersion_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

