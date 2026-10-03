"""HTTP to the two services this workflow reads and writes: the ontology service
and the app.

The model is not here. It is configured BAF's way in fill/llm.py, because one
app should have one way of naming a model and one place holding its credential.
"""
from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request
from urllib.parse import quote

ONTOLOGY_URL = os.environ.get("ONTOLOGY_SERVICE_URL", "http://localhost:8011")
APP_URL = os.environ.get("APP_URL", "http://localhost:3399")
TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "120"))

#: The token each service this calls expects from it, by the variable holding it.
#: One per edge: the app's is not the ontology service's.
APP_TOKEN_VAR = "QUALIFICATION_AGENTS_TO_WEB_TOKEN"
ONTOLOGY_TOKEN_VAR = "QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN"


def _token_headers(name: str) -> dict[str, str]:
    """X-AISC-Service-Token with the token in `name`, read per call; none if unset."""
    token = os.environ.get(name) or ""
    return {"X-AISC-Service-Token": token} if token else {}


class ServiceError(RuntimeError):
    """A service answered with something unusable, or not at all."""


def _post(url: str, payload: dict, token: str, method: str = "POST", extra: dict | None = None) -> Any:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", **_token_headers(token), **(extra or {})},
    )
    try:
        with request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8") or "null")
    except error.HTTPError as exc:
        raise ServiceError(f"{url} returned HTTP {exc.code}: {exc.read()[:200]!r}")
    except OSError as exc:
        raise ServiceError(f"{url} unreachable: {exc}")


def vocabularies() -> dict[str, list[str]]:
    """The VAIR terms per AIRO class, from the ontology service.

    Asked rather than derived, so the writer can never be offered a term the
    builder would refuse.
    """
    req = request.Request(f"{ONTOLOGY_URL}/vocabularies", headers=_token_headers(ONTOLOGY_TOKEN_VAR))
    try:
        with request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except (error.HTTPError, OSError) as exc:
        raise ServiceError(f"{ONTOLOGY_URL}/vocabularies unreachable: {exc}")


def build(qualification: dict, extracted: dict) -> dict:
    """Build the graph, to find out whether a draft is writable at all."""
    return _post(
        f"{ONTOLOGY_URL}/build",
        {"qualification": qualification, "extracted": extracted},
        ONTOLOGY_TOKEN_VAR,
    )


def _extracted_url(pid: str, qualification_id: str) -> str:
    """Where the app serves a card's extracted document: under its project, because
    the card lives in that project's own database."""
    return (
        f"{APP_URL}/p/{quote(pid, safe='')}/api/qualifications/"
        f"{quote(qualification_id, safe='')}/extracted"
    )


def qualification(pid: str, qualification_id: str) -> dict:
    """The saved form, in the export shape the builder reads."""
    req = request.Request(
        _extracted_url(pid, qualification_id),
        headers=_token_headers(APP_TOKEN_VAR),
    )
    try:
        with request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except (error.HTTPError, OSError) as exc:
        raise ServiceError(f"cannot read qualification {qualification_id}: {exc}")


def publish(pid: str, qualification_id: str, extracted: dict) -> dict:
    """Write the reviewed draft where the card reads it from."""
    from fill import ledger

    # the run's id, the person's request and the model go with the draft: the app records it as the
    # run's card.augmented_by_ai, in the same transaction as the change (ledger phase 5)
    return _post(
        _extracted_url(pid, qualification_id),
        extracted,
        APP_TOKEN_VAR,
        method="PUT",
        extra=ledger.headers(),
    )
