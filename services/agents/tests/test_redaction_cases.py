"""The agents keep a copy of the shared shown-error rule (fill/errors.py), since they cannot import aisc_redact:
the copy runs the shared vectors, redaction-cases.json (shared/identity), and gives the same answers.

The vectors are read from AISC_REDACTION_CASES, else from the checkout this app sits in; a copy of the app on its
own has neither, and the test says so as a skip."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from fill.errors import shown_error


def _cases_file() -> Path | None:
    named = os.environ.get("AISC_REDACTION_CASES")
    if named:
        return Path(named)
    in_checkout = Path(__file__).resolve().parents[5] / "shared/identity/redaction-cases.json"
    return in_checkout if in_checkout.is_file() else None


CASES_FILE = _cases_file()
CASES = json.loads(CASES_FILE.read_text())["shown_error"] if CASES_FILE else []


@pytest.mark.skipif(CASES_FILE is None, reason="no redaction-cases.json: this app is not inside an AISC checkout")
@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_the_copy_shows_an_error_as_the_shared_vectors_say(case):
    assert shown_error(case["in"], case["limit"]) == case["out"]
