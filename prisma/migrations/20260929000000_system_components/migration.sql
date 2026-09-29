-- The card's Components block (targets plan v2, 2026-09-29): one row per part of the system,
-- each with a stable key carried from one card version to the next, so the assessments of that
-- part and their results can name it. Data the system is built on is a kind; a test set is not.
CREATE TABLE qualification.qualification_component (
  id               text PRIMARY KEY,
  qualification_id text NOT NULL REFERENCES qualification.qualification (id) ON DELETE CASCADE,
  position         integer NOT NULL,
  key              uuid NOT NULL,
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  role             text NULL,
  kind             text NOT NULL CHECK (kind IN ('model', 'rule_engine', 'llm', 'training_data', 'validation_data',
                                                 'other_data', 'pipeline', 'interface', 'other')),
  provider         text NOT NULL DEFAULT 'in_house' CHECK (provider IN ('in_house', 'third_party')),
  provider_name    text NULL,
  CHECK (provider = 'in_house' OR length(btrim(coalesce(provider_name, ''))) > 0)
);
CREATE UNIQUE INDEX qualification_component_qualification_id_key_key
  ON qualification.qualification_component (qualification_id, key);
CREATE UNIQUE INDEX qualification_component_one_name_per_card
  ON qualification.qualification_component (qualification_id, lower(btrim(name)));
CREATE INDEX qualification_component_key_idx ON qualification.qualification_component (key);

-- only the latest card version changes, as for answers and component links
CREATE FUNCTION qualification.system_component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_latest(
       (SELECT q.system_id FROM qualification.qualification q WHERE q.id = NEW.qualification_id)) THEN
    RAISE EXCEPTION 'AI card % is of a version that is not the latest: it is kept as it was', NEW.qualification_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_component_only_latest_changes
  BEFORE INSERT OR UPDATE ON qualification.qualification_component
  FOR EACH ROW EXECUTE FUNCTION qualification.system_component_only_latest_changes();

-- an engine item linked to the card may say which part it is; test material is not a part
ALTER TABLE qualification.card_component ADD COLUMN component_key uuid NULL;
ALTER TABLE qualification.card_component ADD CONSTRAINT card_component_test_material_is_no_part
  CHECK (component_key IS NULL OR airo_property <> 'hasTestingData');
-- the part must be one of the same card's components
CREATE FUNCTION qualification.card_component_part_is_on_the_card() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.component_key IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM qualification.qualification_component c
        WHERE c.qualification_id = NEW.qualification_id AND c.key = NEW.component_key) THEN
    RAISE EXCEPTION 'component % is not on AI card %', NEW.component_key, NEW.qualification_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER card_component_part_is_on_the_card
  BEFORE INSERT OR UPDATE ON qualification.card_component
  FOR EACH ROW EXECUTE FUNCTION qualification.card_component_part_is_on_the_card();
