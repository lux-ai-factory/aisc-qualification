"""Which VAIR terms we offer, and for which AIRO class.

VAIR nests: vair:Police is a subclass of vair:EmergencyServiceProvider, which is a
subclass of airo:AIOperator. Reading only an AIRO class's direct children offered
136 of the 331 terms that sit under our schema's classes. The gaps were not
cosmetic: Purpose showed 27 of 122, hiding vair:AssessingCreditworthiness and
vair:DeterminingCreditScore, which is exactly what a credit-scoring system does.

The counts below are an inventory of VAIR 1.0 as vendored. They are asserted so a
change in the file, or in how we read it, shows up as a number rather than as a
silently shorter dropdown.
"""
import hashlib
from pathlib import Path

import pytest

from airo_min.schema import CLASSES
from airo_min.vair_terms import (
    DANGLING,
    MISPREFIXED,
    every_vair_term,
    terms_for,
    terms_reachable_from_airo,
    typeable_classes,
    vocabularies,
)

ROOT = Path(__file__).resolve().parents[1]


class TestTheVendoredFilesAreUpstream:
    """Byte-identical to DelaramGlp/airo@main and DelaramGlp/vair@main, checked
    2026-09-11. A local edit to either file is a licence and provenance problem,
    not a refactor, so it fails here rather than being discovered later."""

    @pytest.mark.parametrize(
        "name,digest",
        [
            ("airo.ttl", "6274d2d8711e046cf38f1b5b2980188094d4aa87b5af79804005a06468fd8469"),
            ("vair.ttl", "6b42323726e7a82a5c4782a6d9398fc44db21bd4e0ca9fd4807558190c173605"),
        ],
    )
    def test_the_file_is_unmodified(self, name, digest):
        data = (ROOT / "airo" / name).read_bytes()
        assert hashlib.sha256(data).hexdigest() == digest


class TestInventory:
    def test_how_many_terms_vair_defines(self):
        assert len(every_vair_term()) == 524

    def test_how_many_are_reachable_from_any_airo_class(self):
        assert len(terms_reachable_from_airo()) == 421

    def test_how_many_sit_under_our_own_schema(self):
        offered = {t for terms in vocabularies().values() for t in terms}
        assert len(offered) == 331

    def test_the_terms_vair_leaves_hanging(self):
        # No rdfs:subClassOf at all, so no AIRO class can reach them: superseded
        # spellings (SVM, EmergancyTriage) and Act roles left unparented
        # (AuthorisedRepresentative, NotifiedBody, Distributor, Importer).
        assert len(DANGLING) == 101
        for name in ("SVM", "EmergancyTriage", "Distributor", "NotifiedBody",
                     "SmallScaleProvider", "AuthorisedRepresentative"):
            assert name in DANGLING

    def test_the_terms_vair_declares_under_the_wrong_base(self):
        # VAIR's @base is http://www.semanticweb.org/owl/owlapi/turtle#, and 17
        # terms landed there instead of in the vair namespace. 16 have a correct
        # twin; API does not, so no IRI in the vair namespace names it.
        assert len(MISPREFIXED) == 17
        assert MISPREFIXED["API"]["twin"] is False
        assert MISPREFIXED["API"]["parent"] == "AIComponent"
        assert sum(1 for m in MISPREFIXED.values() if m["twin"]) == 16


class TestNesting:
    def test_a_grandchild_term_is_offered(self):
        operators = terms_for("AIOperator")
        assert "EmergencyServiceProvider" in operators  # direct child
        assert "Police" in operators  # child of that child
        assert "FireBrigade" in operators
        assert len(operators) == 17

    @pytest.mark.parametrize(
        "cls,term",
        [
            ("Purpose", "AssessingCreditworthiness"),
            ("Purpose", "DeterminingCreditScore"),
            ("AITechnique", "DeepLearning"),
            ("AIComponent", "DecisionTree"),
            ("RiskSource", "BiasedTrainingData"),
            ("RiskControl", "HumanOversightMeasure"),
            ("AICapability", "FaceRecognition"),
            ("AISystem", "IndustrialRobot"),
            ("AreaOfImpact", "PhysicalHealth"),
            ("Impact", "PhysicalInjury"),
        ],
    )
    def test_the_terms_a_qualification_needs_are_reachable(self, cls, term):
        assert term in terms_for(cls), f"{term} missing from {cls}"

    def test_every_class_in_the_schema_has_an_entry(self):
        assert set(vocabularies()) == set(CLASSES)

    def test_a_class_vair_does_not_subdivide_comes_back_empty(self):
        # How the card tells "a term is missing" from "no term can exist".
        for cls in ("Risk", "Vulnerability", "AIUser", "Stakeholder", "RiskConcept"):
            assert terms_for(cls) == []

    def test_the_lists_are_sorted_and_free_of_duplicates(self):
        for terms in vocabularies().values():
            assert terms == sorted(set(terms))

    def test_the_typeable_classes_are_exactly_those_with_terms(self):
        assert typeable_classes() == frozenset(
            cls for cls, terms in vocabularies().items() if terms
        )


class TestPrecision:
    """A term belongs to one AIRO class. Offering all of VAIR is only useful if
    using it stays exact."""

    def test_a_term_from_another_class_is_not_offered(self):
        assert "Police" not in terms_for("Purpose")
        assert "DeepLearning" not in terms_for("AIComponent")
        assert "PhysicalInjury" not in terms_for("Consequence")

    def test_a_term_vair_leaves_hanging_is_never_offered(self):
        offered = {t for terms in vocabularies().values() for t in terms}
        assert offered.isdisjoint(DANGLING)

    def test_the_mis_prefixed_api_is_not_offered_as_a_component(self):
        # It is not addressable in the vair namespace, so the builder could not
        # write it even if the UI offered it.
        assert "API" not in terms_for("AIComponent")

    def test_an_unknown_class_asks_plainly(self):
        with pytest.raises(KeyError):
            terms_for("NotAnAiroClass")


class TestTheBuilderIsExact:
    """A term names one kind of thing. The builder used to accept any name in the
    VAIR namespace for any class, so a Purpose node could be typed vair:Police,
    and one of VAIR's 101 dangling names could be written into a graph."""

    def _parts(self):
        import json

        examples = ROOT / "examples"
        return (
            json.loads((examples / "mcas.qualification.json").read_text(encoding="utf-8")),
            json.loads((examples / "mcas.extracted.json").read_text(encoding="utf-8")),
        )

    def test_a_term_from_another_class_is_refused(self):
        from airo_min.build import build_graph

        q, e = self._parts()
        e = dict(e, types=dict(e.get("types") or {}, purpose="Police"))
        with pytest.raises(ValueError, match="Police"):
            build_graph(q, e)

    def test_a_dangling_term_is_refused(self):
        from airo_min.build import build_graph

        q, e = self._parts()
        e = dict(e, types=dict(e.get("types") or {}, purpose="SVM"))
        with pytest.raises(ValueError, match="SVM"):
            build_graph(q, e)

    def test_a_term_that_does_belong_to_the_class_is_written(self):
        from rdflib import RDF, URIRef

        from airo_min.build import build_graph

        q, e = self._parts()
        e = dict(e, types=dict(e.get("types") or {}, purpose="AssessingCreditworthiness"))
        g = build_graph(q, e)
        assert (
            None,
            RDF.type,
            URIRef("https://w3id.org/vair#AssessingCreditworthiness"),
        ) in g

    def test_a_reviewer_cannot_patch_in_a_term_from_another_class(self):
        from airo_min.build import build_graph
        from airo_min.patch import apply_patch

        q, e = self._parts()
        g = build_graph(q, e)
        with pytest.raises(ValueError, match="Police"):
            apply_patch(g, {"purpose": {"vair": "Police"}})

    def test_a_reviewer_can_patch_in_a_term_that_fits(self):
        from airo_min.build import build_graph
        from airo_min.patch import apply_patch

        q, e = self._parts()
        g = build_graph(q, e)
        apply_patch(g, {"deployer": {"vair": "PublicAuthority"}})
