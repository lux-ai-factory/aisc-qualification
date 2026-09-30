"""Headings that open a section of rows rather than an answer.

On their own so the readers that stop at them (fields, risks, components) can
all import them without importing each other.
"""
from __future__ import annotations

import re

#: The heading that opens the Components block's rows (targets plan v2).
COMPONENTS_HEADING = re.compile(
    r"^\s*#*\s*(?:components|system components|components of the system)\s*:?\s*$",
    re.IGNORECASE,
)
