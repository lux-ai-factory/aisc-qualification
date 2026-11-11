"""Client for the ontology service (the real AIRO graph builder).

The headless service maps its simple answers shape onto the ontology's
Qualification contract and hands back the built card verbatim (the two
BuildResponse shapes share view/turtle/jsonld/problems/digest). Anything goes
wrong — unconfigured, unreachable, refused — and the caller falls back to the
deterministic stub card, so dev and tests never need a running ontology.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

ONTOLOGY_SERVICE_URL = os.environ.get("ONTOLOGY_SERVICE_URL", "")
ONTOLOGY_TOKEN = os.environ.get("HEADLESS_TO_ONTOLOGY_TOKEN", "") or os.environ.get(
    "BACKEND_TO_QUALIFICATION_TOKEN", ""
)


def map_answers(answers: dict) -> list[dict]:
    """Our `{field: value}` answers (fields `q:<group>:<id>`, the reference
    form's naming) onto the ontology's answer entries. The reserved `__blocks`
    and `__patch` keys are structured data, not prose, and are skipped here."""
    mapped = []
    for field, value in (answers or {}).items():
        if field in (BLOCKS_KEY, PATCH_KEY):
            continue
        parts = str(field).split(":")
        if len(parts) == 3 and parts[0] == "q" and all(parts[1:]):
            tool_id, question_id = parts[1], parts[2]
        else:
            tool_id, question_id = "custom", str(field)
        mapped.append({"toolId": tool_id, "questionId": question_id, "answer": value})
    return mapped


#: Reserved answers key carrying the card's structured blocks: profile text,
#: VAIR tag sets and risk rows collected by the form. Never a prose answer.
BLOCKS_KEY = "__blocks"

#: Reserved answers key carrying the reviewer's per-node corrections, applied by
#: the ontology on rebuild (`{node_id: {label?, vair?, note?, termNotApplicable?}}`).
PATCH_KEY = "__patch"

#: Risk fields the ontology reads unconditionally; a row missing one is dropped.
#: The Impact node takes its name from the risk text, so there is no impact field.
_RISK_REQUIRED = ("affected", "risk", "source", "consequence", "control")

#: Optional risk fields forwarded verbatim (VAIR terms, free text, areas).
_RISK_OPTIONAL = (
    "vulnerability",
    "followUpControl",
    "sourceTerm",
    "consequenceTerm",
    "impactTerm",
    "controlTerm",
    "followUpControlTerm",
)

#: `tags` key in blocks -> ontology qualification field.
_TAG_FIELDS = (
    ("targetSystem", "targetSystemTags"),
    ("sector", "sectorTags"),
    ("marketForm", "marketFormTags"),
    ("locality", "localityTags"),
)


def split_blocks(answers: dict) -> tuple[dict, dict]:
    """Prose answers and structured blocks, split. Old payloads have no blocks."""
    rest = dict(answers or {})
    blocks = rest.pop(BLOCKS_KEY, None)
    return rest, blocks if isinstance(blocks, dict) else {}


def split_patch(answers: dict) -> dict:
    """The reviewer's per-node corrections, or {} (never a prose answer)."""
    patch = (answers or {}).get(PATCH_KEY)
    return patch if isinstance(patch, dict) else {}


def map_tags(tags: object) -> dict[str, list[str]]:
    """Tag sets onto the ontology's VAIR term lists; non-strings are dropped."""
    tags = tags if isinstance(tags, dict) else {}
    out: dict[str, list[str]] = {}
    for src, dst in _TAG_FIELDS:
        values = tags.get(src)
        out[dst] = (
            [t for t in values if isinstance(t, str) and t]
            if isinstance(values, list)
            else []
        )
    return out


def map_risks(rows: object) -> list[dict]:
    """Risk rows onto the ontology's contract. Incomplete rows are dropped
    (the ontology reads required fields unconditionally); position is the index
    among the rows kept."""
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if any(not row.get(k) for k in _RISK_REQUIRED):
            continue
        clean = {k: row[k] for k in _RISK_REQUIRED}
        for k in _RISK_OPTIONAL:
            if row.get(k) is not None:
                clean[k] = row[k]
        areas = row.get("impactAreas")
        clean["impactAreas"] = (
            [a for a in areas if isinstance(a, str) and a]
            if isinstance(areas, list)
            else []
        )
        clean["position"] = len(out)
        out.append(clean)
    return out


def _post_qualification(qualification: dict, patch: dict | None) -> dict | None:
    """One ontology build; None when refused or unreachable."""
    body = json.dumps(
        {"qualification": qualification, "extracted": None, "patch": patch or None}
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if ONTOLOGY_TOKEN:
        headers["X-AISC-Service-Token"] = ONTOLOGY_TOKEN
    try:
        req = urllib.request.Request(
            f"{ONTOLOGY_SERVICE_URL}/build", data=body, headers=headers
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            if resp.status != 200:
                logger.warning("ontology service answered %s", resp.status)
                return None
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, dict) else None
    except Exception as exc:  # noqa: BLE001 - the caller falls back to the stub
        logger.warning("ontology service unreachable: %s", exc)
        return None


def build_card(
    system: dict, questionnaire_id: str, answers: dict
) -> dict | None:
    """Ask the ontology service to build the AI card; None when unavailable.

    Structured blocks ride inside `answers[__blocks]` and are mapped onto the
    ontology's qualification contract; reviewer corrections ride in
    `answers[__patch]` and are applied by the ontology on rebuild. The ontology
    rejects a whole build on one bad term, so a refused build is retried with
    less: first without risks, then answers-only. The patch rides along on
    every attempt; stale entries are skipped by the ontology itself.
    """
    if not ONTOLOGY_SERVICE_URL:
        return None
    prose, blocks = split_blocks(answers)
    patch = split_patch(answers)
    profile = blocks.get("profile")
    profile = profile if isinstance(profile, dict) else {}
    base = {
        "systemName": system.get("name") or "AI system",
        "systemVersion": system.get("version") or "",
        "company": system.get("company") or "",
        "description": profile.get("description") or "",
        "targetUseCase": profile.get("targetUseCase") or "",
        "targetUsers": profile.get("targetUsers") or "",
        "intendedDeployers": profile.get("intendedDeployers") or "",
        "answers": map_answers(prose),
    }
    risks = map_risks(blocks.get("risks"))
    tags = map_tags(blocks.get("tags"))
    attempts = [
        {"risks": risks, **tags},
        {"risks": [], **tags},
        {"risks": []},
    ]
    for attempt in attempts:
        result = _post_qualification({**base, **attempt}, patch)
        if result is not None:
            return result
    return None


def get_vocabularies() -> dict:
    """The ontology's VAIR term lists, per AIRO class; {} when unavailable."""
    if not ONTOLOGY_SERVICE_URL:
        return {}
    headers: dict[str, str] = {}
    if ONTOLOGY_TOKEN:
        headers["X-AISC-Service-Token"] = ONTOLOGY_TOKEN
    try:
        req = urllib.request.Request(
            f"{ONTOLOGY_SERVICE_URL}/vocabularies", headers=headers
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                return {}
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - no vocabularies, free text instead
        return {}
