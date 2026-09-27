r"""A form's questions, written to a file: .csv or .md.

The inverse of form_import: a file written here and read back there is the same
form (text and citation collapsed, required, Annex IV point). Text rules only,
standard library only, no model.

  CSV       a UTF-8 BOM, then the header question, citation, required,
            annex_point and one row per question. A text or citation cell
            starting with = + - @, or with any run of ' then one of those,
            gets one leading ' so a spreadsheet does not run it as a formula
            (the importer strips exactly that one ', so the round trip is exact).
  Markdown  a "# <name> (v<version>)" title, a one-line HTML comment, then a
            table with the same four columns; \ is written \\ and | is \|.

The file name is the form name as an ASCII slug plus -v<version>.<format>.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass

FORMATS = ("csv", "md")

MD_COMMENT = (
    "<!-- Exported from the AI System Qualification form library. "
    "Import this file to make a new form with these questions. -->"
)

_FORMULA_FIRST = ("=", "+", "-", "@")
_NOT_SLUG = re.compile(r"[^a-z0-9]+")


@dataclass
class ExportedFile:
    filename: str
    content_type: str
    content: str


def collapse(s: str) -> str:
    return " ".join(s.split())


def slug(name: str) -> str:
    """ASCII, lowercase, dashes between words, at most 60 characters; "form" when nothing is left."""
    decomposed = unicodedata.normalize("NFKD", name)
    plain = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()
    out = _NOT_SLUG.sub("-", plain).strip("-")
    out = out[:60].rstrip("-")
    return out or "form"


def _guard(cell: str) -> str:
    r"""One leading ' before a cell matching ^'*[=+\-@]: a formula, or a run of
    ' before one. Guarding every run (not only one ') makes the importer's
    strip-one rule an exact inverse (addendum R50, finding G1)."""
    if cell.lstrip("'").startswith(_FORMULA_FIRST):
        return "'" + cell
    return cell


def _md_escape(cell: str) -> str:
    return cell.replace("\\", "\\\\").replace("|", "\\|")


def _required(value: bool) -> str:
    return "yes" if value else "no"


def _csv(form: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["question", "citation", "required", "annex_point"])
    for q in form["questions"]:
        writer.writerow(
            [
                _guard(collapse(q["text"])),
                _guard(collapse(q["citation"])),
                _required(q["required"]),
                q["annexPoint"] or "",
            ]
        )
    return "﻿" + buffer.getvalue()


def _markdown(form: dict) -> str:
    lines = [
        f"# {collapse(form['name'])} (v{form['version']})",
        "",
        MD_COMMENT,
        "",
        "| Question | Citation | Required | Annex IV point |",
        "|---|---|---|---|",
    ]
    for q in form["questions"]:
        cells = [
            _md_escape(collapse(q["text"])),
            _md_escape(collapse(q["citation"])),
            _required(q["required"]),
            q["annexPoint"] or "",
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def export_form(form: dict, fmt: str) -> ExportedFile:
    """The file for form ({name, version, questions: [{text, citation, required, annexPoint}]}) in fmt."""
    if fmt == "csv":
        content, content_type = _csv(form), "text/csv; charset=utf-8"
    elif fmt == "md":
        content, content_type = _markdown(form), "text/markdown; charset=utf-8"
    else:
        raise ValueError("format must be csv or md")
    return ExportedFile(f"{slug(form['name'])}-v{form['version']}.{fmt}", content_type, content)
