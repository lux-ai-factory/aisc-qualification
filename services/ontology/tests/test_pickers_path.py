"""The shared vocabulary must resolve both in the repo and inside the container,
where the package sits at /app/airo_min and there is no ../../src/data above it."""
import os
from pathlib import Path

from airo_min.pickers import candidate_paths, load_vocab


def test_the_repo_layout_resolves():
    found = [p for p in candidate_paths() if p.exists()]
    assert found, [str(p) for p in candidate_paths()]
    assert found[0].name == "airo_vocab.json"


def test_a_copy_beside_the_package_is_a_candidate_for_the_container():
    names = [str(p) for p in candidate_paths()]
    assert any(p.endswith("airo_min/airo_vocab.json") for p in names), names


def test_an_env_override_wins(tmp_path, monkeypatch):
    custom = tmp_path / "airo_vocab.json"
    custom.write_text('{"marketForm": [], "locality": [], "impactArea": [], "affected": []}')
    monkeypatch.setenv("AIRO_VOCAB_PATH", str(custom))
    assert candidate_paths()[0] == custom
    assert load_vocab() == {
        "marketForm": [],
        "locality": [],
        "impactArea": [],
        "affected": [],
    }


def test_a_missing_file_says_where_it_looked(tmp_path, monkeypatch):
    monkeypatch.setenv("AIRO_VOCAB_PATH", str(tmp_path / "nope.json"))
    monkeypatch.setattr("airo_min.pickers._PACKAGE", tmp_path)
    monkeypatch.setattr("airo_min.pickers._APP_ROOT", tmp_path)
    try:
        load_vocab()
    except FileNotFoundError as exc:
        assert "nope.json" in str(exc)
    else:
        raise AssertionError("expected FileNotFoundError")
