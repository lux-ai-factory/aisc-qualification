"""The risk rows, question 15: one full risk chain per row.

A document lists its risks under a Risks heading, one block per risk, each
field on a labelled line: the labels are the usual words ("Risk:", "Source:",
"Control:") or the form's own questions ("What could go wrong:"). Who and what
is affected are matched to the form's vocabulary, and a word that matches
neither is left for the person to choose rather than guessed.

Only the Risks section is read: "Control:" in the middle of an Annex answer is
prose, not a row.

The form speaks VAIR (2026-09-30): the cause, the result, the control and the
follow-up each have one VAIR term beside their text ("Source term:"), the harm is
a VAIR term alone ("Kind of harm:"), and the areas are VAIR's. A term is matched
by its VAIR id or label (prefill.vair); a word that names none is left open.
"""
from __future__ import annotations

import re

from prefill.headings import COMPONENTS_HEADING
from prefill.vair import match_term

#: The heading that opens the section. Annex IV point 5 is where the risk
#: management system is described, so that heading counts too.
RISKS_HEADING = re.compile(
    r"^\s*#*\s*(?:risks|risk register|risk management(?: system)?|identified risks"
    r"|annex\s+iv\s*\(?5\)?[^\n]*)\s*:?\s*$",
    re.IGNORECASE,
)

#: "Risk 1", "### Risk 2:", "Risk #3": a heading for one block, not a field.
_ROW_HEADING = re.compile(r"^\s*#*\s*risk\s*#?\s*\d+\s*[:.)]?\s*$", re.IGNORECASE)

#: Any other markdown heading ends the section.
_OTHER_HEADING = re.compile(r"^\s*#+\s+\S")

TEXT_FIELDS = ("risk", "source", "vulnerability", "consequence", "control", "followUpControl")

#: Each VAIR select of a row, and the class its terms come from.
TERM_FIELDS: dict[str, str] = {
    "sourceTerm": "RiskSource",
    "consequenceTerm": "Consequence",
    "impactTerm": "Impact",
    "controlTerm": "RiskControl",
    "followUpControlTerm": "RiskControl",
}

#: A row's keys in the order the form lists its columns.
_ROW_ORDER = (*TEXT_FIELDS[:4], "affected", "areas", *TEXT_FIELDS[4:], *TERM_FIELDS)

#: Labels for each field. Matched longest first, so "follow-up control" is
#: never read as "control".
_LABELS: dict[str, tuple[str, ...]] = {
    "risk": ("risk", "what could go wrong", "hazard"),
    "source": ("source", "cause", "risk source", "what causes it"),
    "vulnerability": ("vulnerability", "weakness", "which weakness in the system makes it possible"),
    "consequence": ("consequence", "effect", "impact", "what happens as a result"),
    "affected": ("affected", "who is affected", "affected party", "affected parties"),
    "areas": ("impact areas", "impact area", "areas", "area of impact", "areas of impact", "what is affected"),
    "control": ("control", "mitigation", "measure", "what you do about it"),
    "followUpControl": (
        "follow-up control",
        "follow up control",
        "followup control",
        "follow-up",
        "if that is not enough, what follows",
        "if that is not enough",
    ),
    # the VAIR selects: matched longest first, so "control term" is never read as "control"
    "sourceTerm": ("source term", "cause term", "risk source term"),
    "consequenceTerm": ("consequence term",),
    "impactTerm": ("impact term", "kind of harm", "harm"),
    "controlTerm": ("control term", "measure term"),
    "followUpControlTerm": ("follow-up control term", "follow up control term", "followup control term",
                            "follow-up term"),
}
_BY_LABEL = sorted(
    ((label, field) for field, labels in _LABELS.items() for label in labels),
    key=lambda pair: -len(pair[0]),
)

#: The form's vocabulary (src/data/airo_vocab.json), and the words that name it.
_AFFECTED = (
    ("operator", ("operator", "provider", "deployer", "company", "bank", "organisation", "organization")),
    ("user", ("user", "applicant", "customer", "people", "person", "citizen", "resident", "consumer")),
)
#: Our old words for VAIR's areas, so a document written for the earlier form still reads.
_AREA_WORDS = {"fundamental rights": "Right", "rights": "Right", "non-discrimination": "RightToNondiscrimination"}


def _labelled(line: str) -> tuple[str, str] | None:
    """(field, value) for a line that starts with one of the labels."""
    body = re.sub(r"^\s*(?:[-*•]\s*)?", "", line)
    lowered = body.lower()
    for label, field in _BY_LABEL:
        if lowered.startswith(label):
            rest = body[len(label):]
            # a colon, or a dash with space around it: "Control-room staff"
            # is prose that starts with a label's word
            separator = re.match(r"^\s*:\s*|^\s+[–-]\s+", rest)
            if separator:
                return field, rest[separator.end():].strip()
    return None


def _subject(value: str) -> str:
    """The AISubject id `value` names in full by id or label, plural or not; "" when it names none."""
    said = value.strip().rstrip(".")
    return match_term("AISubject", said) or match_term("AISubject", said[:-1] if said.lower().endswith("s") else said)


def _affected(value: str) -> str:
    # VAIR's group first, and only for the whole value: "job applicants" is a JobApplicant, where the
    # word list below would read "applicants" as our plain "user".
    subject = _subject(value)
    if subject:
        return subject
    words = value.lower()
    found = [vid for vid, names in _AFFECTED if any(n in words for n in names)]
    # Both named is not one answer, and a guess would be one nobody gave.
    return found[0] if len(found) == 1 else ""


def _areas(value: str) -> list[str]:
    """VAIR's areas, in the order the document names them. The value is a list ("Right, Safety");
    each item is a VAIR id or label, or one of our old words for one."""
    found: list[str] = []
    for item in re.split(r"\s*(?:,|;|\band\b)\s*", value):
        item = item.strip().rstrip(".")
        term = match_term("AreaOfImpact", item) or _AREA_WORDS.get(item.lower(), "")
        if term and term not in found:
            found.append(term)
    return found


def _empty_row() -> dict[str, list[str] | str]:
    return {key: [] if key == "areas" else "" for key in _ROW_ORDER}


def _finish(raw: dict[str, list[str]]) -> dict | None:
    row = _empty_row()
    for field, parts in raw.items():
        value = re.sub(r"\s+", " ", " ".join(parts)).strip()
        if field == "affected":
            row["affected"] = _affected(value)
        elif field == "areas":
            row["areas"] = _areas(value)
        elif field in TERM_FIELDS:
            row[field] = match_term(TERM_FIELDS[field], value)
        else:
            row[field] = value
    said_something = any(row[f] for f in TEXT_FIELDS) or row["affected"] or row["areas"]
    return row if said_something else None


def risks_from_text(text: str) -> list[dict]:
    """The rows under the Risks heading, in the order they are written."""
    rows: list[dict] = []
    inside = False
    raw: dict[str, list[str]] = {}
    last: str | None = None

    def close():
        nonlocal raw, last
        finished = _finish(raw) if raw else None
        if finished:
            rows.append(finished)
        raw, last = {}, None

    for line in text.splitlines():
        if RISKS_HEADING.match(line):
            inside = True
            continue
        if not inside:
            continue
        if _ROW_HEADING.match(line):
            close()
            continue
        if _OTHER_HEADING.match(line) or COMPONENTS_HEADING.match(line):
            close()
            inside = False
            continue
        labelled = _labelled(line)
        if labelled:
            field, value = labelled
            if field == "risk" and "risk" in raw:
                close()  # a new "Risk:" line is a new row
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
    return not any(
        (isinstance(v, str) and v.strip()) or (isinstance(v, list) and v) for v in row.values()
    )


def merge_risks(current: list, proposed: list[dict], mode: str) -> tuple[list[dict] | None, bool]:
    """(the rows the form should show, or None to leave them; whether rows
    somebody wrote were kept). The rows are one list, filled or replaced
    together, and a document without risks never empties them."""
    has_rows = any(not _row_blank(r) for r in current or [])
    if not proposed:
        return None, has_rows
    if has_rows and mode == "empty":
        return None, True
    return proposed, False
