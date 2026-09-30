"""The form's VAIR lists (2026-09-30): one file, generated from vair.ttl, read by the form.

The form offers VAIR wherever VAIR has a vocabulary for a field, so what it offers must be
exactly what the builder accepts. The file is generated, and this test fails when it drifts.
"""
import json

from airo_min.vair_terms import is_term_for, terms_for
from airo_min.vair_vocab import FORM_CLASSES, MODEL_TERMS, VOCAB_PATH, form_vocab, label_of


def test_the_committed_file_is_what_vair_ttl_gives():
    assert json.loads(VOCAB_PATH.read_text(encoding="utf-8")) == form_vocab(), (
        "src/data/vair_vocab.json is stale: run python -m airo_min.vair_vocab --write"
    )


def test_every_form_class_offers_every_term_the_builder_accepts_and_no_other():
    classes = form_vocab()["classes"]
    assert set(classes) == set(FORM_CLASSES)
    for cls, entries in classes.items():
        ids = [e["id"] for e in entries]
        assert sorted(ids) == terms_for(cls), cls
        assert all(is_term_for(cls, i) for i in ids)


def test_each_term_has_a_readable_label_and_its_definition():
    for entries in form_vocab()["classes"].values():
        for e in entries:
            assert e["label"].strip() and e["label"] != "", e
            assert isinstance(e["definition"], str)
    assert label_of("DecisionTree") == "Decision Tree"
    assert label_of("RightToNondiscrimination") == "Right To Non-discrimination"


def test_a_label_is_the_english_one_not_a_source_citation():
    # Robot and MultiAgentSystem carry a second, untagged rdfs:label that is a citation.
    assert label_of("Robot") == "Robot"
    assert label_of("MultiAgentSystem") == "Multi Agent System"


def test_entries_are_in_label_order_so_the_form_reads_alphabetically():
    for entries in form_vocab()["classes"].values():
        labels = [e["label"].casefold() for e in entries]
        assert labels == sorted(labels)


def test_the_model_terms_are_vair_s_model_and_everything_under_it():
    assert MODEL_TERMS == frozenset(
        {"Model", "BayesianNetwork", "DecisionTree", "MachineLearningModel", "TrainedModel"}
    )
    assert sorted(form_vocab()["modelTerms"]) == sorted(MODEL_TERMS)
    # VAIR files neural networks under Algorithm, not Model.
    assert "NeuralNetwork" not in MODEL_TERMS
