-- DropForeignKey
ALTER TABLE "OntologyVersion" DROP CONSTRAINT "OntologyVersion_qualificationId_fkey";

-- DropTable
DROP TABLE "OntologyVersion";

-- CreateTable
CREATE TABLE "KnowledgeGraph" (
    "id" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "turtle" TEXT NOT NULL,
    "jsonld" TEXT NOT NULL,
    "stamp" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nodes" INTEGER NOT NULL,
    "triples" INTEGER NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeGraph_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeGraph_qualificationId_key" ON "KnowledgeGraph"("qualificationId");

-- AddForeignKey
ALTER TABLE "KnowledgeGraph" ADD CONSTRAINT "KnowledgeGraph_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

