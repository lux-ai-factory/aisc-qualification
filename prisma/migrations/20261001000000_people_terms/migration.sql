-- The provider's and the deployer's VAIR operator terms. Optional: VAIR's 17 are public bodies.
ALTER TABLE qualification.qualification ADD COLUMN provider_term text NULL;
ALTER TABLE qualification.qualification ADD COLUMN deployer_term text NULL;
