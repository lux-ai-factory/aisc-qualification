"""The writer's and the critic's prompts, built from the markdown on disk.

They are files rather than string literals so that someone who is not a Python
developer can change how the drafting and the review behave, and so a change to
either is a reviewable diff of prose.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Sequence

from .models import CITATION_OF, Draft, Finding, Property

_SERVICE = Path(__file__).resolve().parent.parent
def candidate_paths(name: str) -> list[Path]:
    """Where a prompt may live, most specific first.

    The drafting prompt is maintained next to the ontology service, whose
    vocabulary it is about, and read from there rather than copied here where
    the two would drift apart. The last entry is the container layout, where it
    is copied in beside the package at build time.
    """
    override = os.environ.get("FILL_PROMPTS_PATH")
    paths = []
    if override:
        paths.append(Path(override) / f"{name}.md")
    paths.append(_SERVICE / "prompts" / f"{name}.md")
    paths.append(_SERVICE.parent / "ontology" / "prompts" / f"{name}.md")
    paths.append(_SERVICE / "ontology-prompts" / f"{name}.md")
    return paths


def prompt_text(name: str) -> str:
    """One prompt's body, with its front matter stripped."""
    tried = candidate_paths(name)
    for path in tried:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            return re.sub(
                r"^---\s*\n.*?\n---\s*\n", "", text, count=1, flags=re.DOTALL
            )
    raise FileNotFoundError(
        f"prompt {name!r} not found; looked in: " + ", ".join(str(p) for p in tried)
    )


def writer_prompt(
    prop: Property,
    source: str,
    terms: list[str],
    findings: Sequence[Finding] = (),
) -> tuple[str, str]:
    system = prompt_text("filling-the-airo-ontology")
    parts = [
        f"Property: {prop}",
        f"Source answer ({CITATION_OF.get(prop) or 'the risk rows'}):",
        source.strip() or "(left blank)",
        "",
        f"The {len(terms)} terms available for this property, and no others:",
        ", ".join(terms),
    ]
    if findings:
        parts += [
            "",
            "A review of your previous draft raised these. Re-propose only the",
            "nodes named, keeping the rest as they were:",
            *(f"- {f}" for f in findings),
        ]
    parts += [
        "",
        'Answer with JSON only: {"nodes": [{"label": "...", "vair": "..."}]}.',
        'Use null for vair when no term fits. An empty list is a valid answer if',
        "the source says nothing about this property.",
    ]
    return system, "\n".join(parts)


def critic_prompt(draft: Draft, source: str) -> tuple[str, str]:
    system = prompt_text("reviewing-an-ontology-draft")
    nodes = "\n".join(
        f'- {n.id}: label={n.label!r} vair={n.vair!r}' for n in draft.nodes
    )
    user = "\n".join(
        [
            f"Property: {draft.prop}",
            "Source answer:",
            source.strip() or "(left blank)",
            "",
            "The draft:",
            nodes or "(no nodes proposed)",
        ]
    )
    return system, user
