-- The two links are named project_id and system_id.
--
-- They are different things and stay different columns: the project is the
-- assessment a row belongs to, the system is the AI system it is about, and one
-- project can hold several systems. What was inconsistent was only their
-- spelling: `projectId` and `systemId` here, `platform_project_id` and
-- `system_id` elsewhere, for the same two keys.
--
-- The application keeps calling them projectId and systemId: Prisma's @map does
-- the renaming at the database boundary.

ALTER TABLE "Qualification" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "Qualification" RENAME COLUMN "systemId" TO "system_id";
ALTER INDEX "Qualification_projectId_idx" RENAME TO "Qualification_project_id_idx";
ALTER INDEX "Qualification_systemId_idx" RENAME TO "Qualification_system_id_idx";
ALTER TABLE "Qualification" RENAME CONSTRAINT "Qualification_projectId_fkey" TO "Qualification_project_id_fkey";
ALTER TABLE "Qualification" RENAME CONSTRAINT "Qualification_systemId_fkey" TO "Qualification_system_id_fkey";
