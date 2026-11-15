-- A correction of the AI card names who made it, as the first card of a version is named by the version's
-- created_by: the signed-in person's name, cut to 200 characters as created_by is. Empty on revision 1 and
-- on a correction made before this column existed. Safe on an existing install: one empty column.
ALTER TABLE qualification.qualification ADD COLUMN IF NOT EXISTS amended_by text
  CHECK (amended_by IS NULL OR length(amended_by) <= 200);
