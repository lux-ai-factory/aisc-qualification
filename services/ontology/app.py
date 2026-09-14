"""FastAPI service that turns a qualification into a filled AIRO 3.1 graph.

The third sidecar next to services/llm and services/system_card_renderer. The
Next.js app POSTs a qualification (as exported by scripts/export_qualification.mjs),
optionally an agent's prose extraction and a reviewer's patch, and gets back the
view model the card renders plus both serialisations.

Run locally:
    pip install -r requirements.txt
    uvicorn app:app --port 8011 --reload

Port 8011, not 8010: the AISC catalogue-backend already binds 8010 on this host.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from airo_min.build import build_graph
from airo_min.graph import graph_digest
from airo_min.patch import apply_patch
from airo_min.vair_terms import vocabularies as vair_vocabularies
from airo_min.validate import validate
from airo_min.view import build_view

app = FastAPI(title="AIRO Ontology Service", version="0.1.0")


class Qualification(BaseModel):
    """The saved form. Only what the builder reads is required."""

    id: str | None = None
    systemName: str
    systemVersion: str
    company: str
    description: str
    targetUseCase: str
    targetUsers: str
    intendedDeployers: str | None = None
    targetSystems: list[dict[str, Any]] = Field(default_factory=list)
    sectors: list[dict[str, Any]] = Field(default_factory=list)
    marketFormTags: list[str] = Field(default_factory=list)
    localityTags: list[str] = Field(default_factory=list)
    answers: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[dict[str, Any]] = Field(default_factory=list)


class BuildRequest(BaseModel):
    qualification: Qualification
    extracted: dict[str, Any] | None = None
    patch: dict[str, dict[str, Any]] | None = None


class BuildResponse(BaseModel):
    view: dict[str, Any]
    turtle: str
    jsonld: str
    problems: list[str]
    #: The graph's identity: its triples up to blank-node renaming. Two builds
    #: of the same answers share it even though their Turtle differs, which is
    #: what lets a caller tell a new state from a rebuild.
    digest: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/vocabularies")
def vocabularies() -> dict[str, list[str]]:
    """The VAIR terms a reviewer may pick, per AIRO class.

    Derived from the vendored vair.ttl by airo_min.vair_terms, the same module the
    builder validates against, so the UI can never offer a term the builder would
    refuse. Transitive: vair:Police reaches airo:AIOperator through
    vair:EmergencyServiceProvider, and reading direct children only offered 136 of
    331 terms. Terms VAIR declares against its @base rather than its own
    namespace are absent by construction, vair:API being the one with no
    correctly-prefixed twin.
    """
    return vair_vocabularies()


@app.post("/build", response_model=BuildResponse)
def build(request: BuildRequest) -> BuildResponse:
    qualification = request.qualification.model_dump()
    try:
        graph = build_graph(qualification, request.extracted)
        apply_patch(graph, request.patch)
    except ValueError as exc:
        # A bad VAIR term or an unknown picker id is the caller's mistake.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return BuildResponse(
        view=build_view(graph),
        turtle=graph.serialize(format="turtle"),
        jsonld=graph.serialize(format="json-ld"),
        problems=validate(graph),
        digest=graph_digest(graph),
    )
