"""AIRO's core schema (documentation section 3.1, Figure 3), held as data.

Subset of airo.ttl 1.0: 22 classes / 20 properties in the figure, minus the user's
simplification of stakeholders to Operator and User:
  - AIProvider and AIDeployer are dropped; isProvidedBy / isDeployedBy range over
    AIOperator (both were already subClassOf AIOperator in AIRO).
  - AISubject and hasAISubject are dropped; affected persons are Users.
Everything here is cross-checked against the vendored airo.ttl by tests/test_schema.py.
"""

AIRO = "https://w3id.org/airo#"

#: Bumped when the subset changes: which classes and properties a graph may use
#: is part of what produced it, and a card kept for the record should say so.
SCHEMA_VERSION = "1.0"

# class -> parent class within the subset (None for roots)
CLASSES: dict[str, str | None] = {
    # AI system and its use
    "AISystem": None,
    "AICapability": None,
    "AITechnique": None,
    "Modality": None,  # the form the system is placed on the market in
    "Purpose": None,
    "Domain": None,
    "LocalityOfUse": None,  # the kind of setting: workplace, school, public space
    "AIComponent": None,
    "Stakeholder": None,
    "AIOperator": "Stakeholder",
    "AIUser": "Stakeholder",
    "AreaOfImpact": None,
    # risk
    "RiskConcept": None,
    "Risk": "RiskConcept",
    "RiskSource": "RiskConcept",
    "Vulnerability": None,
    "Consequence": "RiskConcept",
    "Impact": "Consequence",
    "RiskControl": None,
}

# property -> (domain classes as declared in AIRO and present in the subset, range class)
PROPERTIES: dict[str, tuple[tuple[str, ...], str]] = {
    "hasCapability": (("AISystem", "AIComponent"), "AICapability"),
    "usesTechnique": (("AISystem", "AIComponent"), "AITechnique"),
    "hasModality": ((), "Modality"),
    "hasPurpose": ((), "Purpose"),
    "isAppliedWithinDomain": (("AISystem", "AIComponent"), "Domain"),
    "isUsedWithinLocality": (("AISystem", "AIComponent"), "LocalityOfUse"),
    "hasComponent": ((), "AIComponent"),
    "isProvidedBy": (("AISystem", "AIComponent"), "AIOperator"),
    "isDeployedBy": (("AISystem", "AIComponent"), "AIOperator"),
    "hasAIUser": (("AISystem",), "AIUser"),
    "hasRisk": ((), "Risk"),
    "isRiskSourceFor": (("RiskSource",), "Risk"),
    "exploitsVulnerability": (("RiskSource",), "Vulnerability"),
    "hasConsequence": (("Risk",), "Consequence"),
    "hasImpact": (("Consequence",), "Impact"),
    "hasImpactOnArea": (("Impact",), "AreaOfImpact"),
    "hasImpactOnStakeholder": (("Impact",), "Stakeholder"),
    "modifiesRiskConcept": (("RiskControl",), "RiskConcept"),
    "isFollowedByControl": (("RiskControl",), "RiskControl"),
}

SUBCLASS_EDGES: list[tuple[str, str]] = [
    (child, parent) for child, parent in CLASSES.items() if parent is not None
]


def ancestors(cls: str) -> list[str]:
    """Parents of cls, nearest first. Empty for roots."""
    out: list[str] = []
    parent = CLASSES.get(cls)
    while parent is not None:
        out.append(parent)
        parent = CLASSES.get(parent)
    return out


def is_a(cls: str, target: str) -> bool:
    return cls == target or target in ancestors(cls)
