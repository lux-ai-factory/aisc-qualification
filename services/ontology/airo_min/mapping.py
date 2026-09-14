"""Which form element feeds which AIRO property. This is the contract a filler works
from, and the test on it is the proof that the form can fill the whole minimal schema.

`field` is the FormData name used by the qualification form. `risk:*:<name>` stands for
that field in every risk row (`risk:0:risk`, `risk:1:risk`, ...).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class FieldMapping:
    field: str  # form field name
    reference: str  # EU AI Act provision the element comes from
    property: str  # AIRO property the value populates
    subject: str  # AIRO class on the subject side of the triple
    target: str  # AIRO class the value becomes


FORM_MAPPING: list[FieldMapping] = [
    # ── AI system and its use ────────────────────────────────────────────────
    FieldMapping("targetSystemTags", "Art 3(1); Annex IV 2(b)", "hasCapability", "AISystem", "AICapability"),
    FieldMapping("q:annex-2:2a", "Annex IV 2(a)", "usesTechnique", "AISystem", "AITechnique"),
    FieldMapping("marketFormTags", "Annex IV 1(d); Art 6(1)", "hasModality", "AISystem", "Modality"),
    FieldMapping("targetUseCase", "Art 3(12); Annex IV 1(a)", "hasPurpose", "AISystem", "Purpose"),
    FieldMapping("sectorTags", "Annex III; Annex IV 1(a)", "isAppliedWithinDomain", "AISystem", "Domain"),
    FieldMapping("localityTags", "Art 3(44); Art 5(1)(f)", "isUsedWithinLocality", "AISystem", "LocalityOfUse"),
    FieldMapping("q:annex-2:2c", "Annex IV 2(c)", "hasComponent", "AISystem", "AIComponent"),
    FieldMapping("company", "Annex IV 1(a); Art 3(3)", "isProvidedBy", "AISystem", "AIOperator"),
    FieldMapping("intendedDeployers", "Art 3(4); Annex IV 1(h)", "isDeployedBy", "AISystem", "AIOperator"),
    FieldMapping("targetUsers", "Annex IV 2(b); Annex IV 1(g)", "hasAIUser", "AISystem", "AIUser"),
    # ── risk block (question 15) ────────────────────────────────────────────
    FieldMapping("risk:*:risk", "Art 9(2)(a); Art 3(2)", "hasRisk", "AISystem", "Risk"),
    FieldMapping("risk:*:source", "Art 9(2)(a)-(b)", "isRiskSourceFor", "RiskSource", "Risk"),
    FieldMapping("risk:*:vulnerability", "Art 15(5)", "exploitsVulnerability", "RiskSource", "Vulnerability"),
    FieldMapping("risk:*:consequence", "Art 9(2)(a); Art 15(1)", "hasConsequence", "Risk", "Consequence"),
    FieldMapping("risk:*:affected", "Annex IV 2(b); Art 9(9)", "hasImpactOnStakeholder", "Impact", "Stakeholder"),
    FieldMapping("risk:*:area", "Art 9(2)(a)", "hasImpactOnArea", "Impact", "AreaOfImpact"),
    FieldMapping("risk:*:area", "Art 9(2)(a)", "hasImpact", "Consequence", "Impact"),
    FieldMapping("risk:*:control", "Art 9(2)(d)", "modifiesRiskConcept", "RiskControl", "Risk"),
    FieldMapping("risk:*:followUpControl", "Art 9(5); Art 14(4)(e)", "isFollowedByControl", "RiskControl", "RiskControl"),
]
