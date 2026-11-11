-- Every row hanging off a card is kept as it was once the card is no longer the current one
-- (the highest revision of the latest version): its risks and its knowledge graph too, and no
-- row may be moved off such a card onto another (an UPDATE checks the card it leaves as well as
-- the one it reaches). DELETE stays unguarded, so deleting a version (its cards, and through
-- them their rows) is never blocked.
--
-- A future data migration that rewrites old cards must disable these triggers for its run
-- (ALTER TABLE ... DISABLE TRIGGER ..., then ENABLE): they refuse it otherwise.

CREATE OR REPLACE FUNCTION qualification.answer_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW."qualificationId") THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW."qualificationId";
  END IF;
  IF TG_OP = 'UPDATE' AND NOT qualification.card_is_current(OLD."qualificationId") THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', OLD."qualificationId";
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION qualification.component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW.qualification_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT qualification.card_is_current(OLD.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', OLD.qualification_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION qualification.system_component_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW.qualification_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT qualification.card_is_current(OLD.qualification_id) THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', OLD.qualification_id;
  END IF;
  RETURN NEW;
END $$;

-- risks and the knowledge graph name their card as "qualificationId", like answers
CREATE FUNCTION qualification.card_row_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_current(NEW."qualificationId") THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', NEW."qualificationId";
  END IF;
  IF TG_OP = 'UPDATE' AND NOT qualification.card_is_current(OLD."qualificationId") THEN
    RAISE EXCEPTION 'AI card % is not the latest revision of the latest version: it is kept as it was', OLD."qualificationId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_risk_only_latest_changes
  BEFORE INSERT OR UPDATE ON qualification.qualification_risk
  FOR EACH ROW EXECUTE FUNCTION qualification.card_row_only_latest_changes();
CREATE TRIGGER knowledge_graph_only_latest_changes
  BEFORE INSERT OR UPDATE ON qualification.knowledge_graph
  FOR EACH ROW EXECUTE FUNCTION qualification.card_row_only_latest_changes();


-- A correction corrects the revision just before it, of the same version: revision n of a version
-- names that version's revision n - 1 in amends_id. Two corrections of the same revision cannot
-- both be stored (one revision number each), and none can skip one or name another version's card.
CREATE FUNCTION qualification.revision_corrects_the_one_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision > 1 AND NOT EXISTS (
    SELECT 1 FROM qualification.qualification o
     WHERE o.id = NEW.amends_id AND o.system_id = NEW.system_id AND o.revision = NEW.revision - 1
  ) THEN
    RAISE EXCEPTION 'AI card % is revision % of its version: it corrects that version''s revision %, not card %',
      NEW.id, NEW.revision, NEW.revision - 1, NEW.amends_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_revision_corrects_the_one_before
  BEFORE INSERT OR UPDATE OF revision, amends_id, system_id ON qualification.qualification
  FOR EACH ROW EXECUTE FUNCTION qualification.revision_corrects_the_one_before();
