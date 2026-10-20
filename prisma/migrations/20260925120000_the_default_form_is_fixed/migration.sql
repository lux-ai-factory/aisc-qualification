-- The default form is always the seeded "Annex IV default" (id annex-iv-default), for every
-- project. Nobody changes it, so the default flag and everything that served it go.
-- Addendum 06, section 3.2. No row of any table is changed here.
DROP INDEX qualification.form_one_default;
ALTER TABLE qualification.form DROP CONSTRAINT form_default_is_listed;
ALTER TABLE qualification.form DROP COLUMN is_default;

-- The only builtin form is the default one, and it is always listed.
ALTER TABLE qualification.form ADD CONSTRAINT form_builtin_is_the_default
  CHECK (origin <> 'builtin' OR (id = 'annex-iv-default' AND listed));

-- Same rule as before, without the default flag in its message.
CREATE OR REPLACE FUNCTION qualification.form_name_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.listed IS DISTINCT FROM OLD.listed THEN
    RAISE EXCEPTION 'form % keeps its name, origin and listing: only its description changes', OLD.id;
  END IF;
  RETURN NEW;
END $$;
