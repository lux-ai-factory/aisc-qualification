-- The platform reads how a card describes its version (name, release, provider, description), and nothing
-- else of it: while the platform counted a correction whose card was never stored, the version is described
-- as its highest-revision card describes it (platform template 0039, project.card_described_of), so the
-- corrected name shows nowhere while no card says it.
DO $reads$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_rw') THEN
    GRANT SELECT ("systemName", "systemVersion", company, description) ON qualification.qualification TO platform_rw;
  END IF;
END
$reads$;
