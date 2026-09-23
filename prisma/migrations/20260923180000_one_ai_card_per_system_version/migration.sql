-- One AI card per version of the project's one AI system.
--
-- A card used to name a row of core.system, and a project could hold several
-- cards for the same one. Now a project has one AI system in versions
-- (core.ai_system_version, made and frozen by the platform), and submitting a
-- card freezes the version it describes, so each version has at most one card.
-- The platform carried every row of core.system over under the same pid, so
-- the system_id already stored here names the right version.

-- Two cards for one version cannot be settled here: which one describes it is
-- a person's decision, and this role cannot make versions to move one to.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM qualification GROUP BY system_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Some AI system versions have more than one AI card: '
            'keep one per version (qualification.system_id) before this migration.';
    END IF;
END $$;

ALTER TABLE qualification DROP CONSTRAINT IF EXISTS "Qualification_system_id_fkey";
ALTER TABLE qualification
    ADD CONSTRAINT "qualification_system_id_fkey"
    FOREIGN KEY (system_id) REFERENCES core.ai_system_version (pid) ON DELETE CASCADE;

DROP INDEX IF EXISTS "Qualification_system_id_idx";
CREATE UNIQUE INDEX "qualification_system_id_key" ON qualification (system_id);
