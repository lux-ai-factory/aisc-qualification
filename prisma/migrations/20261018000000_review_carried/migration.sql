-- A card version takes the review of the card before it (QualificationService.carryFrom), and its
-- history says what came along and what stayed behind:
--   review_carried: subject the card before; after {from_version, carried, left, draft[, failed]}.
ALTER TABLE qualification.card_history DROP CONSTRAINT card_history_kind_check;
ALTER TABLE qualification.card_history ADD CONSTRAINT card_history_kind_check
    CHECK (kind IN ('component_linked', 'component_relinked', 'component_unlinked',
                    'node_corrected', 'corrections_discarded', 'extracted_replaced', 'review_carried'));
