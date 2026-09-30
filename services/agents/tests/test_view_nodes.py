"""The card view keeps its nodes in the system, the rows and the risk chains; the filler reads all of them."""
from fill.view_nodes import nodes_of
from tests.views import MCAS_VIEW


def _ids():
    return [n["id"] for n in nodes_of(MCAS_VIEW)]


def test_the_real_view_has_no_flat_node_list():
    assert "nodes" not in MCAS_VIEW


def test_every_node_of_the_system_the_rows_and_the_chains_is_read():
    ids = set(_ids())
    assert {"system", "purpose", "provider", "deployer", "users", "technique0"} <= ids
    assert {"risk0", "risk0_source", "risk0_vulnerability", "risk0_consequence", "risk0_impact",
            "risk0_control", "risk0_control_followup", "subject_NaturalPerson", "area_Right"} <= ids


def test_a_node_shown_in_several_places_is_read_once():
    ids = _ids()
    assert len(ids) == len(set(ids)) and ids.count("users") == 1


def test_an_empty_slot_or_a_missing_part_is_no_node():
    assert nodes_of({"system": None, "rows": [], "chains": [{"risk": None, "areas": []}]}) == []
    assert nodes_of({}) == []
