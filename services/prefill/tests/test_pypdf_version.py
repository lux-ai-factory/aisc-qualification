"""pypdf 5.1.0 let a crafted PDF stall the reader (CVE-2025-55197 and others, security review
2026-10-05); any signed-in person can upload one to prefill. The pinned and installed versions are 6."""
from pathlib import Path

import pypdf


def _pypdf_spec() -> str:
    """The service's pypdf requirement, from the uv project the deps are locked by."""
    text = (Path(__file__).parents[1] / "pyproject.toml").read_text()
    return next(
        line.strip().strip('",')
        for line in text.splitlines()
        if "pypdf" in line
    )


def test_pinned_and_installed_pypdf_is_6_or_later():
    spec = _pypdf_spec()
    assert spec.startswith("pypdf>="), spec
    minimum = int(spec.split(">=")[1].split(".")[0])
    assert minimum >= 6, spec
    assert int(pypdf.__version__.split(".")[0]) >= 6, pypdf.__version__
