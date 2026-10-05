"""pypdf 5.1.0 let a crafted PDF stall the reader (CVE-2025-55197 and others, security review
2026-10-05); any signed-in person can upload one to prefill. The pinned and installed versions are 6."""
from pathlib import Path

import pypdf


def test_pinned_and_installed_pypdf_is_6_or_later():
    pinned = next(line for line in (Path(__file__).parents[1] / "requirements.txt").read_text().splitlines()
                  if line.startswith("pypdf=="))
    assert int(pinned.split("==")[1].split(".")[0]) >= 6, pinned
    assert int(pypdf.__version__.split(".")[0]) >= 6, pypdf.__version__
