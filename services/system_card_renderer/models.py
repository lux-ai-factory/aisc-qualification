"""Pydantic schemas for the AI card payload."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TargetSystem(BaseModel):
    category: str
    subcategory: str


class Classification(BaseModel):
    target_systems: List[TargetSystem] = Field(default_factory=list)
    sectors: List[str] = Field(default_factory=list)


class Finding(BaseModel):
    title: str = Field(..., description="The topic area, e.g. Data & data governance")
    summary: str = Field(..., description="One-paragraph synthesis")
    points: List[str] = Field(default_factory=list)


class OntologyNode(BaseModel):
    """One AIRO individual, as services/ontology computes it for the card."""

    id: str
    label: str
    cls: Optional[str] = None
    vair: Optional[str] = None
    fullText: Optional[str] = None
    provenance: str = "form"
    # False when no VAIR term can describe this node: the class has none, or its
    # terms name a population the node is not part of. The card shows the class
    # instead of flagging a gap that cannot be closed.
    termExpected: Optional[bool] = None
    termNotApplicable: Optional[bool] = None
    generatedLabel: Optional[str] = None
    reviewNote: Optional[str] = None
    formTag: Optional[str] = None
    derivedFrom: Optional[str] = None


class OntologyRow(BaseModel):
    property: str
    label: str
    citation: str = ""
    nodes: List[OntologyNode] = Field(default_factory=list)


class OntologyChain(BaseModel):
    risk: OntologyNode
    source: Optional[OntologyNode] = None
    vulnerability: Optional[OntologyNode] = None
    consequence: Optional[OntologyNode] = None
    impact: Optional[OntologyNode] = None
    stakeholder: Optional[OntologyNode] = None
    areas: List[OntologyNode] = Field(default_factory=list)
    control: Optional[OntologyNode] = None
    followUp: Optional[OntologyNode] = None
    citation: str = ""


class OntologyCounts(BaseModel):
    nodes: int = 0
    triples: int = 0
    risks: int = 0
    reviewed: int = 0
    untyped: int = 0


class Ontology(BaseModel):
    """The filled AIRO graph. When present, the card leads with it."""

    system: OntologyNode
    rows: List[OntologyRow] = Field(default_factory=list)
    chains: List[OntologyChain] = Field(default_factory=list)
    counts: OntologyCounts = Field(default_factory=OntologyCounts)


class SystemCard(BaseModel):
    """Machine-readable AI card."""

    system_name: str
    system_version: str
    provider: str
    description: str
    target_use_case: str
    target_users: str
    classification: Classification
    # The prose is optional: the filled AIRO graph IS the card, and the written
    # overview and findings are an extra a person may or may not have generated.
    # The facts above come from the form and are always present.
    overview: str = ""
    findings: List[Finding] = Field(default_factory=list)
    open_issues: List[str] = Field(default_factory=list)
    ontology: Optional[Ontology] = None
    generated_at: Optional[str] = None
    qualification_id: Optional[str] = None
