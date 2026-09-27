-- One project database: the qualification schema of a card store that holds one project only.
--
-- Every project has a database of its own (made by the platform). This baseline is the end
-- state of the pre-isolation history (20260430105826 .. 20260924120000), written out
-- directly, minus the column that named the platform project, its index and its keys: the
-- database is the project now. A card points at its card version in project.system of the
-- same database (made by the platform's template 0006), and only the latest version's card
-- changes. The schema itself comes from template 0007 (owned by the platform, CREATE for
-- this app's role); this file only makes tables, functions, triggers and the reader grants.
-- The two forms migrations follow it unchanged.

-- the card
CREATE TABLE qualification.qualification (
  id                  text NOT NULL,
  "systemName"        text NOT NULL,
  "systemVersion"     text NOT NULL,
  company             text NOT NULL,
  description         text NOT NULL,
  "targetUseCase"     text NOT NULL,
  "targetUsers"       text NOT NULL,
  created_at          timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamptz(3) NOT NULL,
  "systemCard"        text,
  system_card_at      timestamptz(3),
  "systemCardJson"    jsonb,
  "systemCardPdfPath" text,
  "targetSystemTags"  text[] DEFAULT ARRAY[]::text[],
  "sectorTags"        text[] DEFAULT ARRAY[]::text[],
  "marketFormTags"    text[] DEFAULT ARRAY[]::text[],
  "localityTags"      text[] DEFAULT ARRAY[]::text[],
  "intendedDeployers" text,
  "ontologyExtracted" jsonb,
  "ontologyPatch"     jsonb,
  ontology_at         timestamptz(3),
  system_id           uuid NOT NULL,
  CONSTRAINT "Qualification_pkey" PRIMARY KEY (id),
  CONSTRAINT qualification_system_id_fkey
    FOREIGN KEY (system_id) REFERENCES project.system (pid) ON DELETE CASCADE
);
-- one card per version
CREATE UNIQUE INDEX qualification_system_id_key ON qualification.qualification (system_id);

-- its answers, one per sub-item of Annex IV
CREATE TABLE qualification.qualification_answer (
  id                text NOT NULL,
  "qualificationId" text NOT NULL,
  "toolId"          text NOT NULL,
  "questionId"      text NOT NULL,
  answer            text NOT NULL,
  CONSTRAINT "QualificationAnswer_pkey" PRIMARY KEY (id),
  CONSTRAINT "QualificationAnswer_qualificationId_fkey" FOREIGN KEY ("qualificationId")
    REFERENCES qualification.qualification (id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX "QualificationAnswer_qualificationId_toolId_idx"
  ON qualification.qualification_answer ("qualificationId", "toolId");
-- (the forms migration drops this one by this exact name)
CREATE UNIQUE INDEX "QualificationAnswer_qualificationId_questionId_key"
  ON qualification.qualification_answer ("qualificationId", "questionId");

-- its risks (question 15), one full AIRO risk chain per row
CREATE TABLE qualification.qualification_risk (
  id                text NOT NULL,
  "qualificationId" text NOT NULL,
  "position"        integer NOT NULL,
  risk              text NOT NULL,
  source            text NOT NULL,
  vulnerability     text,
  consequence       text NOT NULL,
  affected          text NOT NULL,
  "impactAreas"     text[] DEFAULT ARRAY[]::text[],
  control           text NOT NULL,
  "followUpControl" text,
  CONSTRAINT "QualificationRisk_pkey" PRIMARY KEY (id),
  CONSTRAINT "QualificationRisk_qualificationId_fkey" FOREIGN KEY ("qualificationId")
    REFERENCES qualification.qualification (id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX "QualificationRisk_qualificationId_idx"
  ON qualification.qualification_risk ("qualificationId");

-- the knowledge graph kept for each card
CREATE TABLE qualification.knowledge_graph (
  id                text NOT NULL,
  "qualificationId" text NOT NULL,
  digest            text NOT NULL,
  turtle            text NOT NULL,
  jsonld            text NOT NULL,
  stamp             text[] DEFAULT ARRAY[]::text[],
  nodes             integer NOT NULL,
  triples           integer NOT NULL,
  built_at          timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeGraph_pkey" PRIMARY KEY (id),
  CONSTRAINT "KnowledgeGraph_qualificationId_fkey" FOREIGN KEY ("qualificationId")
    REFERENCES qualification.qualification (id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeGraph_qualificationId_key"
  ON qualification.knowledge_graph ("qualificationId");

-- card_component: the engine components a card links, by AIRO property
-- (step 6 of 20260923210000, unchanged)
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

-- Only the latest card version changes. The versions of this database are the project's,
-- so the latest is the highest number in the table. PL/pgSQL on purpose: its body is
-- checked when it runs, not when it is created.
CREATE FUNCTION qualification.card_is_latest(version_pid uuid) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project.system s
     WHERE s.pid = version_pid
       AND s.number = (SELECT max(o.number) FROM project.system o));
END $$;

-- the card itself (step 4 of 20260923210000, unchanged)
CREATE FUNCTION qualification.qualification_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT qualification.card_is_latest(OLD.system_id) THEN
    RAISE EXCEPTION 'AI card % is of a version that is not the latest: it is kept as it was', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qualification_only_latest_changes BEFORE UPDATE ON qualification.qualification
  FOR EACH ROW EXECUTE FUNCTION qualification.qualification_only_latest_changes();

-- answers: INSERT or UPDATE only, no DELETE trigger, so deleting a version is never blocked
-- (step 5 of 20260923210000, unchanged)
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

-- component links (step 6 of 20260923210000, unchanged)
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

-- The readers (the report renderer and the dashboard) read the card tables, granted by their
-- owner here rather than by a default privilege; never _prisma_migrations. Schema USAGE comes
-- from the platform's template. A role that does not exist in this cluster is skipped.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['report_ro', 'dashboard_ro'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON qualification.qualification, qualification.qualification_answer, '
        'qualification.qualification_risk, qualification.knowledge_graph, qualification.card_component TO %I', r);
    END IF;
  END LOOP;
END $$;
