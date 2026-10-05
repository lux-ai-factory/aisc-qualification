"""The service the form talks to: one upload in, the form's fields out."""
import io
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as prefill_app
from app import app

client = TestClient(app)


def upload(text=b"System name: MCAS\n", name="doc.txt", **form):
    return client.post(
        "/prefill",
        files={"file": (name, io.BytesIO(text), "text/plain")},
        data=form,
    )


def test_health():
    assert client.get("/health").status_code == 200


def test_an_upload_comes_back_as_the_form_s_fields():
    response = upload()
    assert response.status_code == 200
    body = response.json()
    assert body["values"]["systemName"] == "MCAS"
    assert body["filled"] == ["systemName"]


def test_the_mode_decides_what_happens_to_what_is_there():
    current = json.dumps({"systemName": "Mine"})
    kept = upload(current=current, mode="empty").json()
    replaced = upload(current=current, mode="replace").json()
    assert kept["values"]["systemName"] == "Mine"
    assert replaced["values"]["systemName"] == "MCAS"


def test_the_default_mode_is_the_careful_one():
    """A caller that forgets to say does not lose somebody's typing."""
    body = upload(current=json.dumps({"systemName": "Mine"})).json()
    assert body["values"]["systemName"] == "Mine"


def test_a_mode_nobody_defined_is_422_not_a_guess():
    assert upload(mode="overwrite").status_code == 422


def test_a_file_it_cannot_read_says_so():
    response = upload(text=b"\x00", name="system.exe")
    assert response.status_code == 422
    assert "exe" in response.json()["detail"]


def test_an_empty_file_says_so():
    response = upload(text=b"")
    assert response.status_code == 422


def test_current_that_is_not_json_is_refused_rather_than_ignored():
    """Ignoring it would silently turn "fill the empty ones" into "fill all"."""
    assert upload(current="not json", mode="empty").status_code == 422


def test_a_document_with_nothing_in_it_for_this_form_is_not_an_error():
    body = upload(text=b"An essay about nothing in particular.").json()
    assert body["values"] == {}
    assert body["filled"] == []
    assert body["read"] is True


def test_it_reports_how_it_read_the_document():
    """The form tells the person what happened, so "nothing was filled" can be
    told apart from "the model is not configured"."""
    body = upload().json()
    assert body["source"] == "document"
    assert "model" in body


RISKY = b"System name: MCAS\n\nRisks\nRisk: wrongly refused\nAffected: user\nImpact areas: fundamental rights\n"


def test_the_document_s_risks_come_back_as_rows():
    body = upload(text=RISKY).json()
    assert [r["risk"] for r in body["risks"]] == ["wrongly refused"]
    assert body["risks"][0]["areas"] == ["Right"]
    assert body["risksKept"] is False


def test_risks_are_not_mixed_into_the_field_values():
    """The rows are a list on their own: the form writes values onto fields by
    name, and a list there has nowhere to go."""
    assert "risks" not in upload(text=RISKY).json()["values"]


def test_rows_somebody_wrote_are_kept_unless_they_asked_to_replace():
    mine = json.dumps([{"risk": "typed"}])
    kept = upload(text=RISKY, current_risks=mine, mode="empty").json()
    replaced = upload(text=RISKY, current_risks=mine, mode="replace").json()
    assert kept["risks"] is None and kept["risksKept"] is True
    assert replaced["risks"][0]["risk"] == "wrongly refused"


def test_a_document_without_risks_leaves_the_rows_alone():
    assert upload().json()["risks"] is None


def test_current_risks_that_are_not_a_list_are_refused():
    assert upload(text=RISKY, current_risks='{"risk": "x"}').status_code == 422


def test_it_says_how_many_risks_the_document_has_even_when_it_keeps_the_form_s():
    """So the form can say what pressing "replace" would bring in."""
    body = upload(text=RISKY, current_risks=json.dumps([{"risk": "typed"}]), mode="empty").json()
    assert body["risksProposed"] == 1
    assert upload().json()["risksProposed"] == 0


APP_ROOT = Path(__file__).resolve().parents[3]


def form_file(content: bytes, name: str):
    return client.post("/forms/import", files={"file": (name, io.BytesIO(content), "application/octet-stream")})


class TestFormImportEndpoint:
    """POST /forms/import."""

    def test_r27_a_csv_comes_back_as_questions(self):
        r = form_file(b"question,citation,required\nWho signs off?,Acme \xc2\xa74.2,yes\nWho audits?,,\n", "acme.csv")
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body) == {"format", "found", "questions", "warnings"}
        assert body["format"] == "csv"
        # each question also carries annexPoint
        assert body["questions"] == [
            {"text": "Who signs off?", "citation": "Acme §4.2", "required": True, "annexPoint": None},
            {"text": "Who audits?", "citation": "", "required": False, "annexPoint": None},
        ]
        assert body["found"] == len(body["questions"]) == 2
        assert body["warnings"] == []

    def test_r27_a_csv_cell_over_128_kb_is_a_warning_not_a_500(self):
        # Well under the 10 MB cap, over csv's 131072-character field limit.
        content = b"question\nWho signs off?\n" + b"z" * 200_000 + b"\n"
        r = form_file(content, "acme.csv")
        assert r.status_code == 200, r.text
        body = r.json()
        assert [q["text"] for q in body["questions"]] == ["Who signs off?"]
        assert "Question on line 3 is longer than 2000 characters and was skipped." in body["warnings"]

    def test_r27_warnings_travel_with_the_questions(self):
        body = form_file(b"# Title\n- Who signs off?\n- who signs off?\n", "acme.md").json()
        assert body["format"] == "md"
        assert body["found"] == 1
        assert "Skipped 1 heading." in body["warnings"]
        assert "Removed 1 duplicate question." in body["warnings"]

    @pytest.mark.parametrize("name,ext", [("policy.pdf", "pdf"), ("notes.txt", "txt")])
    def test_r27_other_formats_are_422_naming_the_ones_it_reads(self, name, ext):
        r = form_file(b"Who signs off?\n", name)
        assert r.status_code == 422
        assert r.json()["detail"] == f"{ext} is not a form format this reads: csv, docx, md"

    def test_r27_an_empty_file_is_422(self):
        r = form_file(b"", "acme.csv")
        assert r.status_code == 422
        assert r.json()["detail"] == "the file is empty"

    def test_r27_more_than_200_questions_is_422(self):
        content = ("question\n" + "".join(f"Question {i}?\n" for i in range(201))).encode()
        r = form_file(content, "big.csv")
        assert r.status_code == 422
        assert r.json()["detail"] == "This file has more than 200 questions; split it into smaller forms."

    def test_r27_a_file_over_the_limit_is_413(self, monkeypatch):
        monkeypatch.setattr(prefill_app, "MAX_BYTES", 16)
        assert form_file(b"question\nWho signs off a model release?\n", "acme.csv").status_code == 413

    def test_r27_a_file_with_no_questions_is_200_with_found_0(self):
        r = form_file(b"# Only a heading\n", "acme.md")
        assert r.status_code == 200
        assert r.json()["found"] == 0
        assert r.json()["questions"] == []

    def test_r27_it_stores_nothing_and_asks_no_model(self):
        r = form_file(b"question\nWho signs off?\n", "acme.csv")
        assert r.status_code == 200
        assert r.json().get("model") is None


def default_questions() -> list[dict]:
    """The default version's questions, read out of src/data/keyQuestions.ts."""
    source = (APP_ROOT / "src" / "data" / "keyQuestions.ts").read_text(encoding="utf-8")
    groups = {"GROUP_1": "annex-1", "GROUP_2": "annex-2"}
    found = []
    pattern = re.compile(
        r'\.\.\.(GROUP_[12]),\s*id: "(\w+)",\s*citation: "([^"]+)",\s*(?:optional: true,\s*)?text: "((?:[^"\\]|\\.)*)"'
    )
    for group, qid, citation, text in pattern.findall(source):
        found.append({"field": f"q:{groups[group]}:{qid}", "text": text, "citation": citation, "annexPoint": qid})
    assert len(found) == 14
    return found


IDENTITY_AND_BLOCKS = [
    "systemName", "systemVersion", "company", "description", "targetUseCase", "targetUsers",
    "intendedDeployers", "targetSystemTags", "sectorTags", "marketFormTags", "localityTags", "risks",
]

ANNEX_DOC = (
    b"System name: MCAS\nProvider: Creditum AI SARL\nDescription: Scores loans.\n\n"
    b"Annex IV(1)(a)\nThis release replaces 1.1.0.\n\n"
    b"1(d)\nSupplied as a download.\n1(e)\nRuns on the bank's servers.\n\n"
    b"2(a)\nBuilt from a pre-trained model.\n2(h)\nSigned images only.\n\n"
    b"Risks\nRisk: wrongly refused\nAffected: user\nImpact areas: fundamental rights\n"
)


class TestPrefillWithAForm:
    """/prefill with the form's fields and questions."""

    def test_r38_the_default_form_prefills_exactly_as_the_legacy_call(self):
        legacy = upload(text=ANNEX_DOC, name="doc.md").json()
        fields = IDENTITY_AND_BLOCKS + [q["field"] for q in default_questions()]
        with_form = upload(
            text=ANNEX_DOC,
            name="doc.md",
            fields=json.dumps(fields),
            questions=json.dumps(default_questions()),
        ).json()
        for key in ("values", "filled", "kept", "proposed", "risks", "risksKept", "risksProposed"):
            assert with_form[key] == legacy[key], key

    def test_r38_the_merged_point_is_still_joined_for_the_default_form(self):
        fields = IDENTITY_AND_BLOCKS + [q["field"] for q in default_questions()]
        body = upload(text=ANNEX_DOC, name="doc.md", fields=json.dumps(fields),
                      questions=json.dumps(default_questions())).json()
        assert body["values"]["q:annex-1:1de"] == "Supplied as a download. Runs on the bank's servers."

    def test_r40_a_field_the_form_does_not_have_is_never_proposed(self):
        fields = ["systemName", "systemVersion", "company", "risks"]
        body = upload(text=ANNEX_DOC, name="doc.md", fields=json.dumps(fields), questions="[]").json()
        assert "description" not in body["values"]
        assert "description" not in body["proposed"]
        assert not any(k.startswith("q:") for k in body["values"])
        assert body["values"]["systemName"] == "MCAS"

    def test_r40_no_risk_block_means_no_risks(self):
        fields = ["systemName", "systemVersion", "company"]
        body = upload(text=ANNEX_DOC, name="doc.md", fields=json.dumps(fields), questions="[]").json()
        assert body["risks"] is None
        assert body["risksKept"] is False
        assert body["risksProposed"] == 0

    def test_r39_r40_a_custom_question_is_proposed_by_its_own_wording(self):
        doc = b"## Acme AI Policy \xc2\xa74.2\nThe head of data science signs off every release.\n"
        q = {"field": "q:f-x:q1", "text": "Who signs off a model release?", "citation": "Acme AI Policy §4.2", "annexPoint": None}
        body = upload(
            text=doc, name="doc.md",
            fields=json.dumps(["systemName", "systemVersion", "company", "q:f-x:q1"]),
            questions=json.dumps([q]),
        ).json()
        assert body["values"]["q:f-x:q1"] == "The head of data science signs off every release."
        assert body["filled"] == ["q:f-x:q1"]

    @pytest.mark.parametrize("name,value", [("fields", "not json"), ("fields", '{"a": 1}'),
                                            ("questions", "not json"), ("questions", '"x"')])
    def test_r40_fields_and_questions_that_are_not_json_lists_are_422_naming_the_field(self, name, value):
        r = upload(**{name: value})
        assert r.status_code == 422
        assert r.json()["detail"].startswith(f"{name}:")



class TestFormImportAnnexPoint:
    """/forms/import returns each question's annexPoint."""

    def test_r53_the_annex_column_comes_back_as_annex_point(self):
        r = form_file(b"question,required,annex_point\nWho signs off?,yes,2A\nWho audits?,no,3a\n", "acme.csv")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["questions"] == [
            {"text": "Who signs off?", "citation": "", "required": True, "annexPoint": "2a"},
            {"text": "Who audits?", "citation": "", "required": False, "annexPoint": None},
        ]
        assert body["warnings"] == [
            'The Annex IV point on line 3 ("3a") is not one of the 14 and was left blank.'
        ]


def export(payload: dict):
    return client.post("/forms/export", json=payload)


R50_FORM = {
    "name": "Acme AI policy",
    "version": 3,
    "questions": [
        {"text": "Who signs off a model release?", "citation": "Acme AI Policy §4.2", "required": True, "annexPoint": None},
        {"text": "=Is SUM(A1) ok, or not?", "citation": "", "required": False, "annexPoint": "2a"},
    ],
}


class TestFormExportEndpoint:
    """POST /forms/export."""

    def test_r55_csv_comes_back_as_filename_content_type_and_content(self):
        r = export({"format": "csv", "form": R50_FORM})
        assert r.status_code == 200, r.text
        assert r.json() == {
            "filename": "acme-ai-policy-v3.csv",
            "contentType": "text/csv; charset=utf-8",
            "content": (
                "﻿question,citation,required,annex_point\r\n"
                "Who signs off a model release?,Acme AI Policy §4.2,yes,\r\n"
                "\"'=Is SUM(A1) ok, or not?\",,no,2a\r\n"
            ),
        }

    def test_r55_markdown(self):
        r = export({"format": "md", "form": R50_FORM})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["filename"] == "acme-ai-policy-v3.md"
        assert body["contentType"] == "text/markdown; charset=utf-8"
        assert body["content"].startswith("# Acme AI policy (v3)\n")

    def test_r55_a_form_with_no_questions_is_fine(self):
        r = export({"format": "csv", "form": {"name": "Empty", "version": 1, "questions": []}})
        assert r.status_code == 200
        assert r.json()["content"] == "﻿question,citation,required,annex_point\r\n"

    @pytest.mark.parametrize("fmt", ["pdf", "docx", "CSV", ""])
    def test_r55_any_other_format_is_422_format_must_be_csv_or_md(self, fmt):
        r = export({"format": fmt, "form": R50_FORM})
        assert r.status_code == 422
        assert r.json()["detail"] == "format must be csv or md"

    def test_r55_an_annex_point_outside_the_14_is_422_naming_the_question(self):
        form = {**R50_FORM, "questions": [R50_FORM["questions"][0], {**R50_FORM["questions"][1], "annexPoint": "3a"}]}
        r = export({"format": "csv", "form": form})
        assert r.status_code == 422
        assert r.json()["detail"] == "question 2 names an Annex IV point that does not exist"

    def test_r55_more_than_200_questions_is_422(self):
        questions = [{"text": f"Q{i}?", "citation": "", "required": True, "annexPoint": None} for i in range(201)]
        r = export({"format": "csv", "form": {"name": "Big", "version": 1, "questions": questions}})
        assert r.status_code == 422
        assert r.json()["detail"] == "a form has at most 200 questions"

    def test_r55_exactly_200_questions_is_fine(self):
        questions = [{"text": f"Q{i}?", "citation": "", "required": True, "annexPoint": None} for i in range(200)]
        assert export({"format": "md", "form": {"name": "Big", "version": 1, "questions": questions}}).status_code == 200

    @pytest.mark.parametrize(
        "payload",
        [
            {"form": R50_FORM},
            {"format": "csv"},
            {"format": "csv", "form": {**R50_FORM, "version": 0}},
            {"format": "csv", "form": {**R50_FORM, "version": "three"}},
            {"format": "csv", "form": {"version": 1, "questions": []}},
            {"format": "csv", "form": {**R50_FORM, "questions": [{"text": "Q?", "citation": "", "required": True}]}},
            {"format": "csv", "form": {**R50_FORM, "questions": [{"text": 1, "citation": "", "required": True, "annexPoint": None}]}},
        ],
    )
    def test_r55_a_missing_or_mistyped_field_is_pydantic_s_422(self, payload):
        r = export(payload)
        assert r.status_code == 422
        assert isinstance(r.json()["detail"], list)

    def test_r55_it_stores_nothing_and_asks_no_model(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        r = export({"format": "csv", "form": R50_FORM})
        assert r.status_code == 200
        assert set(r.json()) == {"filename", "contentType", "content"}
        assert list(tmp_path.iterdir()) == []


class TestDocxExpansionEndpoints:
    """Both endpoints answer 422 with the expansion message."""

    def test_r70_forms_import_refuses_a_docx_bomb_with_422(self, monkeypatch):
        from tests.test_form_import import EXPANDS, docx_bomb

        monkeypatch.delenv("PREFILL_MAX_UNZIPPED_BYTES", raising=False)
        r = form_file(docx_bomb(), "big.docx")
        assert r.status_code == 422
        assert r.json()["detail"] == EXPANDS.format(52428800)

    def test_r70_prefill_refuses_a_docx_bomb_with_422(self, monkeypatch):
        from tests.test_form_import import EXPANDS, docx_bomb

        monkeypatch.delenv("PREFILL_MAX_UNZIPPED_BYTES", raising=False)
        r = upload(text=docx_bomb(), name="big.docx")
        assert r.status_code == 422
        assert r.json()["detail"] == EXPANDS.format(52428800)



def questionnaire_export(payload: dict):
    return client.post("/questionnaires/export", json=payload)


def questionnaire_file(content: bytes, name: str):
    return client.post(
        "/questionnaires/import", files={"file": (name, io.BytesIO(content), "application/octet-stream")}
    )


def _q_item(**over) -> dict:
    out = {
        "setId": "acme",
        "setName": "Acme AI policy",
        "setVersion": 1,
        "scope": "s-acme",
        "localId": "q1",
        "text": "Who signs off a model release?",
        "citation": "Acme AI Policy §4.2",
        "required": True,
        "annexPoint": None,
        "groupLabel": None,
    }
    out.update(over)
    return out


T50_Q = {"name": "Acme questionnaire", "description": "", "version": 2, "blocks": ["risks"], "items": [_q_item()]}


class TestQuestionnaireEndpoints:
    """POST /questionnaires/export and POST /questionnaires/import."""

    def test_t50_export_comes_back_as_filename_content_type_and_content(self):
        r = questionnaire_export({"bundle": "references", "questionnaire": T50_Q})
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body) == {"filename", "contentType", "content"}
        assert body["filename"] == "acme-questionnaire-v2.questionnaire.json"
        assert body["contentType"] == "application/json; charset=utf-8"
        doc = json.loads(body["content"])
        assert doc["bundle"] == "references"
        assert doc["items"] == [
            {"setId": "acme", "setName": "Acme AI policy", "setVersion": 1, "scope": "s-acme", "localId": "q1"}
        ]
        assert body["content"].endswith("\n")

    def test_t50_export_self_contained_carries_the_wording(self):
        r = questionnaire_export({"bundle": "self-contained", "questionnaire": T50_Q})
        assert r.status_code == 200, r.text
        assert json.loads(r.json()["content"])["items"] == [_q_item()]

    def test_t50_a_references_export_needs_no_wording(self):
        bare = {k: v for k, v in _q_item().items() if k in {"setId", "setName", "setVersion", "scope", "localId"}}
        r = questionnaire_export({"bundle": "references", "questionnaire": {**T50_Q, "items": [bare]}})
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("bundle", ["all", "", "References"])
    def test_t50_a_bundle_nobody_defined_is_422(self, bundle):
        r = questionnaire_export({"bundle": bundle, "questionnaire": T50_Q})
        assert r.status_code == 422
        assert r.json()["detail"] == "bundle must be references or self-contained"

    @pytest.mark.parametrize("missing", ["text", "citation", "required", "annexPoint", "groupLabel"])
    def test_t50_bundling_an_item_without_its_wording_is_422(self, missing):
        second = {k: v for k, v in _q_item(localId="q2").items() if k != missing}
        r = questionnaire_export({"bundle": "self-contained", "questionnaire": {**T50_Q, "items": [_q_item(), second]}})
        assert r.status_code == 422
        assert r.json()["detail"] == (
            "item 2 has no wording: a self-contained file needs text, citation, required, annexPoint and groupLabel"
        )

    def test_t50_more_than_200_items_is_422(self):
        items = [_q_item(localId=f"q{i}") for i in range(201)]
        r = questionnaire_export({"bundle": "references", "questionnaire": {**T50_Q, "items": items}})
        assert r.status_code == 422
        assert r.json()["detail"] == "a questionnaire has at most 200 questions"

    @pytest.mark.parametrize(
        "payload",
        [
            {"bundle": "references"},
            {"bundle": "references", "questionnaire": {**T50_Q, "version": "three"}},
            {"bundle": "references", "questionnaire": {**T50_Q, "blocks": "risks"}},
            {"bundle": "references", "questionnaire": {**T50_Q, "items": [_q_item(setVersion="one")]}},
        ],
    )
    def test_t50_a_missing_or_mistyped_field_is_pydantic_s_422(self, payload):
        r = questionnaire_export(payload)
        assert r.status_code == 422
        assert isinstance(r.json()["detail"], list)

    def test_t51_import_returns_the_normalised_document(self):
        doc = {
            "format": "aisc-questionnaire",
            "formatVersion": 1,
            "bundle": "references",
            "name": "  Acme   questionnaire ",
            "version": 2,
            "blocks": ["risks"],
            "items": [{"setId": "acme", "setVersion": 1, "scope": "s-acme", "localId": "q1", "text": "dropped"}],
        }
        r = questionnaire_file(json.dumps(doc).encode(), "acme.questionnaire.json")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["bundle"] == "references"
        assert body["name"] == "Acme questionnaire"
        assert body["description"] == ""
        assert body["blocks"] == ["risks"]
        assert body["items"] == [{"setId": "acme", "setName": "", "setVersion": 1, "scope": "s-acme", "localId": "q1"}]

    def test_t51_import_round_trips_an_export(self):
        exported = questionnaire_export({"bundle": "self-contained", "questionnaire": T50_Q}).json()
        r = questionnaire_file(exported["content"].encode("utf-8"), exported["filename"])
        assert r.status_code == 200, r.text
        assert r.json()["items"] == [_q_item()]

    @pytest.mark.parametrize(
        "content,name,detail",
        [
            (b"{}", "acme.csv", "csv is not a questionnaire file format: json"),
            (b"", "acme.json", "the file is empty"),
            (b"{nope", "acme.json", "this file is not JSON"),
            (b"[]", "acme.json", "a questionnaire file is a JSON object"),
            (
                b'{"format": "aisc-form", "formatVersion": 1}',
                "acme.json",
                "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1",
            ),
        ],
    )
    def test_t51_a_malformed_file_is_422_with_the_detail(self, content, name, detail):
        r = questionnaire_file(content, name)
        assert r.status_code == 422
        assert r.json()["detail"] == detail

    def test_t51_a_file_over_the_limit_is_413(self, monkeypatch):
        monkeypatch.setattr(prefill_app, "MAX_BYTES", 16)
        doc = {"format": "aisc-questionnaire", "formatVersion": 1, "bundle": "references", "name": "A", "blocks": [], "items": []}
        assert questionnaire_file(json.dumps(doc).encode(), "acme.json").status_code == 413

    def test_t51_it_stores_nothing_and_asks_no_model(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        r = questionnaire_export({"bundle": "references", "questionnaire": T50_Q})
        assert r.status_code == 200
        assert r.json().get("model") is None
        assert list(tmp_path.iterdir()) == []


PARTS = b"System name: MCAS\n\nComponents\n\nComponent 1\nName: Scoring model\nKind: Predictive model\n"


def test_the_document_s_components_come_back_as_rows():
    body = upload(text=PARTS).json()
    assert [(r["name"], r["type"]) for r in body["components"]] == [("Scoring model", "Model")]
    assert body["componentsKept"] is False
    assert body["componentsProposed"] == 1
    assert "components" not in body["values"]


def test_component_rows_somebody_wrote_are_kept_unless_they_asked_to_replace():
    mine = json.dumps([{"name": "typed"}])
    kept = upload(text=PARTS, current_components=mine, mode="empty").json()
    replaced = upload(text=PARTS, current_components=mine, mode="replace").json()
    assert kept["components"] is None and kept["componentsKept"] is True
    assert kept["componentsProposed"] == 1
    assert replaced["components"][0]["name"] == "Scoring model"


def test_a_document_without_components_leaves_the_rows_alone():
    body = upload().json()
    assert body["components"] is None
    assert body["componentsProposed"] == 0


def test_current_components_that_are_not_a_list_are_refused():
    assert upload(text=PARTS, current_components='{"name": "x"}').status_code == 422
