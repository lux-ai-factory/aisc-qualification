-- Ledger phase 5 (Q3): what a card's later changes would overwrite is kept. The ledger records each
-- change with its digests; this table keeps the values themselves, in the project's own database, so
-- the app can show a card's history and the ledger's digests can be checked against it.
--
-- One row per change, written in the change's own transaction:
--   component_linked / component_relinked / component_unlinked: a link to an engine component
--     (subject: the component's pid; before: the link's snapshot as it was, after: as it is now);
--   node_corrected: a reviewer's correction of one node (subject: the node; before/after: its patch);
--   corrections_discarded: every correction dropped at once (before: the whole patch);
--   extracted_replaced: the extracted draft replaced (before: the previous draft; by: person or agent).
-- Rows are never changed or removed (a card is never deleted; a project's database is dropped whole).
CREATE TABLE qualification.card_history (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    qualification_id text NOT NULL REFERENCES qualification.qualification(id),
    kind             text NOT NULL CHECK (kind IN ('component_linked', 'component_relinked', 'component_unlinked',
                                                   'node_corrected', 'corrections_discarded', 'extracted_replaced')),
    subject          text,
    before           jsonb,
    after            jsonb,
    changed_by       text NOT NULL DEFAULT 'person' CHECK (changed_by IN ('person', 'agent')),
    run_id           uuid,
    at               timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX card_history_by_card ON qualification.card_history (qualification_id, at);

CREATE OR REPLACE FUNCTION qualification.card_history_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'card history row % is immutable', OLD.id;
END $$;
CREATE TRIGGER card_history_is_append_only BEFORE UPDATE OR DELETE ON qualification.card_history
  FOR EACH ROW EXECUTE FUNCTION qualification.card_history_is_append_only();
