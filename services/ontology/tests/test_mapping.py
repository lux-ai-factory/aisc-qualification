"""The form can fill the ontology: every property has a form source, and each source
lands on a subject/target pair the schema permits."""
from airo_min.mapping import FORM_MAPPING
from airo_min.schema import CLASSES, PROPERTIES, is_a


def test_every_property_in_the_schema_has_a_form_source():
    covered = {m.property for m in FORM_MAPPING}
    missing = set(PROPERTIES) - covered
    assert missing == set(), f"no form source for: {sorted(missing)}"


def test_every_mapping_names_a_real_property_and_real_classes():
    for m in FORM_MAPPING:
        assert m.property in PROPERTIES, m
        assert m.subject in CLASSES, m
        assert m.target in CLASSES, m


def test_every_mapping_respects_domain_and_range():
    for m in FORM_MAPPING:
        domains, rng = PROPERTIES[m.property]
        if domains:
            assert any(is_a(m.subject, d) for d in domains), (m.field, m.property, m.subject)
        assert is_a(m.target, rng), (m.field, m.property, m.target)


def test_every_mapping_cites_the_ai_act():
    for m in FORM_MAPPING:
        assert m.reference.startswith(("Art ", "Annex ")), m


def test_the_new_form_elements_are_present():
    fields = {m.field for m in FORM_MAPPING}
    for f in (
        "marketFormTags",
        "localityTags",
        "intendedDeployers",
        "risk:*:risk",
        "risk:*:source",
        "risk:*:vulnerability",
        "risk:*:consequence",
        "risk:*:affected",
        "risk:*:area",
        "risk:*:control",
        "risk:*:followUpControl",
    ):
        assert f in fields, f
