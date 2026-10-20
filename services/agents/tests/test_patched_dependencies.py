"""The pinned web stack carries the fixes for the advisories pip-audit reports against
starlette 0.41.3, which fastapi 0.115.5 brought, the same ones controls' own
tests/test_patched_dependencies.py guards against. The installed version, as requirements.txt
pins it, not only a range."""
from importlib.metadata import version

import pytest

MINIMUM = {"starlette": "1.3.1"}


def parts(v: str) -> tuple[int, ...]:
    return tuple(int(p) for p in v.split(".")[:3] if p.isdigit())


@pytest.mark.parametrize("name, minimum", sorted(MINIMUM.items()))
def test_a_patched_release_is_installed(name, minimum):
    assert parts(version(name)) >= parts(minimum), f"{name} {version(name)} < {minimum}"


def test_the_model_clients_are_pinned():
    """openai, anthropic and ollama are pinned exactly, so an image rebuild cannot change them."""
    from pathlib import Path

    lines = (Path(__file__).resolve().parents[1] / "requirements.txt").read_text().splitlines()
    for pkg in ("openai", "anthropic", "ollama"):
        line = next(ln for ln in lines if ln.split("==")[0].split(">=")[0].strip() == pkg)
        assert "==" in line, line
