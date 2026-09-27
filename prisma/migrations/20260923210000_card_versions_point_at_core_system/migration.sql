-- AI cards point at card versions in core.system, and only the latest version's card changes.
--
-- The project has one AI system; what is versioned is its AI card. Each saved version is a
-- row of core.system, numbered per project by the platform (its migration 0003), and each
-- card points at the version it describes. The older versions are kept as they were: the
-- triggers below refuse any change to their card, its answers and its component links.
-- Nothing here touches knowledge_graph or qualification_risk.

-- 1. cards are never deleted: refuse when one points outside core.system
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT q.system_id::text, ', ') INTO missing
    FROM qualification q
   WHERE NOT EXISTS (SELECT 1 FROM core.system s WHERE s.pid = q.system_id);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'cards point at system versions missing from core.system: %', missing;
  END IF;
END $$;

-- 2. the card's key points at core.system
ALTER TABLE qualification DROP CONSTRAINT IF EXISTS qualification_system_id_fkey;
ALTER TABLE qualification DROP CONSTRAINT IF EXISTS "Qualification_system_id_fkey";
ALTER TABLE qualification ADD CONSTRAINT qualification_system_id_fkey
  FOREIGN KEY (system_id) REFERENCES core.system (pid) ON DELETE CASCADE;

-- 3. PL/pgSQL on purpose: core.system.number may not exist yet when this runs (a body in
--    LANGUAGE sql is checked when it is created)
CREATE FUNCTION qualification.card_is_latest(version_pid uuid) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM core.system s
     WHERE s.pid = version_pid
       AND s.number = (SELECT max(o.number) FROM core.system o WHERE o.project_id = s.project_id));
END $$;

-- 4. the card itself
CREATE FUNCTION qualification.qualification_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_latest(OLD.system_id) THEN
    RAISE EXCEPTION 'AI card % is of a version that is not the latest: it is kept as it was', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_only_latest_changes BEFORE UPDATE ON qualification.qualification
  FOR EACH ROW EXECUTE FUNCTION qualification.qualification_only_latest_changes();

-- 5. answers: INSERT or UPDATE only (no DELETE trigger, so the project cascade is never blocked)
CREATE FUNCTION qualification.answer_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_latest(
       (SELECT q.system_id FROM qualification.qualification q WHERE q.id = NEW."qualificationId")) THEN
    RAISE EXCEPTION 'AI card % is of a version that is not the latest: it is kept as it was', NEW."qualificationId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_answer_only_latest_changes
  BEFORE INSERT OR UPDATE ON qualification.qualification_answer
  FOR EACH ROW EXECUTE FUNCTION qualification.answer_only_latest_changes();

-- 6. card_component: the engine components a card links, by AIRO property
CREATE TABLE qualification.card_component (
  id               text PRIMARY KEY,
  qualification_id text NOT NULL REFERENCES qualification.qualification (id) ON DELETE CASCADE,
  component_pid    uuid NOT NULL,
  airo_property    text NOT NULL CHECK (airo_property IN
                     ('hasModel','hasTrainingData','hasTestingData','hasValidationData','hasComponent')),
  name             text NOT NULL,
  component_type   text NOT NULL,
  object_name      text NOT NULL DEFAULT '',
  linked_at        timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX card_component_qualification_id_component_pid_key
  ON qualification.card_component (qualification_id, component_pid);
CREATE INDEX card_component_component_pid_idx ON qualification.card_component (component_pid);
CREATE FUNCTION qualification.component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_latest(
       (SELECT q.system_id FROM qualification.qualification q WHERE q.id = NEW.qualification_id)) THEN
    RAISE EXCEPTION 'AI card % is of a version that is not the latest: it is kept as it was', NEW.qualification_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER card_component_only_latest_changes
  BEFORE INSERT OR UPDATE ON qualification.card_component
  FOR EACH ROW EXECUTE FUNCTION qualification.component_only_latest_changes();
