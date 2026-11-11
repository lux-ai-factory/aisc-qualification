"""Building the AI card from a questionnaire definition and answers.

A deterministic summary card for now — the backend falls back to it when the
service is absent, and this is the contract the real AIRO build will fill in.
The digest is stable for the same answers, so a caller can tell a re-build from
a change.
"""
from __future__ import annotations

import os

from schemas import BuildRequest, BuildResponse

import ontology

_PREFIXES = '@prefix airo: <https://w3id.org/airo#> .'
# The system's IR node. Deployment-specific (never a hardcoded host): the stack
# sets AISC_SYSTEM_IRI to the site's own identifier; the fallback is a local URN.
_SYSTEM_IRI = os.environ.get("AISC_SYSTEM_IRI", "urn:aisc:project")
_SYSTEM = f"<{_SYSTEM_IRI}> a airo:AISystem ."


def build_response(req: BuildRequest) -> BuildResponse:
    answers = req.answers or {}
    prose, _ = ontology.split_blocks(answers)
    prose = {k: v for k, v in prose.items() if k != ontology.PATCH_KEY}
    digest = _digest(req.questionnaire_id, answers)
    built = ontology.build_card(req.system or {}, req.questionnaire_id, answers)
    if built:
        return BuildResponse(
            view=built.get("view") or {},
            jsonld=built.get("jsonld") or "",
            turtle=built.get("turtle") or "",
            problems=built.get("problems") or [],
            digest=built.get("digest") or digest,
        )
    return BuildResponse(
        view={
            "summary": {
                "label": req.questionnaire.get("name") or "AI card",
                "questionnaire_id": req.questionnaire_id,
            },
            "answers_count": len(prose),
        },
        jsonld=f'{{"@context":{{"airo":"https://w3id.org/airo#"}},'
               f'"digest":"{digest}"}}',
        turtle=f"{_PREFIXES}\n{_SYSTEM}",
        problems=[],
        digest=digest,
    )


def _digest(questionnaire_id: str, answers: dict) -> str:
    return str(abs(hash((questionnaire_id, str(sorted(answers.items()))))))
