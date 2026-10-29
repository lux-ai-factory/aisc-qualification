-- Two-level forms: question sets and questionnaires replace the form tables.
-- Spec: docs/superpowers/two-level-forms-2026-09-25/01-spec.md, sections 3 and 4.
--
-- One implicit transaction: any RAISE EXCEPTION below rolls back the whole file, and the old
-- tables, the old card column and every row stay as they were. Every name is qualified with the
-- schema. Rows are only written with INSERT ... SELECT from the old tables; no row of
-- qualification, qualification_answer, qualification_risk, knowledge_graph or card_component is
-- written. The triggers are created after the data and after the old tables are dropped.

-- 1. capture the counts the final check compares with
CREATE TEMP TABLE tlf_counts ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM qualification.qualification)::bigint AS n_qualification,
  (SELECT count(*) FROM qualification.qualification_answer)::bigint AS n_qualification_answer,
  (SELECT count(*) FROM qualification.qualification_risk)::bigint AS n_qualification_risk,
  (SELECT count(*) FROM qualification.knowledge_graph)::bigint AS n_knowledge_graph,
  (SELECT count(*) FROM qualification.card_component)::bigint AS n_card_component,
  (SELECT count(*) FROM qualification.form)::bigint AS n_form,
  (SELECT count(*) FROM qualification.form_version)::bigint AS n_form_version,
  (SELECT count(*) FROM qualification.form_question)::bigint AS n_form_question,
  (SELECT count(*) FROM qualification.form_version_question)::bigint AS n_form_version_question;

-- 2. precondition P1: the builtin form is exactly as 20260925090000 seeded it (ids, not wording)
DO $$
DECLARE
  ok boolean;
BEGIN
  ok := (SELECT count(*) FROM qualification.form WHERE origin = 'builtin') = 1
    AND (SELECT id FROM qualification.form WHERE origin = 'builtin') = 'annex-iv-default'
    AND (SELECT count(*) FROM qualification.form_version WHERE form_id = 'annex-iv-default') = 1
    AND (SELECT count(*) FROM qualification.form_version
          WHERE form_id = 'annex-iv-default' AND id = 'annex-iv-default-v1' AND number = 1) = 1
    AND (SELECT count(*) FROM qualification.form_version_question
          WHERE form_version_id = 'annex-iv-default-v1') = 14
    AND (SELECT count(*) FROM qualification.form_version_question r
           JOIN qualification.form_question q ON q.id = r.question_id
          WHERE r.form_version_id = 'annex-iv-default-v1'
            AND q.owner_form_id = 'annex-iv-default'
            AND q.id IN ('annex-iv-1a', 'annex-iv-1b', 'annex-iv-1c', 'annex-iv-1de', 'annex-iv-1f',
                         'annex-iv-1gh', 'annex-iv-2a', 'annex-iv-2b', 'annex-iv-2c', 'annex-iv-2d',
                         'annex-iv-2e', 'annex-iv-2f', 'annex-iv-2g', 'annex-iv-2h')) = 14;
  IF ok IS NOT TRUE THEN
    RAISE EXCEPTION 'two-level forms migration: the builtin form annex-iv-default v1 is not as seeded';
  END IF;
END $$;

-- 3. the seven tables
CREATE TABLE qualification.question_set (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  origin      text NOT NULL,
  retired_at  timestamptz(3) NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  text NOT NULL,
  CONSTRAINT question_set_origin_check CHECK (origin IN ('builtin', 'builder', 'import')),
  CONSTRAINT question_set_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT question_set_description_length CHECK (length(description) <= 500),
  CONSTRAINT question_set_created_by_length CHECK (length(btrim(created_by)) BETWEEN 1 AND 200),
  CONSTRAINT question_set_builtin_is_annex_iv
    CHECK (origin <> 'builtin' OR (id = 'annex-iv' AND retired_at IS NULL))
);
CREATE UNIQUE INDEX question_set_active_name_key
  ON qualification.question_set (lower(name)) WHERE retired_at IS NULL;

CREATE TABLE qualification.question_set_version (
  id         text PRIMARY KEY,
  set_id     text NOT NULL,
  number     integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by text NOT NULL,
  CONSTRAINT question_set_version_set_id_fkey FOREIGN KEY (set_id)
    REFERENCES qualification.question_set (id) ON DELETE RESTRICT,
  CONSTRAINT question_set_version_number_check CHECK (number >= 1),
  CONSTRAINT question_set_version_created_by_length CHECK (length(btrim(created_by)) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX question_set_version_set_id_number_key
  ON qualification.question_set_version (set_id, number);

CREATE TABLE qualification.question (
  id         text PRIMARY KEY,
  set_id     text NOT NULL,
  scope      text NOT NULL,
  local_id   text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT question_set_id_fkey FOREIGN KEY (set_id)
    REFERENCES qualification.question_set (id) ON DELETE RESTRICT,
  CONSTRAINT question_scope_check CHECK (scope ~ '^[a-z0-9-]+$'),
  CONSTRAINT question_local_id_check CHECK (local_id ~ '^[a-z0-9]+$')
);
CREATE UNIQUE INDEX question_scope_local_id_key ON qualification.question (scope, local_id);
CREATE INDEX question_set_id_idx ON qualification.question (set_id);

-- THE wording: one row per question per set version.
CREATE TABLE qualification.question_set_version_item (
  set_version_id text NOT NULL,
  question_id    text NOT NULL,
  position       integer NOT NULL,
  text           text NOT NULL,
  citation       text NOT NULL DEFAULT '',
  required       boolean NOT NULL,
  annex_point    text NULL,
  group_label    text NULL,
  CONSTRAINT question_set_version_item_pkey PRIMARY KEY (set_version_id, question_id),
  CONSTRAINT question_set_version_item_set_version_id_fkey FOREIGN KEY (set_version_id)
    REFERENCES qualification.question_set_version (id) ON DELETE RESTRICT,
  CONSTRAINT question_set_version_item_question_id_fkey FOREIGN KEY (question_id)
    REFERENCES qualification.question (id) ON DELETE RESTRICT,
  CONSTRAINT question_set_version_item_position_check CHECK (position >= 0),
  CONSTRAINT question_set_version_item_text_check CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
  CONSTRAINT question_set_version_item_citation_check CHECK (length(citation) <= 200),
  CONSTRAINT question_set_version_item_annex_point_check CHECK (annex_point IS NULL OR annex_point IN
    ('1a','1b','1c','1de','1f','1gh','2a','2b','2c','2d','2e','2f','2g','2h')),
  CONSTRAINT question_set_version_item_group_label_check
    CHECK (group_label IS NULL OR length(btrim(group_label)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX question_set_version_item_set_version_id_position_key
  ON qualification.question_set_version_item (set_version_id, position);
CREATE INDEX question_set_version_item_question_id_idx
  ON qualification.question_set_version_item (question_id);

CREATE TABLE qualification.questionnaire (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  origin      text NOT NULL,
  listed      boolean NOT NULL DEFAULT true,
  retired_at  timestamptz(3) NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  text NOT NULL,
  CONSTRAINT questionnaire_origin_check CHECK (origin IN ('builtin', 'builder', 'import')),
  CONSTRAINT questionnaire_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT questionnaire_description_length CHECK (length(description) <= 500),
  CONSTRAINT questionnaire_created_by_length CHECK (length(btrim(created_by)) BETWEEN 1 AND 200),
  CONSTRAINT questionnaire_builtin_is_the_default
    CHECK (origin <> 'builtin' OR (id = 'annex-iv-default' AND listed AND retired_at IS NULL))
);
CREATE UNIQUE INDEX questionnaire_listed_name_key
  ON qualification.questionnaire (lower(name)) WHERE listed AND retired_at IS NULL;

CREATE TABLE qualification.questionnaire_version (
  id               text PRIMARY KEY,
  questionnaire_id text NOT NULL,
  number           integer NOT NULL,
  blocks           text[] NOT NULL,
  created_at       timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       text NOT NULL,
  CONSTRAINT questionnaire_version_questionnaire_id_fkey FOREIGN KEY (questionnaire_id)
    REFERENCES qualification.questionnaire (id) ON DELETE RESTRICT,
  CONSTRAINT questionnaire_version_number_check CHECK (number >= 1),
  CONSTRAINT questionnaire_version_blocks_check CHECK (blocks <@ ARRAY['description','targetUseCase',
    'targetUsers','intendedDeployers','targetSystemTags','sectorTags','marketFormTags',
    'localityTags','risks']::text[]),
  CONSTRAINT questionnaire_version_created_by_length CHECK (length(btrim(created_by)) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX questionnaire_version_questionnaire_id_number_key
  ON qualification.questionnaire_version (questionnaire_id, number);

CREATE TABLE qualification.questionnaire_version_item (
  questionnaire_version_id text NOT NULL,
  position                 integer NOT NULL,
  set_version_id           text NOT NULL,
  question_id              text NOT NULL,
  CONSTRAINT questionnaire_version_item_pkey PRIMARY KEY (questionnaire_version_id, question_id),
  CONSTRAINT questionnaire_version_item_questionnaire_version_id_fkey FOREIGN KEY (questionnaire_version_id)
    REFERENCES qualification.questionnaire_version (id) ON DELETE RESTRICT,
  -- the composite key: an item is a question AS one set version words it
  CONSTRAINT questionnaire_version_item_set_item_fkey FOREIGN KEY (set_version_id, question_id)
    REFERENCES qualification.question_set_version_item (set_version_id, question_id) ON DELETE RESTRICT,
  CONSTRAINT questionnaire_version_item_position_check CHECK (position >= 0)
);
-- 50 bytes: the name of spec 3.1 is 64, one more than Postgres keeps (plan section 3, conflict 1)
CREATE UNIQUE INDEX questionnaire_version_item_version_id_position_key
  ON qualification.questionnaire_version_item (questionnaire_version_id, position);
CREATE INDEX questionnaire_version_item_set_version_id_question_id_idx
  ON qualification.questionnaire_version_item (set_version_id, question_id);

-- 4. the builtin level, copied from the old rows so the wording is byte for byte what cards showed
INSERT INTO qualification.question_set (id, name, description, origin, retired_at, created_at, created_by)
  SELECT 'annex-iv', 'Annex IV', 'EU AI Act Annex IV points 1 and 2, as 14 questions.', 'builtin', NULL,
         f.created_at, 'system'
    FROM qualification.form f WHERE f.id = 'annex-iv-default';

INSERT INTO qualification.question (id, set_id, scope, local_id, created_at)
  SELECT q.id, 'annex-iv', q.scope, q.local_id, q.created_at
    FROM qualification.form_question q WHERE q.owner_form_id = 'annex-iv-default';

INSERT INTO qualification.question_set_version (id, set_id, number, created_at, created_by)
  SELECT 'annex-iv-v1', 'annex-iv', 1, v.created_at, 'system'
    FROM qualification.form_version v WHERE v.id = 'annex-iv-default-v1';

INSERT INTO qualification.question_set_version_item
    (set_version_id, question_id, position, text, citation, required, annex_point, group_label)
  SELECT 'annex-iv-v1', r.question_id, r.position, r.text, r.citation, r.required, r.annex_point, r.group_label
    FROM qualification.form_version_question r WHERE r.form_version_id = 'annex-iv-default-v1';

INSERT INTO qualification.questionnaire (id, name, description, origin, listed, retired_at, created_at, created_by)
  SELECT 'annex-iv-default', 'Annex IV default', f.description, 'builtin', true, NULL, f.created_at, 'system'
    FROM qualification.form f WHERE f.id = 'annex-iv-default';

INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_at, created_by)
  SELECT 'annex-iv-default-v1', 'annex-iv-default', 1, v.blocks, v.created_at, 'system'
    FROM qualification.form_version v WHERE v.id = 'annex-iv-default-v1';

INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
  SELECT 'annex-iv-default-v1', r.position, 'annex-iv-v1', r.question_id
    FROM qualification.form_version_question r WHERE r.form_version_id = 'annex-iv-default-v1';

-- 5. pass A: each other form that owns questions becomes a set; its versions become set versions
-- (a form version whose own question list equals the one before it shares that set version)
CREATE TEMP TABLE tlf_assigned (form_version_id text PRIMARY KEY, set_version_id text NOT NULL) ON COMMIT DROP;

DO $$
DECLARE
  f record;
  v record;
  own_list jsonb;
  last_list jsonb;
  last_version text;
  next_number integer;
BEGIN
  FOR f IN
    SELECT fo.* FROM qualification.form fo
     WHERE fo.origin <> 'builtin'
       AND EXISTS (SELECT 1 FROM qualification.form_question q WHERE q.owner_form_id = fo.id)
     ORDER BY fo.created_at, fo.id
  LOOP
    INSERT INTO qualification.question_set (id, name, description, origin, retired_at, created_at, created_by)
      VALUES (f.id, f.name, f.description, f.origin, CASE WHEN f.listed THEN NULL ELSE now() END,
              f.created_at, 'unknown');
    INSERT INTO qualification.question (id, set_id, scope, local_id, created_at)
      SELECT q.id, f.id, q.scope, q.local_id, q.created_at
        FROM qualification.form_question q WHERE q.owner_form_id = f.id;

    last_list := NULL;
    last_version := NULL;
    FOR v IN
      SELECT fv.* FROM qualification.form_version fv WHERE fv.form_id = f.id ORDER BY fv.number
    LOOP
      SELECT jsonb_agg(jsonb_build_array(r.question_id, r.text, r.citation, r.required, r.annex_point,
                                         r.group_label) ORDER BY r.position)
        INTO own_list
        FROM qualification.form_version_question r
        JOIN qualification.form_question q ON q.id = r.question_id
       WHERE r.form_version_id = v.id AND q.owner_form_id = f.id;
      CONTINUE WHEN own_list IS NULL;

      IF last_list IS NULL OR own_list IS DISTINCT FROM last_list THEN
        SELECT coalesce(max(sv.number), 0) + 1 INTO next_number
          FROM qualification.question_set_version sv WHERE sv.set_id = f.id;
        last_version := f.id || '-v' || next_number;
        INSERT INTO qualification.question_set_version (id, set_id, number, created_at, created_by)
          VALUES (last_version, f.id, next_number, v.created_at, 'unknown');
        INSERT INTO qualification.question_set_version_item
            (set_version_id, question_id, position, text, citation, required, annex_point, group_label)
          SELECT last_version, r.question_id, (row_number() OVER (ORDER BY r.position))::integer - 1,
                 r.text, r.citation, r.required, r.annex_point, r.group_label
            FROM qualification.form_version_question r
            JOIN qualification.form_question q ON q.id = r.question_id
           WHERE r.form_version_id = v.id AND q.owner_form_id = f.id;
        last_list := own_list;
      END IF;
      INSERT INTO tlf_assigned (form_version_id, set_version_id) VALUES (v.id, last_version);
    END LOOP;
  END LOOP;
END $$;

-- 6. pass B: each other form becomes a questionnaire; its versions keep their ids, so no card row
-- changes; each item is pinned to the set version whose wording it showed
DO $$
DECLARE
  f record;
  v record;
  r record;
  owner_set text;
  pin text;
  top_version text;
  next_number integer;
BEGIN
  FOR f IN
    SELECT fo.* FROM qualification.form fo WHERE fo.origin <> 'builtin' ORDER BY fo.created_at, fo.id
  LOOP
    INSERT INTO qualification.questionnaire (id, name, description, origin, listed, retired_at, created_at, created_by)
      VALUES (f.id, f.name, f.description, f.origin, f.listed, NULL, f.created_at, 'unknown');

    FOR v IN
      SELECT fv.* FROM qualification.form_version fv WHERE fv.form_id = f.id ORDER BY fv.number
    LOOP
      INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_at, created_by)
        VALUES (v.id, f.id, v.number, v.blocks, v.created_at, 'unknown');

      FOR r IN
        SELECT fvq.question_id, fvq.position, fvq.text, fvq.citation, fvq.required, fvq.annex_point,
               fvq.group_label, q.owner_form_id
          FROM qualification.form_version_question fvq
          JOIN qualification.form_question q ON q.id = fvq.question_id
         WHERE fvq.form_version_id = v.id
         ORDER BY fvq.position
      LOOP
        owner_set := CASE WHEN r.owner_form_id = 'annex-iv-default' THEN 'annex-iv' ELSE r.owner_form_id END;

        IF r.owner_form_id = f.id THEN
          SELECT a.set_version_id INTO pin FROM tlf_assigned a WHERE a.form_version_id = v.id;
        ELSE
          SELECT sv.id INTO pin
            FROM qualification.question_set_version sv
            JOIN qualification.question_set_version_item si ON si.set_version_id = sv.id
           WHERE sv.set_id = owner_set AND si.question_id = r.question_id
             AND si.text = r.text AND si.citation = r.citation AND si.required = r.required
             AND si.annex_point IS NOT DISTINCT FROM r.annex_point
             AND si.group_label IS NOT DISTINCT FROM r.group_label
           ORDER BY sv.number DESC
           LIMIT 1;

          IF pin IS NULL THEN
            IF owner_set = 'annex-iv' THEN
              RAISE EXCEPTION 'two-level forms migration: form version % pins wording of % that no version of Annex IV has',
                v.id, r.question_id;
            END IF;
            SELECT sv.id INTO top_version
              FROM qualification.question_set_version sv WHERE sv.set_id = owner_set
             ORDER BY sv.number DESC LIMIT 1;
            SELECT coalesce(max(sv.number), 0) + 1 INTO next_number
              FROM qualification.question_set_version sv WHERE sv.set_id = owner_set;
            pin := owner_set || '-v' || next_number;
            INSERT INTO qualification.question_set_version (id, set_id, number, created_at, created_by)
              VALUES (pin, owner_set, next_number, v.created_at, 'unknown');
            INSERT INTO qualification.question_set_version_item
                (set_version_id, question_id, position, text, citation, required, annex_point, group_label)
              SELECT pin, si.question_id, si.position,
                     CASE WHEN si.question_id = r.question_id THEN r.text ELSE si.text END,
                     CASE WHEN si.question_id = r.question_id THEN r.citation ELSE si.citation END,
                     CASE WHEN si.question_id = r.question_id THEN r.required ELSE si.required END,
                     CASE WHEN si.question_id = r.question_id THEN r.annex_point ELSE si.annex_point END,
                     CASE WHEN si.question_id = r.question_id THEN r.group_label ELSE si.group_label END
                FROM qualification.question_set_version_item si WHERE si.set_version_id = top_version;
            IF NOT EXISTS (SELECT 1 FROM qualification.question_set_version_item si
                            WHERE si.set_version_id = pin AND si.question_id = r.question_id) THEN
              INSERT INTO qualification.question_set_version_item
                  (set_version_id, question_id, position, text, citation, required, annex_point, group_label)
                SELECT pin, r.question_id, coalesce(max(si.position) + 1, 0), r.text, r.citation, r.required,
                       r.annex_point, r.group_label
                  FROM qualification.question_set_version_item si WHERE si.set_version_id = pin;
            END IF;
            RAISE NOTICE 'two-level forms migration: made question set version % for the wording pinned in form version %',
              pin, v.id;
          END IF;
        END IF;

        INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
          VALUES (v.id, r.position, pin, r.question_id);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- 7. checks C1 to C7: nothing lost, every wording kept
DO $$
DECLARE
  want bigint;
  got bigint;
BEGIN
  -- C1 one set for Annex IV and one per other form that owns questions
  SELECT 1 + count(*) INTO want FROM qualification.form fo
   WHERE fo.origin <> 'builtin'
     AND EXISTS (SELECT 1 FROM qualification.form_question q WHERE q.owner_form_id = fo.id);
  SELECT count(*) INTO got FROM qualification.question_set;
  IF got <> want THEN
    RAISE EXCEPTION 'two-level forms migration: check C1 failed: expected %, found %', want, got;
  END IF;

  -- C2 every question kept, with its identity and the right set
  SELECT count(*) INTO want FROM qualification.form_question;
  SELECT count(*) INTO got FROM qualification.question;
  IF got <> want THEN
    RAISE EXCEPTION 'two-level forms migration: check C2 failed: expected %, found %', want, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.form_question o
   WHERE NOT EXISTS (
     SELECT 1 FROM qualification.question q
      WHERE q.id = o.id AND q.scope = o.scope AND q.local_id = o.local_id
        AND q.set_id = CASE WHEN o.owner_form_id = 'annex-iv-default' THEN 'annex-iv' ELSE o.owner_form_id END);
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C2 failed: expected %, found %', 0, got;
  END IF;

  -- C3 one questionnaire per form
  SELECT count(*) INTO want FROM qualification.form;
  SELECT count(*) INTO got FROM qualification.questionnaire;
  IF got <> want THEN
    RAISE EXCEPTION 'two-level forms migration: check C3 failed: expected %, found %', want, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.form o
   WHERE NOT EXISTS (
     SELECT 1 FROM qualification.questionnaire n
      WHERE n.id = o.id AND n.name = o.name AND n.description = o.description AND n.origin = o.origin
        AND n.listed = o.listed AND n.created_at = o.created_at);
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C3 failed: expected %, found %', 0, got;
  END IF;

  -- C4 one questionnaire version per form version, same id
  SELECT count(*) INTO want FROM qualification.form_version;
  SELECT count(*) INTO got FROM qualification.questionnaire_version;
  IF got <> want THEN
    RAISE EXCEPTION 'two-level forms migration: check C4 failed: expected %, found %', want, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.form_version o
   WHERE NOT EXISTS (
     SELECT 1 FROM qualification.questionnaire_version n
      WHERE n.id = o.id AND n.questionnaire_id = o.form_id AND n.number = o.number
        AND n.blocks = o.blocks AND n.created_at = o.created_at);
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C4 failed: expected %, found %', 0, got;
  END IF;

  -- C5 every old row is an item at the same position showing the same wording
  SELECT count(*) INTO want FROM qualification.form_version_question;
  SELECT count(*) INTO got FROM qualification.questionnaire_version_item;
  IF got <> want THEN
    RAISE EXCEPTION 'two-level forms migration: check C5 failed: expected %, found %', want, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.form_version_question o
   WHERE NOT EXISTS (
     SELECT 1 FROM qualification.questionnaire_version_item i
       JOIN qualification.question_set_version_item s
         ON s.set_version_id = i.set_version_id AND s.question_id = i.question_id
      WHERE i.questionnaire_version_id = o.form_version_id AND i.question_id = o.question_id
        AND i.position = o.position
        AND s.text = o.text AND s.citation = o.citation AND s.required = o.required
        AND s.annex_point IS NOT DISTINCT FROM o.annex_point
        AND s.group_label IS NOT DISTINCT FROM o.group_label);
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C5 failed: expected %, found %', 0, got;
  END IF;

  -- C6 every wording row words a question of its own set
  SELECT count(*) INTO got FROM qualification.question_set_version_item s
    JOIN qualification.question q ON q.id = s.question_id
    JOIN qualification.question_set_version sv ON sv.id = s.set_version_id
   WHERE q.set_id <> sv.set_id;
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C6 failed: expected %, found %', 0, got;
  END IF;

  -- C7 the builtin level: 14 wording rows, 14 items, all pinned to annex-iv-v1
  SELECT count(*) INTO got FROM qualification.question_set_version_item WHERE set_version_id = 'annex-iv-v1';
  IF got <> 14 THEN
    RAISE EXCEPTION 'two-level forms migration: check C7 failed: expected %, found %', 14, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.questionnaire_version_item
   WHERE questionnaire_version_id = 'annex-iv-default-v1';
  IF got <> 14 THEN
    RAISE EXCEPTION 'two-level forms migration: check C7 failed: expected %, found %', 14, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.questionnaire_version_item
   WHERE questionnaire_version_id = 'annex-iv-default-v1' AND set_version_id <> 'annex-iv-v1';
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C7 failed: expected %, found %', 0, got;
  END IF;
END $$;

-- 8. the card column: renamed, no row written, so no card trigger fires
ALTER TABLE qualification.qualification DROP CONSTRAINT qualification_form_version_id_fkey;
ALTER TABLE qualification.qualification RENAME COLUMN form_version_id TO questionnaire_version_id;
ALTER INDEX qualification.qualification_form_version_id_idx RENAME TO qualification_questionnaire_version_id_idx;
ALTER TABLE qualification.qualification ADD CONSTRAINT qualification_questionnaire_version_id_fkey
  FOREIGN KEY (questionnaire_version_id) REFERENCES qualification.questionnaire_version (id) ON DELETE RESTRICT;

-- 9. the old tables (their triggers, checks and indexes go with them), then their functions
DROP TABLE qualification.form_version_question;
DROP TABLE qualification.form_question;
DROP TABLE qualification.form_version;
DROP TABLE qualification.form;
DROP FUNCTION qualification.form_version_is_append_only();
DROP FUNCTION qualification.form_version_question_is_append_only();
DROP FUNCTION qualification.form_question_identity_is_fixed();
DROP FUNCTION qualification.form_name_is_fixed();
DROP FUNCTION qualification.form_builtin_is_fixed();

-- 10. the rules of spec 3.2, created after the data
CREATE OR REPLACE FUNCTION qualification.question_set_version_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'question set version % is immutable: save a new version instead', OLD.id;
END $$;
CREATE TRIGGER question_set_version_is_append_only BEFORE UPDATE OR DELETE ON qualification.question_set_version
  FOR EACH ROW EXECUTE FUNCTION qualification.question_set_version_is_append_only();

CREATE OR REPLACE FUNCTION qualification.question_set_version_item_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'question set version % is immutable: save a new version instead', OLD.set_version_id;
END $$;
CREATE TRIGGER question_set_version_item_is_append_only
  BEFORE UPDATE OR DELETE ON qualification.question_set_version_item
  FOR EACH ROW EXECUTE FUNCTION qualification.question_set_version_item_is_append_only();

CREATE OR REPLACE FUNCTION qualification.questionnaire_version_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'questionnaire version % is immutable: save a new version instead', OLD.id;
END $$;
CREATE TRIGGER questionnaire_version_is_append_only BEFORE UPDATE OR DELETE ON qualification.questionnaire_version
  FOR EACH ROW EXECUTE FUNCTION qualification.questionnaire_version_is_append_only();

CREATE OR REPLACE FUNCTION qualification.questionnaire_version_item_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'questionnaire version % is immutable: save a new version instead', OLD.questionnaire_version_id;
END $$;
CREATE TRIGGER questionnaire_version_item_is_append_only
  BEFORE UPDATE OR DELETE ON qualification.questionnaire_version_item
  FOR EACH ROW EXECUTE FUNCTION qualification.questionnaire_version_item_is_append_only();

CREATE OR REPLACE FUNCTION qualification.question_identity_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question % cannot be deleted: versions refer to it', OLD.id;
  END IF;
  IF NEW.set_id IS DISTINCT FROM OLD.set_id OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.local_id IS DISTINCT FROM OLD.local_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'question % keeps its identity: set, scope and local id are fixed', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_identity_is_fixed BEFORE UPDATE OR DELETE ON qualification.question
  FOR EACH ROW EXECUTE FUNCTION qualification.question_identity_is_fixed();

CREATE OR REPLACE FUNCTION qualification.question_set_version_item_is_of_its_set() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT q.set_id FROM qualification.question q WHERE q.id = NEW.question_id)
     IS DISTINCT FROM (SELECT v.set_id FROM qualification.question_set_version v WHERE v.id = NEW.set_version_id) THEN
    RAISE EXCEPTION 'question % is not a question of the set of version %', NEW.question_id, NEW.set_version_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_set_version_item_is_of_its_set BEFORE INSERT ON qualification.question_set_version_item
  FOR EACH ROW EXECUTE FUNCTION qualification.question_set_version_item_is_of_its_set();

CREATE OR REPLACE FUNCTION qualification.question_set_row_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question set % cannot be deleted: retire it instead', OLD.id;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR (OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at) THEN
    RAISE EXCEPTION 'question set % keeps its name, origin and author; it can only be retired, once', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_set_row_is_fixed BEFORE UPDATE OR DELETE ON qualification.question_set
  FOR EACH ROW EXECUTE FUNCTION qualification.question_set_row_is_fixed();

CREATE OR REPLACE FUNCTION qualification.questionnaire_row_is_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'questionnaire % cannot be deleted: retire it instead', OLD.id;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.listed IS DISTINCT FROM OLD.listed
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR (OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at) THEN
    RAISE EXCEPTION 'questionnaire % keeps its name, origin, listing and author; it can only be retired, once', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questionnaire_row_is_fixed BEFORE UPDATE OR DELETE ON qualification.questionnaire
  FOR EACH ROW EXECUTE FUNCTION qualification.questionnaire_row_is_fixed();

CREATE OR REPLACE FUNCTION qualification.question_set_version_is_allowed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM qualification.question_set s WHERE s.id = NEW.set_id AND s.origin = 'builtin')
     AND EXISTS (SELECT 1 FROM qualification.question_set_version v WHERE v.set_id = NEW.set_id) THEN
    RAISE EXCEPTION 'question set % is builtin: it has one version, made by a migration', NEW.set_id;
  END IF;
  IF EXISTS (SELECT 1 FROM qualification.question_set s WHERE s.id = NEW.set_id AND s.retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'question set % is retired: it gets no new version', NEW.set_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_set_version_is_allowed BEFORE INSERT ON qualification.question_set_version
  FOR EACH ROW EXECUTE FUNCTION qualification.question_set_version_is_allowed();

CREATE OR REPLACE FUNCTION qualification.questionnaire_version_is_allowed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM qualification.questionnaire s WHERE s.id = NEW.questionnaire_id AND s.origin = 'builtin')
     AND EXISTS (SELECT 1 FROM qualification.questionnaire_version v WHERE v.questionnaire_id = NEW.questionnaire_id) THEN
    RAISE EXCEPTION 'questionnaire % is builtin: it has one version, made by a migration', NEW.questionnaire_id;
  END IF;
  IF EXISTS (SELECT 1 FROM qualification.questionnaire s WHERE s.id = NEW.questionnaire_id AND s.retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'questionnaire % is retired: it gets no new version', NEW.questionnaire_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questionnaire_version_is_allowed BEFORE INSERT ON qualification.questionnaire_version
  FOR EACH ROW EXECUTE FUNCTION qualification.questionnaire_version_is_allowed();

-- 11. final check C8: no history row was added or removed, and the old tables are gone
DO $$
DECLARE
  c record;
  got bigint;
BEGIN
  SELECT * INTO c FROM tlf_counts;
  SELECT count(*) INTO got FROM qualification.qualification;
  IF got <> c.n_qualification THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', c.n_qualification, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.qualification_answer;
  IF got <> c.n_qualification_answer THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', c.n_qualification_answer, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.qualification_risk;
  IF got <> c.n_qualification_risk THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', c.n_qualification_risk, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.knowledge_graph;
  IF got <> c.n_knowledge_graph THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', c.n_knowledge_graph, got;
  END IF;
  SELECT count(*) INTO got FROM qualification.card_component;
  IF got <> c.n_card_component THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', c.n_card_component, got;
  END IF;
  SELECT count(*) INTO got
    FROM unnest(ARRAY['qualification.form', 'qualification.form_version', 'qualification.form_question',
                      'qualification.form_version_question']) AS x
   WHERE to_regclass(x) IS NOT NULL;
  IF got <> 0 THEN
    RAISE EXCEPTION 'two-level forms migration: check C8 failed: expected %, found %', 0, got;
  END IF;
END $$;
