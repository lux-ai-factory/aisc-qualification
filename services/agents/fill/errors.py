"""A run's error as a reader may see it (as control-objectives risk_mapping.safe_error).

The card's fill status is read by anyone who may read the project, through the web app's
GET /p/{pid}/api/qualifications/{id}/fill. A model client's exception can quote the request URL
with its `?key=`, an Authorization header, or the provider's message about the key. So what is
kept for the status is cut short and anything that looks like a credential is taken out first;
the full text goes only to the service's log.
"""
from __future__ import annotations

import re

#: How much of an error a reader is shown.
ERROR_CHARS = 300
_REDACTED = "[redacted]"
_KEY_LIKE = (
    # `Bearer <token>`, `Basic <credentials>`
    (re.compile(r"(?i)\b(bearer|basic)\s+[^\s,;]+"), r"\1 " + _REDACTED),
    # `key=...`, `api_key: ...`, `token=...`, `password=...` and the like
    (re.compile(r"(?i)\b([a-z_-]*(?:key|token|secret|password|passwd|pwd|signature|sig|auth|authorization"
                r"|credentials?))(\s*[=:]\s*)(?!\[redacted\])[^\s&,;]+"),
     r"\1\2" + _REDACTED),
    # `scheme://user:password@host`
    (re.compile(r"://[^/\s:@]+:[^/\s@]+@"), "://" + _REDACTED + "@"),
    # the providers' own key shapes: sk-..., xai-..., gsk_..., hf_..., AIza...
    (re.compile(r"\b(?:sk|pk|rk|xai|gsk|hf|ghp|glpat)[-_][A-Za-z0-9_-]{8,}"), _REDACTED),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{10,}"), _REDACTED),
    # any other long run of letters and digits together
    (re.compile(r"\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}"), _REDACTED),
)


def safe_error(text: str) -> str:
    """An error as a reader may see it: key-like parts taken out, then cut short."""
    out = re.sub(r"\s+", " ", text or "").strip()
    for pattern, replacement in _KEY_LIKE:
        out = pattern.sub(replacement, out)
    return out if len(out) <= ERROR_CHARS else out[: ERROR_CHARS - 3].rstrip() + "..."
