"""Builds the AI card in-process via the vendored ``airo_min`` graph builder.

The qualification service maps its simple answers shape onto the AIRO
qualification contract and hands back the built card. ``airo_min`` (and its
vendored ``airo/*.ttl``) live beside this package and run in this process, so
there is no separate ontology service to reach. A build that stays refused
raises :class:`OntologyServiceError`; the caller decides how to degrade.

``OntologyService`` is the domain object; the module-level functions below are
a thin facade over one shared instance so existing callers and tests keep their
import path (a test swaps ``card.ontology.build_card`` for a fake).
"""

from __future__ import annotations

import logging
from typing import Any, cast

from airo_min.build import build_graph
from airo_min.graph import graph_digest
from airo_min.patch import apply_patch
from airo_min.vair_terms import vocabularies
from airo_min.validate import validate
from airo_min.view import build_view

logger = logging.getLogger(__name__)


class OntologyServiceError(RuntimeError):
    """A built card could not be produced."""


#: Reserved answers key carrying the card's structured blocks: profile text,
#: VAIR tag sets and risk rows collected by the form. Never a prose answer.
BLOCKS_KEY = "__blocks"

#: Reserved answers key carrying the reviewer's per-node corrections, applied by
#: the graph builder on rebuild (`{node_id: {label?, vair?, note?, termNotApplicable?}}`).
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


class OntologyService:
    """The AIRO card engine: maps the form's answers onto the AIRO contract and
    builds the graph in-process (no state beyond the vendored vocabulary)."""

    def map_answers(self, answers: dict) -> list[dict]:
        """Our `{field: value}` answers (fields `q:<group>:<id>`, the reference
        form's naming) onto the AIRO answer entries. The reserved `__blocks`
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

    def split_blocks(self, answers: dict) -> tuple[dict, dict]:
        """Prose answers and structured blocks, split. Old payloads have no blocks."""
        rest = dict(answers or {})
        blocks = rest.pop(BLOCKS_KEY, None)
        return rest, blocks if isinstance(blocks, dict) else {}

    def split_patch(self, answers: dict) -> dict:
        """The reviewer's per-node corrections, or {} (never a prose answer)."""
        patch = (answers or {}).get(PATCH_KEY)
        return patch if isinstance(patch, dict) else {}

    def map_tags(self, tags: object) -> dict[str, list[str]]:
        """Tag sets onto the ontology's VAIR term lists; non-strings are dropped."""
        tags = cast(dict[str, Any], tags) if isinstance(tags, dict) else {}
        out: dict[str, list[str]] = {}
        for src, dst in _TAG_FIELDS:
            values = tags.get(src)
            out[dst] = (
                [t for t in values if isinstance(t, str) and t] if isinstance(values, list) else []
            )
        return out

    def map_risks(self, rows: object) -> list[dict]:
        """Risk rows onto the AIRO contract. Incomplete rows are dropped (the
        builder reads required fields unconditionally); position is the index among
        the rows kept."""
        if not isinstance(rows, list):
            return []
        out: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            row = cast(dict[str, Any], row)
            if any(not row.get(k) for k in _RISK_REQUIRED):
                continue
            clean = {k: row[k] for k in _RISK_REQUIRED}
            for k in _RISK_OPTIONAL:
                if row.get(k) is not None:
                    clean[k] = row[k]
            areas = row.get("impactAreas")
            clean["impactAreas"] = (
                [a for a in areas if isinstance(a, str) and a] if isinstance(areas, list) else []
            )
            clean["position"] = len(out)
            out.append(clean)
        return out

    def _build_once(self, qualification: dict, patch: dict | None) -> dict | None:
        """One in-process build; None when the builder refuses (a bad term)."""
        try:
            graph = build_graph(qualification, None)
            apply_patch(graph, patch)
        except ValueError as exc:
            logger.warning("ontology build refused: %s", exc)
            return None
        return {
            "view": build_view(graph),
            "turtle": graph.serialize(format="turtle"),
            "jsonld": graph.serialize(format="json-ld"),
            "problems": validate(graph),
            "digest": graph_digest(graph),
        }

    def build_card(self, system: dict, questionnaire_id: str, answers: dict) -> dict | None:
        """Build the AI card for these answers, in-process. Never returns None for a
        build it refuses: the retries peel the risks off, then the tags, so the last
        attempt is answers-only; if even that refuses, it raises.

        Structured blocks ride inside `answers[__blocks]` and are mapped onto the
        AIRO contract; reviewer corrections ride in `answers[__patch]` and are
        applied on rebuild.
        """
        prose, blocks = self.split_blocks(answers)
        patch = self.split_patch(answers)
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
            "answers": self.map_answers(prose),
        }
        risks = self.map_risks(blocks.get("risks"))
        tags = self.map_tags(blocks.get("tags"))
        attempts = [
            {"risks": risks, **tags},
            {"risks": [], **tags},
            {"risks": []},
        ]
        for attempt in attempts:
            result = _build_once({**base, **attempt}, patch)
            if result is not None:
                return result
        raise OntologyServiceError("the card could not be built")

    def get_vocabularies(self) -> dict:
        """The VAIR term lists, per AIRO class, from the vendored vocabulary."""
        try:
            return vocabularies()
        except Exception as exc:  # noqa: BLE001 - degrade to free text on any failure
            logger.warning("vocabularies unavailable: %s", exc)
            return {}


#: the shared instance the module-level facade calls
service = OntologyService()


def _build_once(qualification: dict, patch: dict | None) -> dict | None:
    """The single in-process build; the seam the tests patch to force refusals."""
    return service._build_once(qualification, patch)


def map_answers(answers: dict) -> list[dict]:
    return service.map_answers(answers)


def split_blocks(answers: dict) -> tuple[dict, dict]:
    return service.split_blocks(answers)


def split_patch(answers: dict) -> dict:
    return service.split_patch(answers)


def map_tags(tags: object) -> dict[str, list[str]]:
    return service.map_tags(tags)


def map_risks(rows: object) -> list[dict]:
    return service.map_risks(rows)


def build_card(system: dict, questionnaire_id: str, answers: dict) -> dict | None:
    return service.build_card(system, questionnaire_id, answers)


def get_vocabularies() -> dict:
    return service.get_vocabularies()
