"""The Components block: one row per part of the system (targets plan v2).

A document lists its parts under a Components heading, one block per part,
each field on a labelled line, the way it lists its risks:

    Components

    Component 1
    Name: Scoring model
    Type: Decision Tree
    Provider: In-house
    Role: Estimates the probability of default.

The type is one entry of the form's one Type list (2026-09-30, src/data/
componentFields.ts): a VAIR AIComponent term, matched by its id or label, and
ours only for what VAIR has no term for, matched by id or by the words below.
A word that matches none is left for the person to choose. "Kind:" still reads,
for documents written for the earlier form. Only the Components section is
read: "Name:" elsewhere is the system's, not a part's.
"""
from __future__ import annotations

import re

from prefill.headings import COMPONENTS_HEADING
from prefill.risks import RISKS_HEADING
from prefill.vair import match_term

#: "Component 1", "### Component 2:", "Component #3": a heading for one block.
_ROW_HEADING = re.compile(r"^\s*#*\s*component\s*#?\s*\d+\s*[:.)]?\s*$", re.IGNORECASE)
#: Any other markdown heading, or an Annex heading, ends the section.
_OTHER_HEADING = re.compile(r"^\s*#+\s+\S")
_ANNEX_LINE = re.compile(r"^\s*#*\s*annex\s+iv\b", re.IGNORECASE)

#: Our own types, by id, with the words that name each: only the parts VAIR has no AIComponent
#: term for. VAIR's own terms are matched first, by id or label.
OWN_TYPES: dict[str, tuple[str, ...]] = {
    "rule_engine": ("rule engine", "rules engine", "policy-rule engine"),
    "llm": ("llm or foundation model", "llm", "foundation model", "large language model"),
    "training_data": ("training data",),
    "validation_data": ("validation data",),
    "other_data": ("other data", "other data (e.g. a retrieval corpus)", "retrieval corpus"),
    "pipeline": ("data pipeline", "pipeline"),
    "interface": ("interface or service", "interface", "service", "api"),
    "other": ("other",),
}

#: Our old words for a VAIR term, so a document written for the earlier form still reads.
_VAIR_WORDS = {"predictive model": "Model"}

_LABELS: dict[str, tuple[str, ...]] = {
    "name": ("name", "component"),
    "type": ("type", "kind", "vair type"),
    "providerName": ("provider name", "provided by", "vendor"),
    "provider": ("provider",),
    "role": ("role", "what it does", "purpose"),
}
_BY_LABEL = sorted(
    ((label, field) for field, labels in _LABELS.items() for label in labels),
    key=lambda pair: -len(pair[0]),
)
FIELDS = ("key", "name", "role", "type", "provider", "providerName")


def section_lines(lines: list[str]) -> set[int]:
    """The indices of the lines inside the Components section, heading included."""
    inside, taken = False, set()
    for index, line in enumerate(lines):
        if COMPONENTS_HEADING.match(line):
            inside = True
            taken.add(index)
            continue
        if inside and (
            RISKS_HEADING.match(line)
            or _ANNEX_LINE.match(line)
            or (_OTHER_HEADING.match(line) and not _ROW_HEADING.match(line))
        ):
            inside = False
        if inside:
            taken.add(index)
    return taken


def _labelled(line: str) -> tuple[str, str] | None:
    body = re.sub(r"^\s*(?:[-*•]\s*)?", "", line)
    lowered = body.lower()
    for label, field in _BY_LABEL:
        if lowered.startswith(label):
            separator = re.match(r"^\s*:\s*|^\s+[–-]\s+", body[len(label):])
            if separator:
                return field, body[len(label) + separator.end():].strip()
    return None


def _type(value: str) -> str:
    """VAIR has precedence: its term when the words name one, ours only otherwise."""
    said = re.sub(r"\s+", " ", value.strip().lower())
    vair = match_term("AIComponent", said) or _VAIR_WORDS.get(said, "")
    if vair:
        return vair
    if said in OWN_TYPES:
        return said
    for tid, names in OWN_TYPES.items():
        if said in names:
            return tid
    return ""


def _provider(value: str) -> str:
    said = value.lower()
    return "third_party" if re.search(r"third[\s-]*party|external", said) else "in_house"


def _finish(raw: dict[str, list[str]]) -> dict | None:
    text = {f: re.sub(r"\s+", " ", " ".join(parts)).strip() for f, parts in raw.items()}
    if not text.get("name"):
        return None
    return {
        "key": "",
        "name": text["name"],
        "role": text.get("role", ""),
        "type": _type(text.get("type", "")),
        "provider": _provider(text.get("provider", "")),
        "providerName": text.get("providerName", ""),
    }


def components_from_text(text: str) -> list[dict]:
    """The rows under the Components heading, in the order they are written."""
    lines = text.splitlines()
    inside = section_lines(lines)
    rows: list[dict] = []
    raw: dict[str, list[str]] = {}
    last: str | None = None

    def close():
        nonlocal raw, last
        finished = _finish(raw) if raw else None
        if finished:
            rows.append(finished)
        raw, last = {}, None

    for index, line in enumerate(lines):
        if index not in inside or COMPONENTS_HEADING.match(line):
            continue
        if _ROW_HEADING.match(line):
            close()
            continue
        labelled = _labelled(line)
        if labelled:
            field, value = labelled
            if field == "name" and "name" in raw:
                close()  # a new "Name:" line is a new row
            raw.setdefault(field, [])
            if value:
                raw[field].append(value)
            last = field
            continue
        if not line.strip():
            last = None
            continue
        if last is not None:
            raw[last].append(line.strip())
    close()
    return rows


def _row_blank(row) -> bool:
    if not isinstance(row, dict):
        return True
    return not any(isinstance(row.get(f), str) and row[f].strip() for f in ("name", "role", "type", "providerName"))


def merge_components(current: list, proposed: list[dict], mode: str) -> tuple[list[dict] | None, bool]:
    """(the rows the form should show, or None to leave them; whether rows
    somebody wrote were kept). The same rule as the risk rows: one list, filled
    or replaced together, and a document without components never empties it."""
    has_rows = any(not _row_blank(r) for r in current or [])
    if not proposed:
        return None, has_rows
    if has_rows and mode == "empty":
        return None, True
    return proposed, False
