"""What a document says about each field of the form.

Two signals, both deterministic:

* **The Annex.** The form's fourteen questions are the points of EU AI Act
  Annex IV, and a technical documentation file is usually written against the
  same Annex. A heading of "Annex IV(1)(a)", or just "1(a)", names the question;
  what follows it, up to the next heading, is the answer.
* **Labels.** "System name:", "Provider:", "Intended purpose:" and the handful
  of ways people write those.

Neither needs a model. Where one is configured it can propose more (see
`model.py`), but this is what runs everywhere.
"""
from __future__ import annotations

import os
import pathlib
import re

from prefill.risks import RISKS_HEADING

#: The seven metadata fields on the form, and the labels people write for them.
#: Order matters only in that the first label to match wins for a field.
METADATA_LABELS: dict[str, tuple[str, ...]] = {
    "systemName": ("system name", "name of the system", "ai system name", "system", "name"),
    "systemVersion": ("system version", "version", "release"),
    "company": ("provider", "company", "organisation", "organization", "vendor", "supplier"),
    "description": ("description", "system description", "summary", "overview"),
    "targetUseCase": ("intended purpose", "purpose", "use case", "intended use", "target use case"),
    "targetUsers": ("intended users", "users", "target users", "end users"),
    "intendedDeployers": ("deployers", "intended deployers", "customers", "operators"),
}

#: Checked against the shared file, so a field the form has and this does
#: not know how to label is a failure here rather than a silent gap.
METADATA_FIELDS = tuple(METADATA_LABELS)

#: The Annex points the form asks about, and the field each one fills.
#:
#: Shared with the form as a file rather than written twice, the way the
#: ontology service shares airo_vocab.json: the form is TypeScript and this is
#: Python, and a mapping that lived in both would drift. Two of the points are
#: merged on the form, so either letter fills the same field.
_FIELDS_FILE = "prefill_fields.json"


def candidate_paths(module_file: pathlib.Path | None = None) -> list[pathlib.Path]:
    """Where to look for the shared field mapping, best first.

    Beside the package is where the image puts it. The repo layout is a
    fallback for running the tests from a checkout, and it is built only when
    there are enough directories above to build it: in the image there are not,
    and asking for that parent by index took the service down at start.
    """
    here = (module_file or pathlib.Path(__file__)).resolve()
    places = []
    configured = os.environ.get("PREFILL_FIELDS_PATH", "").strip()
    if configured:
        places.append(pathlib.Path(configured))
    places.append(here.parent / _FIELDS_FILE)
    parents = here.parents
    if len(parents) > 3:
        places.append(parents[3] / "src" / "data" / "prefillFields.json")
    return places


def _load_fields() -> tuple[tuple[str, ...], dict[tuple[str, str], str]]:
    import json

    for candidate in candidate_paths():
        if candidate.is_file():
            loaded = json.loads(candidate.read_text())
            annex = {
                (point, letter): field
                for point, letters in loaded["annex"].items()
                for letter, field in letters.items()
            }
            return tuple(loaded["metadata"]), annex
    raise FileNotFoundError(
        f"{_FIELDS_FILE} is not beside this package and no PREFILL_FIELDS_PATH is set; "
        f"looked in {', '.join(str(p) for p in candidate_paths())}"
    )


_METADATA_ORDER, ANNEX_FIELDS = _load_fields()

#: A heading naming an Annex point: "Annex IV(1)(a)", "IV(1)(a)", "1(a)", "1.a",
#: optionally numbered or bulleted. It has to be the whole line: a citation in
#: the middle of a sentence is prose about the Annex, not a section of it.
_ANNEX_HEADING = re.compile(
    r"^\s*(?:[-*•]\s*)?(?:annex\s+)?(?:iv\s*)?\(?([123])\)?\s*[.\)]?\s*\(?([a-h])\)?\s*[:.\)]?\s*$",
    re.IGNORECASE,
)

#: "Label: value", where the label is at the start of the line. Anchored, so
#: "we think the system name: is a detail" is not read as a field.
_LABELLED = re.compile(r"^\s*(?:[-*•]\s*)?([A-Za-z][A-Za-z /'()-]{2,40}?)\s*[:–-]\s*(.*)$")


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t:-–")


def _label_of(line: str) -> tuple[str, str] | None:
    """(label, value) for "Label: value", or for a line that is only a label.

    The second case is how a heading arrives from a Word document: the label is
    its own paragraph and the value is the paragraph under it.
    """
    found = _LABELLED.match(line)
    if found:
        return found.group(1).strip().lower(), found.group(2).strip()
    bare = re.sub(r"^\s*(?:[-*\u2022]\s*)?", "", line).strip().rstrip(":").lower()
    if bare and _field_for_label(bare):
        return bare, ""
    return None


def _field_for_label(label: str) -> str | None:
    for field, labels in METADATA_LABELS.items():
        if label in labels:
            return field
    return None


def metadata_from_text(text: str) -> dict[str, str]:
    """The labelled fields, whether the value is on the line or under it."""
    found: dict[str, str] = {}
    lines = text.splitlines()
    for index, line in enumerate(lines):
        labelled = _label_of(line)
        if not labelled:
            continue
        label, value = labelled
        field = _field_for_label(label)
        if field is None or field in found:
            continue
        if not value:
            # "System name" with the value on the next line, which is how a
            # heading in a Word document arrives.
            value = next((l.strip() for l in lines[index + 1:index + 3] if l.strip()), "")
            if _label_of(value) and _field_for_label((_label_of(value) or ("", ""))[0]):
                value = ""  # the next line is another label, not this one's value
        value = _clean(value)
        if value:
            found[field] = value
    return found


def annex_sections(text: str) -> dict[str, str]:
    """The text under each Annex heading, keyed by the field it fills.

    A section runs to the next heading. Two headings that fill the same field
    (1(d) and 1(e)) are joined, in the order they appear.
    """
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        if RISKS_HEADING.match(line):
            # The risk register is its own section, not the end of 2(h).
            current = None
            continue
        heading = _ANNEX_HEADING.match(line)
        if heading:
            point, letter = heading.group(1), heading.group(2).lower()
            current = ANNEX_FIELDS.get((point, letter))
            continue
        if current is None:
            continue
        if line.strip():
            sections.setdefault(current, []).append(line.strip())
    return {field: _clean(" ".join(lines)) for field, lines in sections.items() if lines}


def proposals_from_text(text: str) -> dict[str, str]:
    """Everything this document proposes, by form field.

    A field with nothing to say is absent rather than empty: proposing nothing
    must never be able to erase what somebody typed.
    """
    found = {**metadata_from_text(text), **annex_sections(text)}
    return {field: value for field, value in found.items() if value}
