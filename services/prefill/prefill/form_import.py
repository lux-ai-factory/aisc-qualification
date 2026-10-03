r"""A form's questions, read out of a file: .csv, .md or .docx.

Text rules, no model. The person sees every question found, edits or removes
them, and only then saves a form; nothing here is stored.

  CSV       one question per row. A header is recognised by its first cell
            (question, questions, text, question text); its columns are then
            matched by name. Without one: question, citation, required.
  Markdown  one question per line, list markers and bold wrappers removed; a
            trailing [...] is the citation. Headings, code fences, rules and
            HTML comments are skipped. A table reads like a CSV.
  Word      one question per paragraph, with the same citation rule; headings,
            the title and the subtitle are skipped. Tables read like a CSV.

A table header (CSV, Markdown or Word) may name an Annex IV point column
(annex_point, annex point, annex iv point, annex); its value is one of the 14
point ids, else it is left blank with a warning. In a CSV, a leading ' that the
exporter put before = + - @ is removed; in a Markdown table, \\ is \ and \| is |.

Then the limits: text and citation collapsed, a question over 2000 characters
skipped, a citation over 200 cut, duplicates dropped, and more than 200
questions refused. Each of those says so in a warning, with its line.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field

from prefill.documents import DocumentUnreadable, _decode, check_docx_expansion
from prefill.fields import ANNEX_POINT_IDS

MAX_QUESTIONS = 200
MAX_TEXT = 2000
MAX_CITATION = 200

FORMATS = {"csv": "csv", "md": "md", "markdown": "md", "docx": "docx"}

_QUESTION_HEADERS = {"question", "questions", "text", "question text"}
_CITATION_HEADERS = {"citation", "reference", "source", "clause"}
_REQUIRED_HEADERS = {"required", "mandatory"}
_ANNEX_HEADERS = {"annex_point", "annex point", "annex iv point", "annex"}
_REQUIRED_VALUES = {"yes", "y", "true", "1", "required"}


@dataclass
class ImportedQuestion:
    text: str
    citation: str
    required: bool
    annex_point: str | None = None


@dataclass
class FormImport:
    format: str
    questions: list[ImportedQuestion] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


#: (text, citation, required, annex_raw, line) before the limits are applied;
#: annex_raw is None when the row has no Annex column, else the raw cell text
Candidate = tuple[str, str, bool, "str | None", int]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _cell(row: list[str], i: int | None) -> str:
    return row[i] if i is not None and i < len(row) else ""


_FORMULA_FIRST = ("=", "+", "-", "@")


def _unguarded(cell: str) -> str:
    r"""The exact inverse of the exporter's formula guard: a cell matching
    ^'+[=+\-@] loses exactly one leading '."""
    if cell.startswith("'") and cell.lstrip("'").startswith(_FORMULA_FIRST):
        return cell[1:]
    return cell


def _table_rows(rows: list[tuple[list[str], int]], *, unguard: bool = False) -> list[Candidate]:
    """Rows of cells (with their line) read with the CSV header rules.

    unguard (CSV only) removes the exporter's formula guard from the question
    and citation cells.
    """
    rows = [(cells, line) for cells, line in rows if any(c.strip() for c in cells)]
    if not rows:
        return []
    first = [c.strip().lower() for c in rows[0][0]]
    if first and first[0] in _QUESTION_HEADERS:
        def column(names: set[str]) -> int | None:
            return next((i for i, name in enumerate(first) if name in names), None)

        q_col = column(_QUESTION_HEADERS)
        c_col = column(_CITATION_HEADERS)
        r_col = column(_REQUIRED_HEADERS)
        a_col = column(_ANNEX_HEADERS)
        body = rows[1:]
    else:
        q_col, c_col, r_col = 0, 1, 2
        a_col = None
        body = rows
    out = []
    for cells, line in body:
        text = _cell(cells, q_col)
        if not text.strip():
            continue  # a row with no question is not a question
        citation = _cell(cells, c_col)
        if unguard:
            text, citation = _unguarded(text), _unguarded(citation)
        out.append(
            (
                text,
                citation,
                _cell(cells, r_col).strip().lower() in _REQUIRED_VALUES,
                _cell(cells, a_col) if a_col is not None else None,
                line,
            )
        )
    return out


# csv.reader refuses a field over 131072 characters by default, which would turn a
# long cell into a 500 instead of the "longer than 2000 characters" warning. The
# whole file is already in memory and bounded by the upload cap, so the csv
# module's own limit protects nothing here; lift it once for the process.
_CSV_FIELD_LIMIT = 2**31 - 1
csv.field_size_limit(_CSV_FIELD_LIMIT)


def _from_csv(text: str) -> tuple[list[Candidate], int]:
    first_line = text.split("\n", 1)[0]
    delimiter = ";" if ";" in first_line and "," not in first_line else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [(cells, reader.line_num) for cells in reader]
    return _table_rows(rows, unguard=True), 0


_RULE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")
_LIST_MARKER = re.compile(r"^(?:[-*+]|\d+[.)])\s+")
_TABLE_SEPARATOR = re.compile(r"^[\s|:\-]+$")
_TRAILING_CITATION = re.compile(r"^(.*?)\s*\[([^\[\]]*)\]\s*$")


def _md_cells(inner: str) -> list[str]:
    r"""The cells of a table line without its outer pipes, left to right:
    \\ is one \, \| is one |, any other \ is kept, a bare | ends the cell."""
    cells: list[str] = []
    current: list[str] = []
    i = 0
    while i < len(inner):
        ch = inner[i]
        if ch == "\\" and i + 1 < len(inner) and inner[i + 1] in ("\\", "|"):
            current.append(inner[i + 1])
            i += 2
            continue
        if ch == "|":
            cells.append("".join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    cells.append("".join(current))
    return cells


def _unwrap(line: str) -> str:
    """Strip list markers and surrounding **/__ until nothing changes."""
    while True:
        before = line
        line = _LIST_MARKER.sub("", line.strip()).strip()
        for wrapper in ("**", "__"):
            if len(line) > 2 * len(wrapper) and line.startswith(wrapper) and line.endswith(wrapper):
                line = line[len(wrapper) : -len(wrapper)].strip()
        if line == before:
            return line


def _with_citation(line: str) -> tuple[str, str]:
    """A trailing [...] is the citation; a [...](link) is text."""
    m = _TRAILING_CITATION.match(line)
    if m and m.group(1).strip():
        return m.group(1), m.group(2)
    return line, ""


def _from_markdown(text: str) -> tuple[list[Candidate], int]:
    candidates: list[Candidate] = []
    headings = 0
    in_fence = False
    in_comment = False
    table: list[tuple[list[str], int]] = []

    def flush_table() -> None:
        if table:
            candidates.extend(_table_rows(table))
            table.clear()

    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if in_fence:
            if line.startswith("```"):
                in_fence = False
            continue
        if in_comment:
            if "-->" in line:
                in_comment = False
            continue
        if line.startswith("|") and line.endswith("|") and len(line) > 1:
            if not _TABLE_SEPARATOR.match(line):
                table.append(([c.strip() for c in _md_cells(line[1:-1])], number))
            continue
        flush_table()
        if not line:
            continue
        if line.startswith("```"):
            in_fence = True
            continue
        if line.startswith("<!--"):
            if "-->" not in line:
                in_comment = True
            continue
        if _RULE.match(line):
            continue
        if line.startswith("#"):
            headings += 1
            continue
        body, citation = _with_citation(_unwrap(line))
        candidates.append((body, citation, False, None, number))
    flush_table()
    return candidates, headings


def _from_docx(raw: bytes) -> tuple[list[Candidate], int]:
    check_docx_expansion(raw)
    import docx

    try:
        document = docx.Document(io.BytesIO(raw))
    except Exception as exc:
        raise DocumentUnreadable(f"this .docx could not be read: {exc}") from exc
    candidates: list[Candidate] = []
    headings = 0
    number = 0
    for number, paragraph in enumerate(document.paragraphs, start=1):
        style = paragraph.style.name if paragraph.style is not None else ""
        if style.startswith("Heading") or style in ("Title", "Subtitle"):
            headings += 1
            continue
        line = paragraph.text.strip()
        if not line:
            continue
        body, citation = _with_citation(line)
        candidates.append((body, citation, False, None, number))
    for table in document.tables:
        rows = []
        for row in table.rows:
            number += 1
            rows.append(([cell.text for cell in row.cells], number))
        candidates.extend(_table_rows(rows))
    return candidates, headings


def _collapse(s: str) -> str:
    return " ".join(s.split())


def _limited(candidates: list[Candidate], headings: int) -> tuple[list[ImportedQuestion], list[str]]:
    questions: list[ImportedQuestion] = []
    warnings: list[str] = []
    seen: set[str] = set()
    duplicates = 0
    for text, citation, required, annex_raw, line in candidates:
        text, citation = _collapse(text), _collapse(citation)
        if not text:
            continue
        if len(text) > MAX_TEXT:
            warnings.append(
                f"Question on line {line} is longer than {MAX_TEXT} characters and was skipped."
            )
            continue
        key = text.lower()
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        if len(citation) > MAX_CITATION:
            citation = citation[:MAX_CITATION]
            warnings.append(f"The citation on line {line} was shortened to {MAX_CITATION} characters.")
        annex_point = None
        if annex_raw is not None:
            value = annex_raw.strip()
            if value.lower() in ANNEX_POINT_IDS:
                annex_point = value.lower()
            elif value:
                warnings.append(
                    f'The Annex IV point on line {line} ("{value}") is not one of the 14 and was left blank.'
                )
        questions.append(ImportedQuestion(text, citation, required, annex_point))
    if headings:
        warnings.insert(0, f"Skipped {_plural(headings, 'heading')}.")
    if duplicates:
        warnings.append(f"Removed {_plural(duplicates, 'duplicate question')}.")
    return questions, warnings


def parse_form_file(raw: bytes, filename: str) -> FormImport:
    """The questions in an uploaded form file. Refusals raise DocumentUnreadable."""
    if not raw:
        raise DocumentUnreadable("the file is empty")
    name = filename or ""
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    fmt = FORMATS.get(extension)
    if fmt is None:
        raise DocumentUnreadable(
            f"{extension or 'this file'} is not a form format this reads: csv, docx, md"
        )
    if fmt == "docx":
        candidates, headings = _from_docx(raw)
    else:
        text = _decode(raw).lstrip("﻿")
        candidates, headings = _from_csv(text) if fmt == "csv" else _from_markdown(text)
    questions, warnings = _limited(candidates, headings)
    if len(questions) > MAX_QUESTIONS:
        raise DocumentUnreadable(
            f"This file has more than {MAX_QUESTIONS} questions; split it into smaller forms."
        )
    return FormImport(fmt, questions, warnings)
