"""A questionnaire as a file: JSON, by reference or self-contained, and reading it back.

The tests pin the exact file, reading it back with exact errors, the round trip,
and that no model is used (standard library and this package only).

Interface:
  write_questionnaire(q: dict, bundle: str) -> ExportedFile  (filename, content_type, content)
  read_questionnaire(raw: bytes, filename: str) -> dict       the normalised document
  QuestionnaireFileError(detail)                              raised by read_questionnaire
  q = {"name", "description", "version", "blocks",
       "items": [{"setId", "setName", "setVersion", "scope", "localId",
                  "text", "citation", "required", "annexPoint", "groupLabel"}]}

The error's detail is str(error); the normalised document carries "bundle" (the app needs it to tell the two kinds apart),
and the round trip compares the fields of q.
"""
import json
from pathlib import Path

import pytest

try:
    from prefill.questionnaire_file import QuestionnaireFileError, read_questionnaire, write_questionnaire
except ImportError as _missing:  # if the module is missing, each test fails instead of the whole suite

    class QuestionnaireFileError(Exception):  # stand-in so pytest.raises can name it
        pass

    # a fresh error per call: re-raising one object grows its traceback on every test
    def write_questionnaire(*_args, _error=str(_missing), **_kwargs):
        raise ImportError(_error)

    def read_questionnaire(*_args, _error=str(_missing), **_kwargs):
        raise ImportError(_error)


FIXTURES = Path(__file__).resolve().parent / "fixtures"
BLOCKS = [
    "description", "targetUseCase", "targetUsers", "intendedDeployers", "targetSystemTags",
    "sectorTags", "marketFormTags", "localityTags", "risks",
]
WORDING = ["text", "citation", "required", "annexPoint", "groupLabel"]
ANNEX_DESCRIPTION = "EU AI Act Annex IV points 1 and 2, as 14 questions."


def collapse(s: str) -> str:
    return " ".join(s.split())


def annex_default() -> dict:
    """The Annex IV default v1 as an export input: the committed 14 questions, set "Annex IV" v1."""
    fixture = json.loads((FIXTURES / "annex_iv_default_form.json").read_text(encoding="utf-8"))
    items = []
    for q in fixture["questions"]:
        point = q["annexPoint"]
        items.append(
            {
                "setId": "annex-iv",
                "setName": "Annex IV",
                "setVersion": 1,
                "scope": f"annex-{point[0]}",
                "localId": point,
                "text": q["text"],
                "citation": q["citation"],
                "required": q["required"],
                "annexPoint": point,
                "groupLabel": "About the system" if point.startswith("1") else "How the system was built",
            }
        )
    return {
        "name": "Annex IV default",
        "description": ANNEX_DESCRIPTION,
        "version": 1,
        "blocks": list(BLOCKS),
        "items": items,
    }


def item(set_id="acme", set_name="Acme AI policy", version=1, local="q1", **wording) -> dict:
    out = {
        "setId": set_id,
        "setName": set_name,
        "setVersion": version,
        "scope": f"s-{set_id}",
        "localId": local,
        "text": "Who signs off a model release?",
        "citation": "Acme AI Policy §4.2",
        "required": True,
        "annexPoint": None,
        "groupLabel": None,
    }
    out.update(wording)
    return out


def expected_doc(q: dict, bundle: str) -> dict:
    """The expected document, key order included."""
    keys = ["setId", "setName", "setVersion", "scope", "localId"] + (WORDING if bundle == "self-contained" else [])
    return {
        "format": "aisc-questionnaire",
        "formatVersion": 1,
        "bundle": bundle,
        "name": q["name"],
        "description": q["description"],
        "version": q["version"],
        "blocks": q["blocks"],
        "items": [{k: i[k] for k in keys} for i in q["items"]],
    }


def dumped(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


# The file, exactly


class TestWrite:
    def test_t50_references_file_of_the_annex_iv_default_exactly(self):
        q = annex_default()
        out = write_questionnaire(q, "references")
        assert out.content == dumped(expected_doc(q, "references"))
        assert out.filename == "annex-iv-default-v1.questionnaire.json"
        assert out.content_type == "application/json; charset=utf-8"

    def test_t50_self_contained_file_of_the_annex_iv_default_exactly(self):
        q = annex_default()
        out = write_questionnaire(q, "self-contained")
        assert out.content == dumped(expected_doc(q, "self-contained"))
        assert out.filename == "annex-iv-default-v1.questionnaire.json"

    def test_t50_the_spec_example_first_item_literally(self):
        q = {**annex_default(), "items": annex_default()["items"][:1]}
        out = write_questionnaire(q, "references")
        assert out.content == (
            "{\n"
            '  "format": "aisc-questionnaire",\n'
            '  "formatVersion": 1,\n'
            '  "bundle": "references",\n'
            '  "name": "Annex IV default",\n'
            '  "description": "EU AI Act Annex IV points 1 and 2, as 14 questions.",\n'
            '  "version": 1,\n'
            '  "blocks": [\n'
            '    "description",\n'
            '    "targetUseCase",\n'
            '    "targetUsers",\n'
            '    "intendedDeployers",\n'
            '    "targetSystemTags",\n'
            '    "sectorTags",\n'
            '    "marketFormTags",\n'
            '    "localityTags",\n'
            '    "risks"\n'
            "  ],\n"
            '  "items": [\n'
            "    {\n"
            '      "setId": "annex-iv",\n'
            '      "setName": "Annex IV",\n'
            '      "setVersion": 1,\n'
            '      "scope": "annex-1",\n'
            '      "localId": "1a"\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )

    def test_t50_the_self_contained_twin_of_the_first_item(self):
        q = {**annex_default(), "items": annex_default()["items"][:1]}
        doc = json.loads(write_questionnaire(q, "self-contained").content)
        assert doc["items"][0] == {
            "setId": "annex-iv",
            "setName": "Annex IV",
            "setVersion": 1,
            "scope": "annex-1",
            "localId": "1a",
            "text": "If this version replaces an earlier one, describe what changed and why. If it is the first release, state that.",
            "citation": "Annex IV(1)(a)",
            "required": True,
            "annexPoint": "1a",
            "groupLabel": "About the system",
        }
        assert list(doc["items"][0]) == ["setId", "setName", "setVersion", "scope", "localId"] + WORDING

    def test_t50_top_level_key_order(self):
        doc = json.loads(write_questionnaire(annex_default(), "references").content)
        assert list(doc) == ["format", "formatVersion", "bundle", "name", "description", "version", "blocks", "items"]

    def test_t50_a_references_file_carries_no_wording_even_when_given_it(self):
        doc = json.loads(write_questionnaire(annex_default(), "references").content)
        for i in doc["items"]:
            assert list(i) == ["setId", "setName", "setVersion", "scope", "localId"]

    def test_t50_non_ascii_is_written_as_is(self):
        q = {"name": "Politique d'IA é", "description": "Données", "version": 2, "blocks": [], "items": [item(text="Qui signe ? «oui»")]}
        out = write_questionnaire(q, "self-contained")
        assert "Qui signe ? «oui»" in out.content
        assert "Données" in out.content
        assert out.content.endswith("}\n")

    def test_t50_the_filename_is_the_form_export_slug(self):
        from prefill.form_export import slug

        q = {"name": "Acme AI policy: Überblick", "description": "", "version": 3, "blocks": [], "items": []}
        out = write_questionnaire(q, "references")
        assert out.filename == f"{slug(q['name'])}-v3.questionnaire.json"
        assert out.filename == "acme-ai-policy-uberblick-v3.questionnaire.json"

    def test_t50_exported_file_has_filename_content_type_content(self):
        out = write_questionnaire({"name": "E", "description": "", "version": 1, "blocks": [], "items": []}, "references")
        assert isinstance(out.filename, str) and isinstance(out.content_type, str) and isinstance(out.content, str)


# Reading, with exact errors in check order


def ref_doc(**over) -> dict:
    doc = {
        "format": "aisc-questionnaire",
        "formatVersion": 1,
        "bundle": "references",
        "name": "Acme questionnaire",
        "description": "Acme's own.",
        "version": 2,
        "blocks": ["risks"],
        "items": [{"setId": "acme", "setName": "Acme AI policy", "setVersion": 1, "scope": "s-acme", "localId": "q1"}],
    }
    doc.update(over)
    return doc


def sc_doc(**item_over) -> dict:
    return ref_doc(bundle="self-contained", items=[item(**item_over)])


def raw(doc) -> bytes:
    return json.dumps(doc, ensure_ascii=False).encode("utf-8")


def refused(content: bytes, filename: str = "acme.questionnaire.json") -> str:
    with pytest.raises(QuestionnaireFileError) as err:
        read_questionnaire(content, filename)
    return str(err.value)


class TestRead:
    @pytest.mark.parametrize("name,ext", [("acme.csv", "csv"), ("acme.md", "md"), ("acme.docx", "docx")])
    def test_t51_another_extension_is_refused_naming_json(self, name, ext):
        assert refused(raw(ref_doc()), name) == f"{ext} is not a questionnaire file format: json"

    def test_t51_an_empty_file(self):
        assert refused(b"") == "the file is empty"

    @pytest.mark.parametrize("content", [b"{not json", b"\xff\xfe\x00{", b"questionnaire"])
    def test_t51_not_utf8_json(self, content):
        assert refused(content) == "this file is not JSON"

    @pytest.mark.parametrize("value", [[], "a string", 3, None])
    def test_t51_not_an_object(self, value):
        assert refused(json.dumps(value).encode()) == "a questionnaire file is a JSON object"

    @pytest.mark.parametrize(
        "over",
        [{"format": "aisc-form"}, {"formatVersion": 2}, {"formatVersion": "1"}, {"format": None}],
    )
    def test_t51_wrong_format_or_format_version(self, over):
        assert refused(raw(ref_doc(**over))) == (
            "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1"
        )

    def test_t51_missing_format(self):
        doc = ref_doc()
        del doc["format"]
        assert refused(raw(doc)) == "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1"

    @pytest.mark.parametrize("bundle", ["all", "", None, "Self-Contained"])
    def test_t51_a_bundle_nobody_defined(self, bundle):
        assert refused(raw(ref_doc(bundle=bundle))) == "bundle must be references or self-contained"

    @pytest.mark.parametrize("name", ["", "   ", "\n\t"])
    def test_t51_a_blank_name(self, name):
        assert refused(raw(ref_doc(name=name))) == "the questionnaire has no name"

    def test_t51_a_name_over_120_characters(self):
        assert refused(raw(ref_doc(name="n" * 121))) == "the questionnaire name is longer than 120 characters"

    def test_t51_a_name_of_120_after_collapsing_is_fine(self):
        out = read_questionnaire(raw(ref_doc(name="  " + "a " * 60)), "q.json")
        assert out["name"] == collapse("a " * 60)

    def test_t51_a_description_over_500_characters(self):
        assert refused(raw(ref_doc(description="d" * 501))) == "the description is longer than 500 characters"

    @pytest.mark.parametrize("version", [0, -1, 1.5, "2"])
    def test_t51_version_must_be_a_positive_whole_number(self, version):
        assert refused(raw(ref_doc(version=version))) == "version must be a positive whole number"

    def test_t51_an_unknown_block(self):
        assert refused(raw(ref_doc(blocks=["risks", "colour"]))) == "colour is not a block"

    def test_t51_a_block_listed_twice(self):
        assert refused(raw(ref_doc(blocks=["risks", "description", "risks"]))) == "risks is listed twice"

    def test_t51_more_than_200_items(self):
        items = [{"setId": "a", "setName": "", "setVersion": 1, "scope": "s-a", "localId": f"q{i}"} for i in range(201)]
        assert refused(raw(ref_doc(items=items))) == "a questionnaire has at most 200 questions"

    def test_t51_an_item_without_set_id(self):
        items = [ref_doc()["items"][0], {"setName": "X", "setVersion": 1, "scope": "s-x", "localId": "q1"}]
        assert refused(raw(ref_doc(items=items))) == "item 2 has no setId"

    @pytest.mark.parametrize("version", [None, 0, "1", 2.5])
    def test_t51_an_item_without_a_positive_set_version(self, version):
        it = {**ref_doc()["items"][0], "setVersion": version}
        assert refused(raw(ref_doc(items=[it]))) == "item 1 has no setVersion"

    @pytest.mark.parametrize(
        "scope,local",
        [("S-ACME", "q1"), ("s_acme", "q1"), ("s-acme", "q-1"), ("s-acme", ""), ("", "q1"), ("s-acme", "Q1")],
    )
    def test_t51_an_item_without_valid_scope_and_local_id(self, scope, local):
        it = {**ref_doc()["items"][0], "scope": scope, "localId": local}
        assert refused(raw(ref_doc(items=[it]))) == "item 1 has no valid scope and localId"

    def test_t51_an_item_twice(self):
        first = ref_doc()["items"][0]
        again = {**first, "setVersion": 2}
        assert refused(raw(ref_doc(items=[first, again]))) == "item 2 is in the file twice"

    @pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
    def test_t51_self_contained_text_length(self, text):
        assert refused(raw(sc_doc(text=text))) == "item 1: text must be 1 to 2000 characters"

    def test_t51_self_contained_citation_length(self):
        assert refused(raw(sc_doc(citation="c" * 201))) == "item 1: citation must be at most 200 characters"

    @pytest.mark.parametrize("required", ["yes", 1, None])
    def test_t51_self_contained_required_is_a_boolean(self, required):
        assert refused(raw(sc_doc(required=required))) == "item 1: required must be true or false"

    @pytest.mark.parametrize("point", ["3a", "", "2A"])
    def test_t51_self_contained_annex_point(self, point):
        assert refused(raw(sc_doc(annexPoint=point))) == (
            "item 1: annexPoint must be one of the 14 Annex IV points or null"
        )

    @pytest.mark.parametrize("label", ["g" * 121, 7])
    def test_t51_self_contained_group_label(self, label):
        assert refused(raw(sc_doc(groupLabel=label))) == (
            "item 1: groupLabel must be text of at most 120 characters or null"
        )

    def test_t51_a_references_file_does_not_check_wording(self):
        it = {**ref_doc()["items"][0], "text": "", "required": "maybe", "annexPoint": "9z"}
        out = read_questionnaire(raw(ref_doc(items=[it])), "q.json")
        assert out["items"][0] == {"setId": "acme", "setName": "Acme AI policy", "setVersion": 1, "scope": "s-acme", "localId": "q1"}

    # check order: the earlier check wins
    def test_t51_order_extension_before_emptiness(self):
        assert refused(b"", "acme.csv") == "csv is not a questionnaire file format: json"

    def test_t51_order_format_before_bundle_and_name(self):
        assert refused(raw(ref_doc(format="x", bundle="all", name=""))) == (
            "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1"
        )

    def test_t51_order_bundle_before_name(self):
        assert refused(raw(ref_doc(bundle="all", name=""))) == "bundle must be references or self-contained"

    def test_t51_order_name_before_description_version_blocks(self):
        assert refused(raw(ref_doc(name="", description="d" * 501, version=0, blocks=["x"]))) == (
            "the questionnaire has no name"
        )

    def test_t51_order_description_before_version(self):
        assert refused(raw(ref_doc(description="d" * 501, version=0))) == "the description is longer than 500 characters"

    def test_t51_order_version_before_blocks(self):
        assert refused(raw(ref_doc(version=0, blocks=["x"]))) == "version must be a positive whole number"

    def test_t51_order_blocks_before_items(self):
        assert refused(raw(ref_doc(blocks=["x"], items=[{"setName": ""}]))) == "x is not a block"

    # normalisation
    def test_t51_the_normalised_document(self):
        doc = {
            "format": "aisc-questionnaire",
            "formatVersion": 1,
            "bundle": "references",
            "name": "  Acme \n questionnaire ",
            "version": 2,
            "blocks": ["description", "risks"],
            "items": [
                {"setId": "acme", "setVersion": 1, "scope": "s-acme", "localId": "q1", "text": "dropped"},
            ],
        }
        out = read_questionnaire(raw(doc), "acme.questionnaire.json")
        assert out["bundle"] == "references"
        assert out["name"] == "Acme questionnaire"
        assert out["description"] == ""
        assert out["version"] == 2
        assert out["blocks"] == ["description", "risks"]
        assert out["items"] == [{"setId": "acme", "setName": "", "setVersion": 1, "scope": "s-acme", "localId": "q1"}]

    def test_t51_a_self_contained_file_keeps_its_wording(self):
        out = read_questionnaire(raw(sc_doc(annexPoint="2g", groupLabel="Policy")), "q.json")
        assert out["bundle"] == "self-contained"
        assert out["items"][0] == item(annexPoint="2g", groupLabel="Policy")

    def test_t51_zero_items_and_zero_blocks_are_fine(self):
        out = read_questionnaire(raw(ref_doc(items=[], blocks=[])), "q.json")
        assert out["items"] == [] and out["blocks"] == []


# The round trip


def normalised(q: dict, bundle: str) -> dict:
    keys = ["setId", "setName", "setVersion", "scope", "localId"] + (WORDING if bundle == "self-contained" else [])
    items = []
    for i in q["items"]:
        x = {k: i[k] for k in keys}
        if bundle == "self-contained":
            x["text"] = collapse(x["text"])
        items.append(x)
    return {
        "name": collapse(q["name"]),
        "description": q["description"],
        "version": q["version"],
        "blocks": q["blocks"],
        "items": items,
    }


def fields_of_q(out: dict) -> dict:
    return {k: out[k] for k in ["name", "description", "version", "blocks", "items"]}


def three_sets_200() -> dict:
    sets = [("alpha", "Alpha règles"), ("beta", 'Beta "quoted"'), ("gamma", "Gamma \\ back")]
    points = [None, "1a", "2g", "2h"]
    items = []
    for n in range(200):
        set_id, set_name = sets[n % 3]
        items.append(
            {
                "setId": set_id,
                "setName": set_name,
                "setVersion": 1 + n % 2,
                "scope": f"s-{set_id}",
                "localId": f"q{n}",
                "text": f'Question {n}: «données» "quoted" back\\slash\nsecond line\r\nthird',
                "citation": f"§{n} ü",
                "required": n % 2 == 0,
                "annexPoint": points[n % 4],
                "groupLabel": None if n % 5 else "Grüppe",
            }
        )
    return {"name": "Three sets, 200 items é", "description": 'Mixed "and" \\ odd', "version": 7, "blocks": ["risks"], "items": items}


CASES = {
    "annex-iv-default": annex_default,
    "three-sets-200": three_sets_200,
    "empty": lambda: {"name": "Empty", "description": "", "version": 1, "blocks": [], "items": []},
}


@pytest.mark.parametrize("bundle", ["references", "self-contained"])
@pytest.mark.parametrize("case", list(CASES))
def test_t52_write_then_read_is_the_same_questionnaire(case, bundle):
    q = CASES[case]()
    out = write_questionnaire(q, bundle)
    back = read_questionnaire(out.content.encode("utf-8"), out.filename)
    assert back["bundle"] == bundle
    assert fields_of_q(back) == normalised(q, bundle)


# No model


def test_t61_questionnaire_file_imports_only_the_standard_library_and_this_package():
    import ast
    import sys

    source = Path(__file__).resolve().parents[1] / "prefill" / "questionnaire_file.py"
    assert source.exists(), source
    names = set()
    for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names.add(node.module.split(".")[0])
    outside = {n for n in names if n not in sys.stdlib_module_names and n not in {"prefill", "__future__"}}
    assert outside == set()
