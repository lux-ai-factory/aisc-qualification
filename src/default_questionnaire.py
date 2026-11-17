"""The default questionnaire (Annex IV default), owned by this service.

Resolved from the reference app's builtin (`annexDefaultVersion()` on
feat/unified-modules) and vendored as JSON: user questionnaires live in the
backend (versioned there), but the default ships with the service so a fresh
project can answer immediately, and a build with no questionnaire still has a
definition to build against.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DEFAULT_QUESTIONNAIRE_ID = "annex-iv-default"

_DEFINITION_PATH = Path(__file__).resolve().parent / "default_questionnaire.json"


@lru_cache(maxsize=1)
def load_default_definition() -> dict[str, Any]:
    with open(_DEFINITION_PATH, encoding="utf-8") as fh:
        return json.load(fh)
