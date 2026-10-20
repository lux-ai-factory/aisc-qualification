-- Forms are data: the 14 Annex IV questions become the seeded form "Annex IV default".
-- Nothing below changes a row of qualification, qualification_answer, qualification_risk,
-- knowledge_graph or card_component. Nothing here touches knowledge_graph or qualification_risk.
--
-- Every name is qualified with the schema, and every function is CREATE OR REPLACE, so the file
-- can be applied again after its objects are dropped (test/db/forms.db.test.ts does that). No
-- BEGIN/COMMIT: Prisma, and that test, wrap it in a transaction.

-- 1. the four tables
CREATE TABLE qualification.form (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  origin      text NOT NULL,
  listed      boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT form_origin_check CHECK (origin IN ('builtin', 'builder', 'import')),
  CONSTRAINT form_default_is_listed CHECK (NOT is_default OR listed),
  CONSTRAINT form_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX form_one_default ON qualification.form ((true)) WHERE is_default;
CREATE UNIQUE INDEX form_listed_name_key ON qualification.form (lower(name)) WHERE listed;

CREATE TABLE qualification.form_version (
  id         text PRIMARY KEY,
  form_id    text NOT NULL,
  number     integer NOT NULL,
  blocks     text[] NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT form_version_form_id_fkey FOREIGN KEY (form_id)
    REFERENCES qualification.form (id) ON DELETE RESTRICT,
  CONSTRAINT form_version_number_check CHECK (number >= 1),
  CONSTRAINT form_version_blocks_check CHECK (blocks <@ ARRAY['description','targetUseCase',
    'targetUsers','intendedDeployers','targetSystemTags','sectorTags','marketFormTags',
    'localityTags','risks']::text[])
);
CREATE UNIQUE INDEX form_version_form_id_number_key ON qualification.form_version (form_id, number);

CREATE TABLE qualification.form_question (
  id             text PRIMARY KEY,
  owner_form_id  text NOT NULL,
  scope          text NOT NULL,
  local_id       text NOT NULL,
  copied_from_id text NULL,
  created_at     timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT form_question_owner_form_id_fkey FOREIGN KEY (owner_form_id)
    REFERENCES qualification.form (id) ON DELETE RESTRICT,
  CONSTRAINT form_question_copied_from_id_fkey FOREIGN KEY (copied_from_id)
    REFERENCES qualification.form_question (id) ON DELETE RESTRICT,
  CONSTRAINT form_question_scope_check CHECK (scope ~ '^[a-z0-9-]+$'),
  CONSTRAINT form_question_local_id_check CHECK (local_id ~ '^[a-z0-9]+$')
);
CREATE UNIQUE INDEX form_question_scope_local_id_key ON qualification.form_question (scope, local_id);

CREATE TABLE qualification.form_version_question (
  form_version_id text NOT NULL,
  question_id     text NOT NULL,
  position        integer NOT NULL,
  text            text NOT NULL,
  citation        text NOT NULL DEFAULT '',
  required        boolean NOT NULL,
  annex_point     text NULL,
  group_label     text NULL,
  CONSTRAINT form_version_question_pkey PRIMARY KEY (form_version_id, question_id),
  CONSTRAINT form_version_question_form_version_id_fkey FOREIGN KEY (form_version_id)
    REFERENCES qualification.form_version (id) ON DELETE RESTRICT,
  CONSTRAINT form_version_question_question_id_fkey FOREIGN KEY (question_id)
    REFERENCES qualification.form_question (id) ON DELETE RESTRICT,
  CONSTRAINT form_version_question_position_check CHECK (position >= 0),
  CONSTRAINT form_version_question_text_check CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
  CONSTRAINT form_version_question_citation_check CHECK (length(citation) <= 200),
  CONSTRAINT form_version_question_annex_point_check CHECK (annex_point IS NULL OR annex_point IN
    ('1a','1b','1c','1de','1f','1gh','2a','2b','2c','2d','2e','2f','2g','2h'))
);
CREATE UNIQUE INDEX form_version_question_form_version_id_position_key
  ON qualification.form_version_question (form_version_id, position);

-- 2. the seed: literal VALUES rows, verbatim from src/data/keyQuestions.ts
-- (test/unit/annexDefaultForm.test.ts parses them and compares them with the constant)
INSERT INTO qualification.form (id, name, description, origin, listed, is_default) VALUES
  ('annex-iv-default', 'Annex IV default', 'EU AI Act Annex IV points 1 and 2, as 14 questions.',
   'builtin', true, true);
INSERT INTO qualification.form_version (id, form_id, number, blocks) VALUES
  ('annex-iv-default-v1', 'annex-iv-default', 1, ARRAY['description','targetUseCase','targetUsers',
   'intendedDeployers','targetSystemTags','sectorTags','marketFormTags','localityTags','risks']::text[]);
INSERT INTO qualification.form_question (id, owner_form_id, scope, local_id) VALUES
  ('annex-iv-1a', 'annex-iv-default', 'annex-1', '1a'),
  ('annex-iv-1b', 'annex-iv-default', 'annex-1', '1b'),
  ('annex-iv-1c', 'annex-iv-default', 'annex-1', '1c'),
  ('annex-iv-1de', 'annex-iv-default', 'annex-1', '1de'),
  ('annex-iv-1f', 'annex-iv-default', 'annex-1', '1f'),
  ('annex-iv-1gh', 'annex-iv-default', 'annex-1', '1gh'),
  ('annex-iv-2a', 'annex-iv-default', 'annex-2', '2a'),
  ('annex-iv-2b', 'annex-iv-default', 'annex-2', '2b'),
  ('annex-iv-2c', 'annex-iv-default', 'annex-2', '2c'),
  ('annex-iv-2d', 'annex-iv-default', 'annex-2', '2d'),
  ('annex-iv-2e', 'annex-iv-default', 'annex-2', '2e'),
  ('annex-iv-2f', 'annex-iv-default', 'annex-2', '2f'),
  ('annex-iv-2g', 'annex-iv-default', 'annex-2', '2g'),
  ('annex-iv-2h', 'annex-iv-default', 'annex-2', '2h');
INSERT INTO qualification.form_version_question
  (form_version_id, question_id, position, text, citation, required, annex_point, group_label) VALUES
  ('annex-iv-default-v1', 'annex-iv-1a', 0,
   'If this version replaces an earlier one, describe what changed and why. If it is the first release, state that.',
   'Annex IV(1)(a)', true, '1a', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-1b', 1,
   'Does the system work together with hardware or software that is not part of it, such as cameras, third-party software, or another AI system? If so, describe how they connect.',
   'Annex IV(1)(b)', false, '1b', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-1c', 2,
   'Which versions of software or firmware does the system require in order to run, and what are your requirements for updates?',
   'Annex IV(1)(c)', true, '1c', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-1de', 3,
   'How is the system supplied to customers: built into a device, as a download, as an online service, or in some other form? And what computer or hardware does it need to run on?',
   'Annex IV(1)(d)-(e)', true, '1de', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-1f', 4,
   'Is the system built into a physical product? If so, describe what that product looks like from the outside, any labels or markings on it, and how the parts are arranged inside. Indicate where the photographs or drawings are held.',
   'Annex IV(1)(f)', false, '1f', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-1gh', 5,
   'What does the system look like to the companies that use it, and what instructions do you provide to them?',
   'Annex IV(1)(g)-(h)', true, '1gh', 'About the system'),
  ('annex-iv-default-v1', 'annex-iv-2a', 6,
   'How was the system built, step by step? Include any pre-trained models or third-party tools you started from, and describe how you used, connected or modified them.',
   'Annex IV(2)(a)', true, '2a', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2b', 7,
   'How does the system work, and why was it built that way? Cover what it does internally to reach a result; the main choices you made and the assumptions behind them, including who the system is intended to be used on; what the system is trying to get right, and which inputs matter most to it; what its output looks like and how good that output is expected to be; and anything you had to trade off to make the system safer, fairer, more accurate, or easier for a person to oversee.',
   'Annex IV(2)(b)', true, '2b', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2c', 8,
   'How do the parts of the system fit together and pass work to each other, and how much computing power did you use to build, train and test it?',
   'Annex IV(2)(c)', true, '2c', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2d', 9,
   'What data was the system trained on? Describe where it came from, how much of it there is, what it covers, how it was selected, how it was labelled, and how it was cleaned.',
   'Annex IV(2)(d)', false, '2d', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2e', 10,
   'How can a person monitor the system, intervene, or stop it? And what does the system show the people using it so they can understand its results and judge how much to rely on them?',
   'Annex IV(2)(e)', true, '2e', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2f', 11,
   'Are there changes to the system or to its performance that you already plan to make, such as retraining on a regular schedule? If so, describe them and how you will keep the system safe and accurate as they happen.',
   'Annex IV(2)(f)', false, '2f', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2g', 12,
   'How was the system tested, and what were the results? Describe the data you tested it on, how you measure whether it is accurate and whether it holds up in difficult conditions, whether you checked that it performs equally well for different groups of people, and where the dated and signed test records are held.',
   'Annex IV(2)(g)', true, '2g', 'How the system was built'),
  ('annex-iv-default-v1', 'annex-iv-2h', 13,
   'What measures are in place to keep the system secure against tampering, misuse and attack?',
   'Annex IV(2)(h)', true, '2h', 'How the system was built');

-- 3. the card records its form version; NULL means annex-iv-default-v1 (no backfill)
ALTER TABLE qualification.qualification
  ADD COLUMN form_version_id text NULL
  CONSTRAINT qualification_form_version_id_fkey REFERENCES qualification.form_version (id) ON DELETE RESTRICT;
CREATE INDEX qualification_form_version_id_idx ON qualification.qualification (form_version_id);

-- 4. answers are keyed by (scope, local id) within a card
DROP INDEX qualification."QualificationAnswer_qualificationId_questionId_key";
CREATE UNIQUE INDEX qualification_answer_qualification_id_tool_id_question_id_key
  ON qualification.qualification_answer ("qualificationId", "toolId", "questionId");

-- 5. immutability, created after the seed
CREATE OR REPLACE FUNCTION qualification.form_version_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'form version % is immutable: save a new version instead', OLD.id;
END $$;
CREATE TRIGGER form_version_is_append_only BEFORE UPDATE OR DELETE ON qualification.form_version
  FOR EACH ROW EXECUTE FUNCTION qualification.form_version_is_append_only();

CREATE OR REPLACE FUNCTION qualification.form_version_question_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'form version % is immutable: save a new version instead', OLD.form_version_id;
END $$;
CREATE TRIGGER form_version_question_is_append_only
  BEFORE UPDATE OR DELETE ON qualification.form_version_question
  FOR EACH ROW EXECUTE FUNCTION qualification.form_version_question_is_append_only();

CREATE OR REPLACE FUNCTION qualification.form_question_identity_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'form question % cannot be deleted: versions refer to it', OLD.id;
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope OR NEW.local_id IS DISTINCT FROM OLD.local_id
     OR NEW.owner_form_id IS DISTINCT FROM OLD.owner_form_id
     OR NEW.copied_from_id IS DISTINCT FROM OLD.copied_from_id THEN
    RAISE EXCEPTION 'form question % keeps its identity: scope, local id, owner and source are fixed', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form_question_identity_is_fixed BEFORE UPDATE OR DELETE ON qualification.form_question
  FOR EACH ROW EXECUTE FUNCTION qualification.form_question_identity_is_fixed();

CREATE OR REPLACE FUNCTION qualification.form_name_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.listed IS DISTINCT FROM OLD.listed THEN
    RAISE EXCEPTION 'form % keeps its name, origin and listing: only its description and default flag change', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form_name_is_fixed BEFORE UPDATE ON qualification.form
  FOR EACH ROW EXECUTE FUNCTION qualification.form_name_is_fixed();

CREATE OR REPLACE FUNCTION qualification.form_builtin_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM qualification.form f WHERE f.id = NEW.form_id AND f.origin = 'builtin')
     AND EXISTS (SELECT 1 FROM qualification.form_version v WHERE v.form_id = NEW.form_id) THEN
    RAISE EXCEPTION 'form % is builtin: it has one version, made by a migration', NEW.form_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form_builtin_is_fixed BEFORE INSERT ON qualification.form_version
  FOR EACH ROW EXECUTE FUNCTION qualification.form_builtin_is_fixed();
