"""How much of Annex IV a card covers, and what it documents beyond it.

Computed once, here, from the form version the card was filled with and its
answers, so the card, the JSON export and the PDF, which all read this one
view, cannot disagree.

`form` is the export's form: {"name", "version", "questions": [{"key", "text",
"citation", "required", "annexPoint", "ownerSet", "ownerSetId", "ownerBuiltin"}]},
in version order. Older callers send "ownerForm" and "ownerFormId" (optional)
instead; both key styles are accepted. Questions are grouped by owner set id
(else owner form id) when they carry one (two sets or forms may share a name),
else by owner name. `answers` are the export's answers ({"toolId", "questionId",
"answer", ...}). Only answers to questions of this version count, and a blank
answer is no answer.

No model and no RDF: the standard library and this package only.
"""
from typing import Any

from .annex_points import ANNEX_POINTS


def _answered(form: dict[str, Any], answers: list[dict[str, Any]]) -> dict[str, str]:
    """key -> answer text, for the form's questions that have a non-blank answer."""
    keys = {q["key"] for q in form.get("questions", [])}
    out: dict[str, str] = {}
    for a in answers:
        key = f"{a['toolId']}:{a['questionId']}"
        text = str(a.get("answer") or "").strip()
        if key in keys and text:
            out[key] = text
    return out


def _owner_name(q: dict[str, Any]) -> Any:
    """The name shown for a question's owner: its question set, else (an older
    caller) its owner form."""
    return q.get("ownerSet", q.get("ownerForm"))


def _owner_key(q: dict[str, Any]) -> tuple[str, str]:
    """What groups a question with its owner's others: the owner set id when
    the export has one, else the owner form id (an older caller), else the
    owner's name."""
    if "ownerSetId" in q:
        return ("id", q["ownerSetId"])
    if "ownerFormId" in q:
        return ("id", q["ownerFormId"])
    return ("name", _owner_name(q))


def _owners_in_order(questions: list[dict[str, Any]]) -> list[tuple[tuple[str, str], str]]:
    """(owner key, owner name shown), in the order of each owner's first question."""
    seen: dict[tuple[str, str], str] = {}
    for q in questions:
        seen.setdefault(_owner_key(q), _owner_name(q))
    return list(seen.items())


def coverage(form: dict[str, Any], answers: list[dict[str, Any]]) -> dict[str, Any]:
    """The Annex IV points answered, out of 14, and per custom owner form how many
    of its questions in this version are answered."""
    questions = form.get("questions", [])
    answered = _answered(form, answers)
    covered_points = {
        q["annexPoint"] for q in questions if q.get("annexPoint") and q["key"] in answered
    }
    points = [
        {"id": p["id"], "citation": p["citation"], "covered": p["id"] in covered_points}
        for p in ANNEX_POINTS
    ]
    covered = sum(1 for p in points if p["covered"])
    # A point left blank is optional when every question of this version asking
    # it is optional: the form never required it.
    optional_blank = sum(
        1
        for p in points
        if not p["covered"]
        and any(q.get("annexPoint") == p["id"] for q in questions)
        and not any(q.get("annexPoint") == p["id"] and q.get("required") for q in questions)
    )

    forms = []
    custom = [q for q in questions if not q.get("ownerBuiltin")]
    for key, name in _owners_in_order(custom):
        mine = [q for q in custom if _owner_key(q) == key]
        forms.append(
            {
                "name": name,
                "answered": sum(1 for q in mine if q["key"] in answered),
                "total": len(mine),
            }
        )

    summary = f"Annex IV coverage: {covered} of {len(ANNEX_POINTS)} points"
    if optional_blank:
        summary += f" ({optional_blank} optional left blank)"
    for f in forms:
        summary += f"; {f['name']}: {f['answered']} of {f['total']} answered"
    summary += "."
    return {
        "annex": {
            "covered": covered,
            "total": len(ANNEX_POINTS),
            "points": points,
            "optionalBlank": optional_blank,
        },
        "forms": forms,
        "summary": summary,
    }


def additional_documentation(
    form: dict[str, Any], answers: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """What the card documents beyond Annex IV: one section per owner form, with
    its answered questions that answer no Annex point, in version order. The
    citation is the form's (the question's), not the one stored with the answer.
    Sections with nothing to list are dropped."""
    questions = form.get("questions", [])
    answered = _answered(form, answers)
    sections = []
    for key, name in _owners_in_order(questions):
        entries = [
            {
                "key": q["key"],
                "question": q["text"],
                "citation": q.get("citation") or "",
                "answer": answered[q["key"]],
            }
            for q in questions
            if _owner_key(q) == key and q.get("annexPoint") is None and q["key"] in answered
        ]
        if entries:
            sections.append({"form": name, "entries": entries})
    return sections
