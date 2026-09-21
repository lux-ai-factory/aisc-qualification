-- A qualification is of a project, and of one named system.
--
-- There is one database: this app's tables live in the `qualification` schema
-- and `core` is the platform's shared vocabulary. `core.project` is the
-- assessment, `core.system` the AI system being assessed. The engine's
-- evaluations point at that same system row, which is what lets a result be
-- read next to the qualification that describes what was tested.
--
-- Prisma cannot model a key that crosses schemas, so the columns are declared
-- in schema.prisma and the keys are made here. The platform grants this role
-- SELECT and REFERENCES on those two tables, and nothing else.

ALTER TABLE "Qualification" ADD COLUMN "projectId" uuid;
ALTER TABLE "Qualification" ADD COLUMN "systemId" uuid;

-- An existing qualification cannot be guessed into a project or a system: a
-- database that already has rows stops here rather than inventing owners.
ALTER TABLE "Qualification" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Qualification" ALTER COLUMN "systemId" SET NOT NULL;

CREATE INDEX "Qualification_projectId_idx" ON "Qualification"("projectId");
CREATE INDEX "Qualification_systemId_idx" ON "Qualification"("systemId");

ALTER TABLE "Qualification"
  ADD CONSTRAINT "Qualification_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES core.project(pid) ON DELETE CASCADE;

ALTER TABLE "Qualification"
  ADD CONSTRAINT "Qualification_systemId_fkey"
  FOREIGN KEY ("systemId") REFERENCES core.system(pid) ON DELETE CASCADE;
