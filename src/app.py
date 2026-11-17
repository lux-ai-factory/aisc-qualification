"""
FastAPI entry for the qualification service.

Thin: builds the app and wires routes. The request/response shapes live in
`schemas` and the card-building logic in `card`, so nothing here is business
logic.
"""

from collections.abc import Callable
from typing import cast

from fastapi import FastAPI, HTTPException
from starlette.types import ASGIApp

import ontology
from card import build_response
from default_questionnaire import DEFAULT_QUESTIONNAIRE_ID, load_default_definition
from schemas import BuildRequest, BuildResponse
from service_token import ServiceTokens

app = FastAPI(title="AISC qualification", docs_url="/docs")
# Adapt the typed ASGI class to Starlette's variadic middleware factory.
app.add_middleware(
    cast(Callable[..., ASGIApp], ServiceTokens), names=("BACKEND_TO_QUALIFICATION_TOKEN",)
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/default-questionnaire")
def default_questionnaire() -> dict:
    """The builtin default questionnaire (Annex IV default), owned by the service."""
    return load_default_definition()


@app.get("/api/vocabularies")
def vocabularies() -> dict:
    """The VAIR term lists a reviewer may pick, per AIRO class ({} when the
    ontology service is unavailable, so callers degrade to free text)."""
    return ontology.get_vocabularies()


@app.post("/api/build", response_model=BuildResponse)
def build(req: BuildRequest) -> BuildResponse:
    """Build the AI card for the answers, against the given questionnaire."""
    if not req.questionnaire:
        definition = dict(load_default_definition())
        definition.setdefault("name", definition.get("questionnaireName", ""))
        req = req.model_copy(
            update={
                "questionnaire_id": req.questionnaire_id or DEFAULT_QUESTIONNAIRE_ID,
                "questionnaire": definition,
            }
        )
    try:
        return build_response(req)
    except ontology.OntologyServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
