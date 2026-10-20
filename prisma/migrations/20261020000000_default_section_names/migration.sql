-- The default questionnaire's two section names, in the words the card shows: "General
-- description" and "Development and design". They are the group labels of the builtin set
-- annex-iv v1, the only rows that carry them; KEY_QUESTIONS says the same in memory.
--
-- Set version items are append-only. This relabel of the builtin's own rows is the one
-- exception: the guard is lifted for these two statements and put back in the same implicit
-- transaction, so no other row and no later write can pass. Wording, citations and ids stay.
ALTER TABLE qualification.question_set_version_item
  DISABLE TRIGGER question_set_version_item_is_append_only;

UPDATE qualification.question_set_version_item
   SET group_label = 'General description'
 WHERE set_version_id = 'annex-iv-v1' AND group_label = 'About the system';

UPDATE qualification.question_set_version_item
   SET group_label = 'Development and design'
 WHERE set_version_id = 'annex-iv-v1' AND group_label = 'How the system was built';

ALTER TABLE qualification.question_set_version_item
  ENABLE TRIGGER question_set_version_item_is_append_only;
