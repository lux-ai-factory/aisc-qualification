"""Pre-fill a qualification from a document.

One endpoint. It reads the file, proposes values for the form's fields, applies
the merge the caller asked for, and hands back the result. It stores nothing
and decides nothing: the person amends the answers and saves the form.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from prefill.documents import DocumentUnreadable, read_document
from prefill.fields import (
    ANNEX_POINT_IDS,
    annex_sections,
    metadata_from_text,
    proposals_for_questions,
    proposals_from_text,
)
from prefill.form_export import export_form
from prefill.form_import import MAX_QUESTIONS, parse_form_file
from prefill.merge import UnknownMode, merge
from prefill.questionnaire_file import QuestionnaireFileError, read_questionnaire, write_questionnaire
from prefill.risks import merge_risks, risks_from_text
from service_token import ServiceTokens

app = FastAPI(title="AISC qualification prefill", docs_url="/docs")
# Only qualification-web calls this, with its own token.
app.add_middleware(ServiceTokens, names=("QUALIFICATION_WEB_TO_PREFILL_TOKEN",))

#: A document a person can hand over, not a data set. Large enough for a
#: technical documentation file, small enough not to be a way to fill the disk.
MAX_BYTES = int(os.environ.get("PREFILL_MAX_BYTES", 10 * 1024 * 1024))


def _form_json(name: str, value: str, expected: type, wrong_type: str):
    """A JSON form field, or a 422 that names the field and what was wrong."""
    try:
        parsed = json.loads(value)
        if not isinstance(parsed, expected):
            raise ValueError(wrong_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{name}: {exc}")
    return parsed


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/prefill")
async def prefill(
    file: UploadFile = File(...),
    #: "empty" fills only blank answers, "replace" takes the document's answer
    #: wherever it has one. The careful one is the default: a caller that
    #: forgets to say must not lose somebody's typing.
    mode: str = Form("empty"),
    #: what the form holds right now, as JSON
    current: str = Form("{}"),
    #: the risk rows the form holds now, as a JSON list
    current_risks: str = Form("[]"),
    #: the field names the form has (identity, its blocks, "risks" when it has
    #: the risk block, its question fields), as a JSON list. Absent: the default form.
    fields: str | None = Form(None),
    #: the form's questions, [{field, text, citation, annexPoint}], as a JSON list
    questions: str | None = Form(None),
) -> dict:
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"the file is larger than {MAX_BYTES} bytes")
    # A malformed value is refused, not ignored: ignoring it would quietly turn
    # "fill the empty ones" into "fill all of them".
    answers = _form_json("current", current or "{}", dict, "the form's current answers are not an object")
    rows_now = _form_json("current_risks", current_risks or "[]", list, "the form's current risks are not a list")
    wanted = (
        _form_json("fields", fields, list, "the form's fields are not a list")
        if fields is not None
        else None
    )
    asked = (
        _form_json("questions", questions, list, "the form's questions are not a list")
        if questions is not None
        else None
    )
    if asked is not None and not all(
        isinstance(q, dict) and isinstance(q.get("field"), str) for q in asked
    ):
        raise HTTPException(status_code=422, detail="questions: each question needs a field")

    try:
        text = read_document(raw, file.filename or "")
    except DocumentUnreadable as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if wanted is None and asked is None:
        proposals = proposals_from_text(text)
    else:
        # A form of the install's own: its questions are matched by their
        # wording, and nothing is proposed for a field the form does not have.
        found = {
            **metadata_from_text(text),
            **(proposals_for_questions(text, asked) if asked is not None else annex_sections(text)),
        }
        proposals = {
            field: value
            for field, value in found.items()
            if value and (wanted is None or field in wanted)
        }
    try:
        merged = merge(answers, proposals, mode)
    except UnknownMode as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # The rows are one list, filled or replaced together, and never emptied.
    # A form without the risk block has no rows to fill, so they are not read.
    if wanted is not None and "risks" not in wanted:
        found_risks, risks, risks_kept = [], None, False
    else:
        found_risks = risks_from_text(text)
        risks, risks_kept = merge_risks(rows_now, found_risks, mode)

    return {
        "read": True,
        "source": "document",
        # The reading is deterministic: no model proposed these values.
        "model": None,
        "values": merged.values,
        "filled": merged.filled,
        "kept": merged.kept,
        "proposed": sorted(proposals),
        #: the rows the form should show, or None to leave its rows as they are
        "risks": risks,
        "risksKept": risks_kept,
        #: how many the document has, whether or not they were used
        "risksProposed": len(found_risks),
    }


@app.post("/forms/import")
async def forms_import(file: UploadFile = File(...)) -> dict:
    """The questions in a form file, for the person to review before saving a form.

    Stores nothing and asks no model: the questions are read by text rules
    (prefill/form_import.py) and handed back with what was skipped or changed.
    """
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"the file is larger than {MAX_BYTES} bytes")
    try:
        result = parse_form_file(raw, file.filename or "")
    except DocumentUnreadable as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "format": result.format,
        "found": len(result.questions),
        "questions": [
            {"text": q.text, "citation": q.citation, "required": q.required, "annexPoint": q.annex_point}
            for q in result.questions
        ],
        "warnings": result.warnings,
    }


class ExportQuestion(BaseModel):
    text: str
    citation: str
    required: bool
    annexPoint: Optional[str]


class ExportForm(BaseModel):
    name: str
    version: int = Field(ge=1)
    questions: list[ExportQuestion]


class ExportRequest(BaseModel):
    #: a plain str, not a Literal, so that "pdf" gets this service's own message
    format: str
    form: ExportForm


@app.post("/forms/export")
async def forms_export(req: ExportRequest) -> dict:
    """A form's questions as a CSV or Markdown file, for the person to download.

    Pure: reads no file, writes nothing, asks no model (prefill/form_export.py).
    """
    if req.format not in ("csv", "md"):
        raise HTTPException(status_code=422, detail="format must be csv or md")
    if len(req.form.questions) > MAX_QUESTIONS:
        raise HTTPException(status_code=422, detail=f"a form has at most {MAX_QUESTIONS} questions")
    for n, question in enumerate(req.form.questions, start=1):
        if question.annexPoint is not None and question.annexPoint not in ANNEX_POINT_IDS:
            raise HTTPException(
                status_code=422, detail=f"question {n} names an Annex IV point that does not exist"
            )
    out = export_form(req.form.model_dump(), req.format)
    return {"filename": out.filename, "contentType": out.content_type, "content": out.content}


class QuestionnaireItem(BaseModel):
    setId: str
    setName: str = ""
    setVersion: int = Field(ge=1)
    scope: str
    localId: str
    #: the wording is optional here, so that the handler, not pydantic, names an
    #: item a self-contained file cannot carry; an absent key is missing wording,
    #: a null annexPoint or groupLabel is not
    text: Optional[str] = None
    citation: Optional[str] = None
    required: Optional[bool] = None
    annexPoint: Optional[str] = None
    groupLabel: Optional[str] = None


class QuestionnaireIn(BaseModel):
    name: str
    description: str = ""
    version: int = Field(ge=1)
    blocks: list[str]
    items: list[QuestionnaireItem]


class QuestionnaireExportRequest(BaseModel):
    #: a plain str, not a Literal, so that "all" gets this service's own message
    bundle: str
    questionnaire: QuestionnaireIn


def _given(item: QuestionnaireItem) -> dict:
    """The item's keys as the caller sent them; a null text, citation or required is no wording."""
    out = item.model_dump(exclude_unset=True)
    for key in ("text", "citation", "required"):
        if out.get(key, "") is None:
            del out[key]
    return out


@app.post("/questionnaires/export")
async def questionnaires_export(req: QuestionnaireExportRequest) -> dict:
    """A questionnaire as a JSON file, by reference or self-contained, for the person to download.

    Pure: reads no file, writes nothing, asks no model (prefill/questionnaire_file.py).
    """
    q = req.questionnaire
    try:
        out = write_questionnaire(
            {
                "name": q.name,
                "description": q.description,
                "version": q.version,
                "blocks": q.blocks,
                "items": [_given(it) for it in q.items],
            },
            req.bundle,
        )
    except QuestionnaireFileError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"filename": out.filename, "contentType": out.content_type, "content": out.content}


@app.post("/questionnaires/import")
async def questionnaires_import(file: UploadFile = File(...)) -> dict:
    """The normalised document of a questionnaire file, for the app to resolve or import.

    Stores nothing and asks no model: the file is checked by text rules
    (prefill/questionnaire_file.py).
    """
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"the file is larger than {MAX_BYTES} bytes")
    try:
        return read_questionnaire(raw, file.filename or "")
    except QuestionnaireFileError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
