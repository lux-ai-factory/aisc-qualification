-- A card's version belongs to the card's project.
--
-- system_id already points at core.system (pid), and project_id at core.project (pid), but
-- nothing tied the two together: a card could name project A and a version of project B.
-- (system_id, project_id) now points at core.system (pid, project_id). ON DELETE CASCADE, as
-- the system_id key: deleting a version takes its card with it, as it already does.
--
-- The key needs core.system to be unique on (pid, project_id), which the platform makes
-- (init/platform-db.sql on a fresh volume, platform migration 0004 and init/project-databases.sql
-- on an existing one). This role cannot make it. Where it does not exist yet (an existing volume
-- whose postgres-setup has not run since), this migration leaves the key out and says so, and
-- init/project-databases.sql adds it under this name on its next run. 8190233523 is the lock
-- those places take too, so the check and the add are never interleaved with theirs.
-- Nothing here touches knowledge_graph or qualification_risk.
DO $$
BEGIN
  PERFORM pg_advisory_xact_lock(8190233523);
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'qualification.qualification'::regclass
                AND conname = 'qualification_system_id_project_id_fkey') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'core.system'::regclass AND conname = 'system_pid_project_id_key') THEN
    ALTER TABLE qualification.qualification
      ADD CONSTRAINT qualification_system_id_project_id_fkey
      FOREIGN KEY (system_id, project_id) REFERENCES core.system (pid, project_id) ON DELETE CASCADE;
  ELSE
    RAISE NOTICE 'core.system has no unique (pid, project_id) yet: qualification_system_id_project_id_fkey is left to init/project-databases.sql';
  END IF;
END $$;
