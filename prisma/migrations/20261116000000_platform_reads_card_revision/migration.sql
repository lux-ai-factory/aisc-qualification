-- The platform reads which card version a card is on and its revision, and nothing else of it: a version's
-- card revision is the highest revision of its cards (platform template 0038, project.card_revision_of), so a
-- correction the platform counted but whose card was never stored leaves no gap.
DO $reads$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_rw') THEN
    GRANT SELECT (system_id, revision) ON qualification.qualification TO platform_rw;
  END IF;
END
$reads$;
