-- A risk row no longer records the provider's measure against it (AIRO RiskControl, through
-- modifiesRiskConcept) or what follows when that is not enough (isFollowedByControl): the card
-- identifies risks, and "control" means only the assessment's controls. The four columns and
-- what they hold go, for every card version. IF EXISTS, so a database without them migrates too.
ALTER TABLE qualification.qualification_risk
  DROP COLUMN IF EXISTS control,
  DROP COLUMN IF EXISTS control_term,
  DROP COLUMN IF EXISTS "followUpControl",
  DROP COLUMN IF EXISTS follow_up_control_term;
