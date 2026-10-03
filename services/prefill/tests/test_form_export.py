"""Writing a form's questions to a file: CSV or Markdown, and reading it back.

The tests pin the exact formats and the file name, check that export then
import gives back the same form, and that no model is used (standard library
and this package only).

Interface:
  export_form(form: dict, fmt: str) -> ExportedFile
  ExportedFile: dataclass (filename: str, content_type: str, content: str)
  form = {"name": str, "version": int,
          "questions": [{"text", "citation", "required", "annexPoint"}]}
"""
import dataclasses
import json
from pathlib import Path

import pytest

from prefill.documents import DocumentUnreadable  # noqa: F401  (the family the reader refuses with)

try:
    from prefill.form_export import ExportedFile, export_form
except ImportError as _missing:  # if the module is missing, each test fails instead of the whole suite
    ExportedFile = None

    def export_form(*_args, _error=_missing, **_kwargs):
        raise _error

from prefill.form_import import parse_form_file

FIXTURES = Path(__file__).resolve().parent / "fixtures"
IDS = ["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]
MD_COMMENT = (
    "<!-- Exported from the AI System Qualification form library. "
    "Import this file to make a new form with these questions. -->"
)


def q(text, citation="", required=True, point=None):
    return {"text": text, "citation": citation, "required": required, "annexPoint": point}


def collapse(s: str) -> str:
    return " ".join(s.split())


# CSV


class TestCsv:
    def test_r50_the_addendum_example_exactly(self):
        form = {
            "name": "Acme AI policy",
            "version": 3,
            "questions": [
                q("Who signs off a model release?", "Acme AI Policy §4.2", True, None),
                q("=Is SUM(A1) ok, or not?", "", False, "2a"),
            ],
        }
        out = export_form(form, "csv")
        assert out.content == (
            "\ufeffquestion,citation,required,annex_point\r\n"
            "Who signs off a model release?,Acme AI Policy §4.2,yes,\r\n"
            "\"'=Is SUM(A1) ok, or not?\",,no,2a\r\n"
        )
        assert out.content_type == "text/csv; charset=utf-8"

    def test_r50_exported_file_is_a_dataclass_of_filename_content_type_content(self):
        out = export_form({"name": "F", "version": 1, "questions": []}, "csv")
        assert dataclasses.is_dataclass(out)
        assert [f.name for f in dataclasses.fields(out)] == ["filename", "content_type", "content"]
        assert ExportedFile is not None and isinstance(out, ExportedFile)

    def test_r50_zero_questions_is_the_bom_and_the_header_row(self):
        out = export_form({"name": "Empty", "version": 1, "questions": []}, "csv")
        assert out.content == "\ufeffquestion,citation,required,annex_point\r\n"

    def test_r50_quotes_are_doubled_and_only_fields_that_need_it_are_quoted(self):
        out = export_form({"name": "F", "version": 1, "questions": [q('She said "yes"; ok', "a,b")]}, "csv")
        assert out.content.split("\r\n")[1] == '"She said ""yes""; ok","a,b",yes,'

    @pytest.mark.parametrize("first", ["=", "+", "-", "@"])
    def test_r50_the_formula_guard_on_text_and_citation(self, first):
        out = export_form({"name": "F", "version": 1, "questions": [q(f"{first}x?", f"{first}cite")]}, "csv")
        assert out.content.split("\r\n")[1] == f"'{first}x?,'{first}cite,yes,"

    @pytest.mark.parametrize("first", ["=", "+", "-", "@"])
    def test_r50_a_leading_quote_before_a_formula_character_gets_one_more(self, first):
        out = export_form({"name": "F", "version": 1, "questions": [q(f"'{first}x?")]}, "csv")
        assert out.content.split("\r\n")[1] == f"''{first}x?,,yes,"

    def test_r50_no_guard_otherwise(self):
        out = export_form({"name": "F", "version": 1, "questions": [q("'quoted' word?", "x=1")]}, "csv")
        assert out.content.split("\r\n")[1] == "'quoted' word?,x=1,yes,"

    def test_r50_name_text_and_citation_are_collapsed_before_writing(self):
        out = export_form(
            {"name": "F", "version": 1, "questions": [q("  Two\n lines  and  spaces ", " §4 \t 2 ")]}, "csv"
        )
        assert out.content.split("\r\n")[1] == "Two lines and spaces,§4 2,yes,"

    def test_r50_rows_follow_the_question_order_with_point_ids(self):
        form = {"name": "F", "version": 1, "questions": [q("B?", point="1de"), q("A?", required=False)]}
        lines = export_form(form, "csv").content.split("\r\n")
        assert lines[1:] == ["B?,,yes,1de", "A?,,no,", ""]


# Markdown


class TestMarkdown:
    def test_r51_the_addendum_example_exactly(self):
        form = {"name": "Acme AI policy", "version": 3, "questions": [q("Who signs off | approves?", "", True, "2a")]}
        out = export_form(form, "md")
        assert out.content == (
            "# Acme AI policy (v3)\n"
            "\n"
            f"{MD_COMMENT}\n"
            "\n"
            "| Question | Citation | Required | Annex IV point |\n"
            "|---|---|---|---|\n"
            "| Who signs off \\| approves? |  | yes | 2a |\n"
        )
        assert out.content_type == "text/markdown; charset=utf-8"

    def test_r51_a_backslash_is_doubled_before_pipes_are_escaped(self):
        out = export_form({"name": "F", "version": 1, "questions": [q("a\\|b", "c\\d")]}, "md")
        assert out.content.splitlines()[-1] == "| a\\\\\\|b | c\\\\d | yes |  |"

    def test_r51_no_formula_guard_in_markdown(self):
        out = export_form({"name": "F", "version": 1, "questions": [q("=SUM(A1)?", "+1", False, "1f")]}, "md")
        assert out.content.splitlines()[-1] == "| =SUM(A1)? | +1 | no | 1f |"

    def test_r51_zero_questions_is_the_header_and_the_separator(self):
        out = export_form({"name": "  Empty   form ", "version": 2, "questions": []}, "md")
        assert out.content == (
            f"# Empty form (v2)\n\n{MD_COMMENT}\n\n| Question | Citation | Required | Annex IV point |\n|---|---|---|---|\n"
        )

    def test_r51_the_name_and_cells_are_collapsed(self):
        out = export_form({"name": "A\nB", "version": 1, "questions": [q("x \n y", "  ")]}, "md")
        lines = out.content.split("\n")
        assert lines[0] == "# A B (v1)"
        assert lines[-2] == "| x y |  | yes |  |"
        assert out.content.endswith("|\n") and not out.content.endswith("\n\n")


# The file name


class TestFileName:
    @pytest.mark.parametrize(
        "name,version,fmt,expected",
        [
            ("Annex IV default", 1, "csv", "annex-iv-default-v1.csv"),
            ("Acme AI policy §4", 3, "md", "acme-ai-policy-4-v3.md"),
            ("Ärzte-Fragen", 1, "csv", "arzte-fragen-v1.csv"),
            ("§§", 2, "md", "form-v2.md"),
            ("Custom questions: MCAS, 2026-09-25", 1, "csv", "custom-questions-mcas-2026-09-25-v1.csv"),
        ],
    )
    def test_r52_the_addendum_examples(self, name, version, fmt, expected):
        assert export_form({"name": name, "version": version, "questions": []}, fmt).filename == expected

    def test_r52_the_slug_is_cut_to_60_then_stripped_of_a_trailing_dash(self):
        name = "a" * 59 + " b" + "c" * 20  # slug "aaa...a-bccc", the cut lands right after the dash
        out = export_form({"name": name, "version": 4, "questions": []}, "csv")
        assert out.filename == "a" * 59 + "-v4.csv"

    def test_r52_a_long_name_is_cut_to_60_characters(self):
        out = export_form({"name": "x" * 100, "version": 1, "questions": []}, "md")
        assert out.filename == "x" * 60 + "-v1.md"

    def test_r52_the_file_name_is_always_ascii(self):
        out = export_form({"name": "Ça marche · 日本語 ✓", "version": 1, "questions": []}, "csv")
        assert out.filename.isascii()
        assert out.filename == "ca-marche-v1.csv"


# The round trip


def fixture_default() -> dict:
    data = json.loads((FIXTURES / "annex_iv_default_form.json").read_text(encoding="utf-8"))
    return {"name": data["name"], "version": data["version"], "questions": data["questions"]}


def form_of_200() -> dict:
    long_text = ("abcdefghi " * 200)[:1999] + "?"
    assert len(long_text) == 2000
    questions = [q(f"Question number {i}?", f"§{i}", i % 2 == 0, IDS[i % 14] if i % 3 == 0 else None) for i in range(199)]
    questions.insert(57, q(long_text, "§" + "c" * 199, False, "2g"))
    assert len(questions) == 200 and len(questions[57]["citation"]) == 200
    return {"name": "Two hundred", "version": 5, "questions": questions}


def form_of_awkward_text() -> dict:
    texts = [
        ("A, B and C?", ",comma first"),
        ('She said "yes" to it?', '"quoted"'),
        ("Semi; colon?", "a;b"),
        ("Pipe | inside?", "x | y"),
        ("Back\\slash inside?", "c:\\path"),
        ("Escaped \\| pipe?", "a\\|b"),
        ("Ends with a box [x]", "[Acme §2]"),
        ("§ 4.2 applies?", "§ 12"),
        ("Ärzte und Übersetzer?", "Ärzte §1"),
        ("Ça marche, ou pas?", ""),
        ("=SUM(A1) is fine?", "=cite"),
        ("+1 for this?", "+cite"),
        ("-dash first?", "-cite"),
        ("@mention first?", "@cite"),
        ("'=quoted formula?", "'+quoted cite"),
        ("'quoted' word?", "'plain"),
        ("Line one\nline two?", "multi\nline cite"),
        ("Double  spaced   words?", "  padded  citation "),
    ]
    return {"name": "Awkward", "version": 1, "questions": [q(t, c, i % 2 == 0, None) for i, (t, c) in enumerate(texts)]}


def form_of_every_point() -> dict:
    questions = [q(f"About point {p}?", "" if i % 3 else f"Annex §{p}", i % 2 == 1, p) for i, p in enumerate(IDS)]
    questions.append(q("About no point?", "", False, None))
    questions.append(q("Required, no point, no citation?", "", True, None))
    return {"name": "Every point", "version": 2, "questions": questions}


FORMS = {
    "annex_iv_default": fixture_default,
    "two_hundred": form_of_200,
    "awkward_text": form_of_awkward_text,
    "every_point": form_of_every_point,
    "empty": lambda: {"name": "Empty", "version": 1, "questions": []},
}


def comparable(questions) -> list[tuple]:
    return [(collapse(x["text"]), collapse(x["citation"]), x["required"], x["annexPoint"]) for x in questions]


def imported(result) -> list[tuple]:
    return [(x.text, x.citation, x.required, x.annex_point) for x in result.questions]


class TestRoundTrip:
    @pytest.mark.parametrize("fmt", ["csv", "md"])
    @pytest.mark.parametrize("which", list(FORMS))
    def test_r54_export_then_import_is_an_equal_form(self, which, fmt):
        form = FORMS[which]()
        out = export_form(form, fmt)
        result = parse_form_file(out.content.encode("utf-8"), out.filename)
        assert imported(result) == comparable(form["questions"])
        assert result.warnings == (["Skipped 1 heading."] if fmt == "md" else [])

    def test_r54_the_awkward_texts_are_pairwise_distinct_so_the_precondition_holds(self):
        texts = [collapse(x["text"]).lower() for x in form_of_awkward_text()["questions"]]
        assert len(set(texts)) == len(texts)

    @pytest.mark.parametrize("fmt", ["csv", "md"])
    def test_r54_a_form_with_zero_questions_imports_to_found_0(self, fmt):
        out = export_form({"name": "Empty", "version": 1, "questions": []}, fmt)
        assert parse_form_file(out.content.encode("utf-8"), out.filename).questions == []

    @pytest.mark.parametrize("fmt", ["csv", "md"])
    def test_r54_duplicate_texts_are_not_refused_on_export_and_the_import_keeps_the_first(self, fmt):
        form = {"name": "Dup", "version": 1, "questions": [q("Same?"), q("same? ", "other", False, "2a")]}
        out = export_form(form, fmt)
        result = parse_form_file(out.content.encode("utf-8"), out.filename)
        assert imported(result) == [("Same?", "", True, None)]
        assert "Removed 1 duplicate question." in result.warnings

    def test_r54_the_default_form_fixture_is_the_14_questions(self):
        form = fixture_default()
        assert form["name"] == "Annex IV default" and form["version"] == 1
        assert [x["annexPoint"] for x in form["questions"]] == IDS


# The CSV formula guard is an exact inverse. Export guards any cell matching
# ^'*[=+\-@] with one more '; import strips one ' from a cell matching ^'+[=+\-@].

import random
import re
import string

FORMULA_FIRST = "=+-@"


def csv_round_trip(texts_and_citations):
    form = {"name": "G1", "version": 1, "questions": [q(t, c) for t, c in texts_and_citations]}
    out = export_form(form, "csv")
    result = parse_form_file(out.content.encode("utf-8"), out.filename)
    return out, result, form


def exported_cells(out):
    import csv as _csv
    import io as _io

    body = out.content.lstrip("﻿")
    rows = list(_csv.reader(_io.StringIO(body, newline="")))[1:]
    return [cell for row in rows for cell in row[:2]]


class TestG1ExactCsvGuard:
    @pytest.mark.parametrize(
        "cell, written",
        [
            ("''=x", "'''=x"),
            ("'''+y", "''''+y"),
            ("'-z", "''-z"),
            ("@w", "'@w"),
            ("=a", "'=a"),
        ],
    )
    def test_g1_export_guards_any_run_of_quotes_before_a_formula_character(self, cell, written):
        out = export_form({"name": "F", "version": 1, "questions": [q(cell + " question?", cell + " cite")]}, "csv")
        assert exported_cells(out) == [written + " question?", written + " cite"]

    @pytest.mark.parametrize("cell", ["''=x", "'''+y", "'-z", "@w", "=a"])
    def test_g1_csv_round_trip_is_exact(self, cell):
        out, result, form = csv_round_trip([(cell + " question?", cell + " cite")])
        assert imported(result) == comparable(form["questions"])
        assert result.warnings == []

    @pytest.mark.parametrize("cell", ["''=x", "'''+y"])
    def test_g1_import_strips_exactly_one_quote(self, cell):
        text = f"question,citation\n'{cell}?,'{cell}\n"
        assert [(x.text, x.citation) for x in parse_form_file(text.encode(), "f.csv").questions] == [
            (cell + "?", cell)
        ]

    def test_g1_property_export_then_import_is_identity_and_no_cell_starts_with_a_formula_character(self):
        rng = random.Random(20260925)
        tails = string.ascii_letters + string.digits + " ,;\"'=+-@|\\§"
        pairs = []
        # Exhaustive: 0 to 5 quotes, each formula character (or none), then text.
        for n in range(6):
            for first in list(FORMULA_FIRST) + ["", "x"]:
                pairs.append(("'" * n + first + f"exhaustive {n}{first}?", "'" * n + first + "cite"))
        # Random: quotes, formula characters and text mixed in any order at the start.
        for i in range(400):
            head = "".join(rng.choice("'" + FORMULA_FIRST + "ab") for _ in range(rng.randint(0, 8)))
            tail = "".join(rng.choice(tails) for _ in range(rng.randint(0, 12)))
            pairs.append((f"{head}{tail} random {i}?", head + tail))
        # Pairwise distinct texts, as the round trip requires.
        assert len({collapse(t).lower() for t, _ in pairs}) == len(pairs)
        for start in range(0, len(pairs), 150):
            chunk = pairs[start : start + 150]
            out, result, form = csv_round_trip(chunk)
            assert imported(result) == comparable(form["questions"])
            assert result.warnings == []
            for cell in exported_cells(out):
                assert not re.match(r"[=+\-@]", cell), cell


# No model


def test_r73_form_export_imports_only_the_standard_library_and_this_package():
    import ast
    import sys

    source = Path(__file__).resolve().parents[1] / "prefill" / "form_export.py"
    assert source.exists(), source
    names = set()
    for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names.add(node.module.split(".")[0])
    outside = {n for n in names if n not in sys.stdlib_module_names and n not in {"prefill", "__future__"}}
    assert outside == set()
