"""Pre-fill a qualification from a document.

One endpoint. It reads the file, proposes values for the form's fields, applies
the merge the caller asked for, and hands back the result. It stores nothing
and decides nothing: the person amends the answers and saves the form.
"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from prefill.documents import DocumentUnreadable, read_document
from prefill.fields import proposals_from_text
from prefill.merge import UnknownMode, merge
from prefill.risks import merge_risks, risks_from_text

app = FastAPI(title="AISC qualification prefill", docs_url="/docs")

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
) -> dict:
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"the file is larger than {MAX_BYTES} bytes")
    # A malformed value is refused, not ignored: ignoring it would quietly turn
    # "fill the empty ones" into "fill all of them".
    answers = _form_json("current", current or "{}", dict, "the form's current answers are not an object")
    rows_now = _form_json("current_risks", current_risks or "[]", list, "the form's current risks are not a list")

    try:
        text = read_document(raw, file.filename or "")
    except DocumentUnreadable as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    proposals = proposals_from_text(text)
    try:
        merged = merge(answers, proposals, mode)
    except UnknownMode as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # The rows are one list, filled or replaced together, and never emptied.
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
