"""A questionnaire as a file: JSON, by reference or self-contained, and reading it back.

A questionnaire is a list of picked questions, each naming the question set
version it is worded by (setId, setVersion) and the question (scope, localId),
plus the blocks it includes. Two kinds of file:

  references      each item names its set version and question only; importing
                  it needs those set versions on the install
  self-contained  each item also carries its wording (text, citation, required,
                  annexPoint, groupLabel), so importing it makes a new question set

The file is json.dumps(doc, ensure_ascii=False, indent=2) plus a newline, with the
keys in a fixed order. read_questionnaire checks a file in a fixed order and
raises QuestionnaireFileError with the first problem found. Text rules only,
standard library only, stores nothing, no model.
"""
from __future__ import annotations

import json
import re
from typing import Any

from prefill.fields import ANNEX_POINT_IDS
from prefill.form_export import ExportedFile, slug

FORMAT = "aisc-questionnaire"
FORMAT_VERSION = 1
BUNDLES = ("references", "self-contained")
CONTENT_TYPE = "application/json; charset=utf-8"
EXTENSION = "json"

#: at most this many items in one questionnaire (the same limit as a form)
MAX_ITEMS = 200
MAX_NAME = 120
MAX_DESCRIPTION = 500
MAX_TEXT = 2000
MAX_CITATION = 200
MAX_GROUP_LABEL = 120

#: the blocks of src/domain/forms/blocks.ts (FORM_BLOCKS), in that order
BLOCKS = (
    "description", "targetUseCase", "targetUsers", "intendedDeployers", "targetSystemTags",
    "sectorTags", "marketFormTags", "localityTags", "risks",
)

#: the database's checks on question.scope and question.local_id
SCOPE = re.compile(r"^[a-z0-9-]+$")
LOCAL_ID = re.compile(r"^[a-z0-9]+$")

REFERENCE_KEYS = ("setId", "setName", "setVersion", "scope", "localId")
WORDING_KEYS = ("text", "citation", "required", "annexPoint", "groupLabel")


class QuestionnaireFileError(Exception):
    """A questionnaire file (or a questionnaire to write) that cannot be used; str() is the detail."""


def collapse(s: str) -> str:
    return " ".join(s.split())


def _positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def check_bundle(bundle: Any) -> None:
    if bundle not in BUNDLES:
        raise QuestionnaireFileError("bundle must be references or self-contained")


def write_questionnaire(q: dict, bundle: str) -> ExportedFile:
    """The file of questionnaire `q` (name, description, version, blocks, items)."""
    check_bundle(bundle)
    items = q.get("items") or []
    if len(items) > MAX_ITEMS:
        raise QuestionnaireFileError(f"a questionnaire has at most {MAX_ITEMS} questions")
    keys = REFERENCE_KEYS + (WORDING_KEYS if bundle == "self-contained" else ())
    if bundle == "self-contained":
        for n, it in enumerate(items, start=1):
            if any(k not in it for k in WORDING_KEYS):
                raise QuestionnaireFileError(
                    f"item {n} has no wording: a self-contained file needs text, citation, required, "
                    "annexPoint and groupLabel"
                )
    doc = {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "bundle": bundle,
        "name": q["name"],
        "description": q.get("description", ""),
        "version": q["version"],
        "blocks": list(q.get("blocks") or []),
        "items": [{k: it[k] for k in keys} for it in items],
    }
    return ExportedFile(
        filename=f"{slug(q['name'])}-v{q['version']}.questionnaire.{EXTENSION}",
        content_type=CONTENT_TYPE,
        content=json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
    )


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _read_item(n: int, it: Any, bundle: str) -> dict:
    if not isinstance(it, dict):
        raise QuestionnaireFileError(f"item {n} has no setId")
    set_id = it.get("setId")
    if not isinstance(set_id, str) or set_id.strip() == "":
        raise QuestionnaireFileError(f"item {n} has no setId")
    if not _positive_int(it.get("setVersion")):
        raise QuestionnaireFileError(f"item {n} has no setVersion")
    scope, local_id = it.get("scope"), it.get("localId")
    if not (isinstance(scope, str) and SCOPE.match(scope) and isinstance(local_id, str) and LOCAL_ID.match(local_id)):
        raise QuestionnaireFileError(f"item {n} has no valid scope and localId")
    set_name = it.get("setName", "")
    out = {
        "setId": set_id.strip(),
        "setName": set_name if isinstance(set_name, str) else "",
        "setVersion": it["setVersion"],
        "scope": scope,
        "localId": local_id,
    }
    return out


def _read_wording(n: int, it: dict) -> dict:
    text = it.get("text")
    if not isinstance(text, str) or not 1 <= len(collapse(text)) <= MAX_TEXT:
        raise QuestionnaireFileError(f"item {n}: text must be 1 to {MAX_TEXT} characters")
    citation = it.get("citation", "")
    if not isinstance(citation, str) or len(citation) > MAX_CITATION:
        raise QuestionnaireFileError(f"item {n}: citation must be at most {MAX_CITATION} characters")
    required = it.get("required")
    if not isinstance(required, bool):
        raise QuestionnaireFileError(f"item {n}: required must be true or false")
    point = it.get("annexPoint")
    if point is not None and point not in ANNEX_POINT_IDS:
        raise QuestionnaireFileError(f"item {n}: annexPoint must be one of the 14 Annex IV points or null")
    label = it.get("groupLabel")
    if label is not None and not (isinstance(label, str) and 1 <= len(label.strip()) and len(label) <= MAX_GROUP_LABEL):
        raise QuestionnaireFileError(
            f"item {n}: groupLabel must be text of at most {MAX_GROUP_LABEL} characters or null"
        )
    return {
        "text": collapse(text),
        "citation": citation,
        "required": required,
        "annexPoint": point,
        "groupLabel": label,
    }


def read_questionnaire(raw: bytes, filename: str) -> dict:
    """The normalised document of a questionnaire file, or QuestionnaireFileError."""
    ext = _extension(filename)
    if ext != EXTENSION:
        raise QuestionnaireFileError(f"{ext} is not a questionnaire file format: {EXTENSION}")
    if len(raw) == 0:
        raise QuestionnaireFileError("the file is empty")
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise QuestionnaireFileError("this file is not JSON") from None
    if not isinstance(doc, dict):
        raise QuestionnaireFileError("a questionnaire file is a JSON object")
    version_of_format = doc.get("formatVersion")
    if (
        doc.get("format") != FORMAT
        or isinstance(version_of_format, bool)
        or not isinstance(version_of_format, int)
        or version_of_format != FORMAT_VERSION
    ):
        raise QuestionnaireFileError(
            f"this is not a questionnaire file: format must be {FORMAT}, formatVersion {FORMAT_VERSION}"
        )
    bundle = doc.get("bundle")
    check_bundle(bundle)

    name = doc.get("name")
    name = collapse(name) if isinstance(name, str) else ""
    if name == "":
        raise QuestionnaireFileError("the questionnaire has no name")
    if len(name) > MAX_NAME:
        raise QuestionnaireFileError(f"the questionnaire name is longer than {MAX_NAME} characters")

    description = doc.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str) or len(description) > MAX_DESCRIPTION:
        raise QuestionnaireFileError(f"the description is longer than {MAX_DESCRIPTION} characters")

    version = doc.get("version")
    if version is not None and not _positive_int(version):
        raise QuestionnaireFileError("version must be a positive whole number")

    blocks = doc.get("blocks", [])
    if not isinstance(blocks, list):
        raise QuestionnaireFileError(f"{blocks} is not a block")
    seen_blocks: set[str] = set()
    for b in blocks:
        if not isinstance(b, str) or b not in BLOCKS:
            raise QuestionnaireFileError(f"{b} is not a block")
        if b in seen_blocks:
            raise QuestionnaireFileError(f"{b} is listed twice")
        seen_blocks.add(b)

    items = doc.get("items", [])
    if not isinstance(items, list):
        items = [items]
    if len(items) > MAX_ITEMS:
        raise QuestionnaireFileError(f"a questionnaire has at most {MAX_ITEMS} questions")
    out_items = []
    seen: set[tuple[str, str]] = set()
    for n, it in enumerate(items, start=1):
        item = _read_item(n, it, bundle)
        key = (item["scope"], item["localId"])
        if key in seen:
            raise QuestionnaireFileError(f"item {n} is in the file twice")
        seen.add(key)
        if bundle == "self-contained":
            item.update(_read_wording(n, it))
        out_items.append(item)

    return {
        "bundle": bundle,
        "name": name,
        "description": description,
        "version": version,
        "blocks": list(blocks),
        "items": out_items,
    }
