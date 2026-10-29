-- The form speaks VAIR (2026-09-30, docs/superpowers/vair-form-2026-09-30/01-plan.md). One control
-- per thing: wherever VAIR has a vocabulary for a field the form offers only VAIR's terms, and the
-- term the author chose is kept here, beside the text that names the node. Only nullable columns
-- are added: a card saved before keeps every value it had, and dropping these columns undoes it.
--
-- The four tag columns and "impactAreas" keep their names and now hold VAIR local names
-- (e.g. 'PrivateService', 'Right'); the app validates them against src/data/vair_vocab.json.

-- the system's type (VAIR AISystem) and its purpose (VAIR Purpose), on every form
ALTER TABLE qualification.qualification ADD COLUMN system_type text NULL;
ALTER TABLE qualification.qualification ADD COLUMN purpose text NULL;

-- a component's VAIR AIComponent term; NULL for one of our own types (LLM, data, pipeline, ...)
ALTER TABLE qualification.qualification_component ADD COLUMN vair_type text NULL;

-- the VAIR term of each typeable step of a risk chain; the harm (Impact) has no text of its own
ALTER TABLE qualification.qualification_risk ADD COLUMN source_term text NULL;
ALTER TABLE qualification.qualification_risk ADD COLUMN consequence_term text NULL;
ALTER TABLE qualification.qualification_risk ADD COLUMN impact_term text NULL;
ALTER TABLE qualification.qualification_risk ADD COLUMN control_term text NULL;
ALTER TABLE qualification.qualification_risk ADD COLUMN follow_up_control_term text NULL;
