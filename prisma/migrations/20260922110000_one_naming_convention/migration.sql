-- One naming convention, and timestamps that carry their zone.
--
-- Quoted CamelCase in this schema, snake_case in the others: a query joining
-- two schemas had to remember which half needed quotes. Singular snake_case,
-- compounds joined with an underscore.
--
-- The application still says Qualification and createdAt: Prisma's @map and
-- @@map do this at the database boundary, so no TypeScript changes.

ALTER TABLE "Qualification" RENAME TO "qualification";
ALTER TABLE "QualificationAnswer" RENAME TO "qualification_answer";
ALTER TABLE "QualificationRisk" RENAME TO "qualification_risk";
ALTER TABLE "KnowledgeGraph" RENAME TO "knowledge_graph";

ALTER TABLE "qualification" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "qualification" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "qualification" RENAME COLUMN "ontologyAt" TO "ontology_at";
ALTER TABLE "qualification" RENAME COLUMN "systemCardAt" TO "system_card_at";
ALTER TABLE "knowledge_graph" RENAME COLUMN "builtAt" TO "built_at";

ALTER TABLE "qualification"  ALTER COLUMN "created_at"     TYPE timestamptz(3) USING "created_at"     AT TIME ZONE 'UTC';
ALTER TABLE "qualification"  ALTER COLUMN "updated_at"     TYPE timestamptz(3) USING "updated_at"     AT TIME ZONE 'UTC';
ALTER TABLE "qualification"  ALTER COLUMN "ontology_at"    TYPE timestamptz(3) USING "ontology_at"    AT TIME ZONE 'UTC';
ALTER TABLE "qualification"  ALTER COLUMN "system_card_at" TYPE timestamptz(3) USING "system_card_at" AT TIME ZONE 'UTC';
ALTER TABLE "knowledge_graph" ALTER COLUMN "built_at"      TYPE timestamptz(3) USING "built_at"       AT TIME ZONE 'UTC';
