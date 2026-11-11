-- A version's card can have several revisions: corrections of the description that do not
-- make a new version. A revision is a new row for the same version (system_id); revision 1
-- is the card saved with the version, and existing rows are revision 1 through the default.
ALTER TABLE qualification.qualification
  ADD COLUMN revision            integer NOT NULL DEFAULT 1,
  ADD COLUMN amends_id           text NULL,
  ADD COLUMN amend_reason        text NULL,
  ADD COLUMN amend_requested_by  text NULL;

-- A revision another one corrects cannot be deleted on its own: the correction would lose what it
-- corrects. Deleting the version deletes every revision in the same statement, which this allows.
ALTER TABLE qualification.qualification
  ADD CONSTRAINT qualification_amends_id_fkey
    FOREIGN KEY (amends_id) REFERENCES qualification.qualification (id);

-- the first revision says nothing about a correction; every later one says what, why and for whom
ALTER TABLE qualification.qualification
  ADD CONSTRAINT qualification_revision_is_explained CHECK (
    (revision = 1 AND amends_id IS NULL AND amend_reason IS NULL AND amend_requested_by IS NULL)
    OR (revision > 1 AND amends_id IS NOT NULL AND length(btrim(coalesce(amend_reason, ''))) > 0
      AND length(btrim(coalesce(amend_requested_by, ''))) > 0));

DROP INDEX qualification.qualification_system_id_key;
CREATE UNIQUE INDEX qualification_system_id_revision_key
  ON qualification.qualification (system_id, revision);

-- The card that may still change: the highest revision of the latest version. PL/pgSQL on
-- purpose, as card_is_latest: its body is checked when it runs.
CREATE FUNCTION qualification.card_is_current(card_id text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM qualification.qualification q
     WHERE q.id = card_id
       AND qualification.card_is_latest(q.system_id)
       AND q.revision = (SELECT max(o.revision) FROM qualification.qualification o
                          WHERE o.system_id = q.system_id));
END $$;

CREATE OR REPLACE FUNCTION qualification.qualification_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(OLD.id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION qualification.answer_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW."qualificationId") THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW."qualificationId";
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION qualification.component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW.qualification_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION qualification.system_component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW.qualification_id;
  END IF;
  RETURN NEW;
END $$;
