-- The qualification schema's tables belong to qualification_owner, a role no application logs in as.
--
-- Migrations run as qualification_migrator (PROJECT_MIGRATE_DATABASE_URL), whose sessions act as
-- qualification_owner; the web app connects as qualification_rw, which from here on reads and writes rows
-- only: it cannot create, alter, truncate or put triggers on these tables, nor lift a guard. On the card
-- history and the form versions it may only insert and read.
--
-- An AI card (a row of qualification.qualification) is never deleted or truncated, whoever asks: like the
-- card version it describes (project.system), it is kept. Its reference to that version restricts. The
-- guards that keep a closed card as it was are listed in init/guard-triggers.txt, so not even a migration
-- can disable or drop them (the event trigger of init/project-database-setup.sql refuses it); a data
-- migration that must rewrite an old card asks the operator, who alone can lift the alarm.
--
-- In a project database this stops first unless the schema is qualification_owner's and the session acts
-- as qualification_owner: the platform hands the schema over (template 0033) once postgres-setup has made
-- the role. Safe on an install whose tables qualification_rw made: they are handed to the owner here.

DO $owner$
BEGIN
  IF current_database() ~ '^project_[0-9a-f]{32}$' AND (
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qualification_owner')
       OR (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'qualification')
          IS DISTINCT FROM 'qualification_owner'
       OR current_user <> 'qualification_owner') THEN
    RAISE EXCEPTION 'qualification_owner is missing or does not own schema qualification: run postgres-setup and the platform first, then migrate as qualification_migrator (PROJECT_MIGRATE_DATABASE_URL)';
  END IF;
END
$owner$;

-- An AI card is kept, as its card version is.
CREATE OR REPLACE FUNCTION qualification.qualification_is_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'every AI card is kept: qualification.qualification is never truncated';
  END IF;
  RAISE EXCEPTION 'AI card % is kept: it is never deleted', OLD.id;
END $$;
CREATE OR REPLACE TRIGGER qualification_no_delete BEFORE DELETE ON qualification.qualification
  FOR EACH ROW EXECUTE FUNCTION qualification.qualification_is_kept();
CREATE OR REPLACE TRIGGER qualification_no_truncate BEFORE TRUNCATE ON qualification.qualification
  FOR EACH STATEMENT EXECUTE FUNCTION qualification.qualification_is_kept();

-- The card version a card describes cannot be deleted from under it.
ALTER TABLE qualification.qualification DROP CONSTRAINT IF EXISTS qualification_system_id_fkey;
ALTER TABLE qualification.qualification ADD CONSTRAINT qualification_system_id_fkey
  FOREIGN KEY (system_id) REFERENCES project.system (pid) ON DELETE RESTRICT;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qualification_owner')
     OR current_user <> 'qualification_owner' THEN
    RETURN;                                      -- a scratch database outside the stack: nothing to hand over
  END IF;
  -- what the runtime role made before it stopped migrating
  REASSIGN OWNED BY qualification_rw TO qualification_owner;
  REVOKE CREATE ON SCHEMA qualification FROM qualification_rw;
  GRANT USAGE ON SCHEMA qualification TO qualification_rw;

  REVOKE ALL ON ALL TABLES IN SCHEMA qualification FROM qualification_rw;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA qualification TO qualification_rw;
  REVOKE UPDATE, DELETE ON qualification.card_history, qualification.question_set_version,
    qualification.question_set_version_item, qualification.questionnaire_version,
    qualification.questionnaire_version_item FROM qualification_rw;
  -- the migrations' own record is the migrator's
  REVOKE ALL ON qualification._prisma_migrations FROM qualification_rw;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA qualification FROM qualification_rw;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA qualification TO qualification_rw;
  ALTER DEFAULT PRIVILEGES FOR ROLE qualification_owner IN SCHEMA qualification
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qualification_rw;
  ALTER DEFAULT PRIVILEGES FOR ROLE qualification_owner IN SCHEMA qualification
    GRANT USAGE, SELECT ON SEQUENCES TO qualification_rw;

  -- the platform reads which card version a card is on, and nothing else of it
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_rw') THEN
    GRANT SELECT (system_id) ON qualification.qualification TO platform_rw;
  END IF;
END
$roles$;
