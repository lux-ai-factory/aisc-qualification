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

ONTOLOGY_URL = os.environ.get("ONTOLOGY_SERVICE_URL", "http://localhost:8011")
APP_URL = os.environ.get("APP_URL", "http://localhost:3399")
TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "120"))


class ServiceError(RuntimeError):
    """A service answered with something unusable, or not at all."""


def _post(url: str, payload: dict, method: str = "POST") -> Any:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url, data=body, method=method, headers={"Content-Type": "application/json"}
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
    req = request.Request(f"{ONTOLOGY_URL}/vocabularies")
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
    )


def qualification(qualification_id: str) -> dict:
    """The saved form, in the export shape the builder reads."""
    req = request.Request(
        f"{APP_URL}/api/qualifications/{qualification_id}/extracted"
    )
    try:
        with request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except (error.HTTPError, OSError) as exc:
        raise ServiceError(f"cannot read qualification {qualification_id}: {exc}")


def publish(qualification_id: str, extracted: dict) -> dict:
    """Write the reviewed draft where the card reads it from."""
    return _post(
        f"{APP_URL}/api/qualifications/{qualification_id}/extracted",
        extracted,
        method="PUT",
    )
