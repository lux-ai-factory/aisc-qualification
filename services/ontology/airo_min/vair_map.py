"""Reconciliation between the form's own taxonomies and VAIR's controlled terms.

The form offers 23 sectors and 50 capability tags of its own; VAIR offers 11
`Domain` terms (the Annex III areas) and 23 `AICapability` terms. The two sets do
not line up, so this module maps only what maps unambiguously. Anything absent
becomes a label-only node in the graph: better an untyped Domain carrying
"Agriculture" than a false claim that it is an Annex III area.

Deliberately NOT mapped, because the choice is a legal judgment rather than a
technical one and belongs to a reviewer or an agent that can justify it:
  - predictive-analytical-ai:risk-scoring-assessment -> vair:Profiling or
    vair:SocialScoring. Art 5(1)(c) prohibits social scoring, so asserting it
    from a tag would be a compliance claim we are not entitled to make.
  - computer-vision:image-understanding-classification -> vair:BiometricIdentification
    or vair:BiometricCategorisation, which are Annex III 1(a)-(b) triggers and
    depend on whether the subjects are natural persons.
Every mapping below is checked against the vendored vair.ttl by tests/test_vair_map.py.
"""

VAIR = "https://w3id.org/vair#"

# form sector id -> VAIR Domain local name (Annex III areas)
SECTOR_TO_VAIR: dict[str, str] = {
    "education": "Education",
    "employment-labour": "Employment",
    "finance-and-insurance": "PrivateService",  # Annex III 5(b)-(c)
    "health": "PublicService",  # Annex III 5(a) healthcare services
    "public-sector": "PublicService",
    "social-welfare-issues": "PublicService",
    "public-governance": "AdministrationOfDemocraticProcesses",
    "transport": "CriticalInfrastructure",
    "digital-economy": "CriticalInfrastructure",  # critical digital infrastructure
}

# form capability tag "<category>:<sub>" -> VAIR AICapability local name
CAPABILITY_TO_VAIR: dict[str, str] = {
    "natural-language-processing:question-answering": "QuestionAnswering",
    "natural-language-processing:text-generation-summarization": "NaturalLanguageGeneration",
    "natural-language-processing:information-extraction": "NamedEntityRecognition",
    "natural-language-processing:sentence-semantic-similarity": "RelationshipExtraction",
    "knowledge-retrieval:retrieval-augmented-generation-rag": "InformationRetrieval",
    "knowledge-retrieval:semantic-search": "InformationRetrieval",
    "knowledge-retrieval:document-intelligence": "AutomaticSummarisation",
    "audio:speech-audio-recognition": "AudioProcessing",
    "audio:speech-audio-generation": "AudioProcessing",
    "computer-vision:object-detection-segmentation": "ComputerVision",
    "computer-vision:video-understanding-generation": "ComputerVision",
    "computer-vision:image-generation-editing": "ComputerVision",
    "recommendation-personalization:personalization": "Profiling",
    "ai-safety-governance:content-moderation": "BehaviourAnalysis",
}


def vair_sector(sector_id: str) -> str | None:
    """Full VAIR IRI for a form sector, or None when there is no clear Annex III area."""
    term = SECTOR_TO_VAIR.get(sector_id)
    return VAIR + term if term else None


def vair_capability(tag: str) -> str | None:
    """Full VAIR IRI for a form capability tag, or None when unmapped."""
    term = CAPABILITY_TO_VAIR.get(tag)
    return VAIR + term if term else None
