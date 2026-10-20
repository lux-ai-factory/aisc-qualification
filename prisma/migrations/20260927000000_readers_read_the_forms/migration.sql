-- The readers (the report renderer and the dashboard) read what a card was answered with:
-- the two-level forms tables of 20260925150000_two_level_forms, in this project's own
-- database, next to the card tables the baseline grants them. SELECT only, granted by
-- their owner (as in the baseline); never _prisma_migrations. A role that does not exist
-- in this cluster is skipped.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['report_ro', 'dashboard_ro'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON qualification.question_set, qualification.question_set_version, '
        'qualification.question_set_version_item, qualification.question, qualification.questionnaire, '
        'qualification.questionnaire_version, qualification.questionnaire_version_item TO %I', r);
    END IF;
  END LOOP;
END $$;
