"""The 14 Annex IV points, shared with the app as src/data/annexPoints.json.

Form-assembly spec (docs/superpowers/form-assembly-2026-09-24/01-spec.md), R2.
The loader has the same three places as airo_min/pickers.py: $ANNEX_POINTS_PATH,
the repo layout, then a copy beside the package (the image's Dockerfile COPY).
"""
import importlib
import json
from pathlib import Path

import pytest

from airo_min.build import _annex_citation

APP = Path(__file__).resolve().parents[3]
SHARED = APP / "src" / "data" / "annexPoints.json"


@pytest.fixture()
def ap():
    """airo_min.annex_points, imported per test: until it exists each test fails
    on the ImportError and the rest of the suite still runs."""
    return importlib.import_module("airo_min.annex_points")


def test_r2_the_repo_layout_resolves_to_the_shared_file(ap, monkeypatch):
    monkeypatch.delenv("ANNEX_POINTS_PATH", raising=False)
    found = [p for p in ap.candidate_paths() if p.exists()]
    assert found, [str(p) for p in ap.candidate_paths()]
    assert found[0].resolve() == SHARED.resolve()


def test_r2_the_points_are_the_json_file(ap, monkeypatch):
    monkeypatch.delenv("ANNEX_POINTS_PATH", raising=False)
    points = json.loads(SHARED.read_text(encoding="utf-8"))["points"]
    assert ap.ANNEX_POINTS == points
    assert ap.load_annex_points() == points
    assert [p["id"] for p in ap.ANNEX_POINTS] == [
        "1a", "1b", "1c", "1de", "1f", "1gh",
        "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h",
    ]


def test_r2_every_citation_equals_the_one_the_builder_rebuilds_from_the_id(ap):
    for point in ap.ANNEX_POINTS:
        assert ap.annex_citation(point["id"]) == _annex_citation({"questionId": point["id"]})
        assert ap.annex_citation(point["id"]) == point["citation"]


def test_r2_an_id_that_is_not_one_of_the_14_has_no_citation(ap):
    with pytest.raises((KeyError, ValueError)):
        ap.annex_citation("3a")


def test_r2_a_copy_beside_the_package_is_a_candidate_for_the_container(ap):
    names = [str(p) for p in ap.candidate_paths()]
    assert any(p.endswith("airo_min/annex_points.json") for p in names), names


def test_r2_an_env_override_wins(ap, tmp_path, monkeypatch):
    custom = tmp_path / "annex_points.json"
    custom.write_text('{"points": [{"id": "1a", "citation": "Annex IV(1)(a)"}]}')
    monkeypatch.setenv("ANNEX_POINTS_PATH", str(custom))
    assert ap.candidate_paths()[0] == custom
    assert ap.load_annex_points() == [{"id": "1a", "citation": "Annex IV(1)(a)"}]


def test_r2_a_missing_file_says_every_place_it_looked(ap, tmp_path, monkeypatch):
    missing = tmp_path / "nope.json"
    monkeypatch.setenv("ANNEX_POINTS_PATH", str(missing))
    monkeypatch.setattr("airo_min.annex_points._PACKAGE", tmp_path / "pkg")
    monkeypatch.setattr("airo_min.annex_points._APP_ROOT", tmp_path / "app")
    with pytest.raises(FileNotFoundError) as refused:
        ap.load_annex_points()
    message = str(refused.value)
    for place in ap.candidate_paths():
        assert str(place) in message
    assert "nope.json" in message


def test_r2_the_dockerfile_copies_the_shared_file_beside_the_package():
    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY src/data/annexPoints.json ./airo_min/annex_points.json" in dockerfile
