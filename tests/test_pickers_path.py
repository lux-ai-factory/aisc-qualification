"""The shared vocabulary must resolve both in the repo and inside the container,
where the package sits at /app/airo_min and there is no ../../src/data above it."""

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


def test_the_container_layout_has_no_app_root_above_it():
    """In the image the package is /app/airo_min and data/ is copied in beside
    it, so no ancestor carries data/: the missing app root is an ordinary
    absence, not an error."""
    from airo_min.pickers import app_root_for

    assert app_root_for(Path("/app/airo_min")) is None


def test_the_repo_layout_finds_the_app_root(tmp_path):
    """The app root is the ancestor carrying data/, wherever the package sits."""
    from airo_min.pickers import app_root_for

    (tmp_path / "data").mkdir()
    package = tmp_path / "src" / "airo_min"
    package.mkdir(parents=True)
    assert app_root_for(package) == tmp_path


def test_candidate_paths_work_without_an_app_root(monkeypatch):
    from airo_min import pickers

    monkeypatch.setattr(pickers, "_APP_ROOT", None)
    monkeypatch.setattr(pickers, "_PACKAGE", Path("/app/airo_min"))
    monkeypatch.delenv("AIRO_VOCAB_PATH", raising=False)
    assert [str(p) for p in pickers.candidate_paths()] == ["/app/airo_min/airo_vocab.json"]
