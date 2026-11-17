"""The VAIR term lists, generated from the vendored vair.ttl.

The builder reads the TTL directly; this module writes the derived list file to
data/vair_vocab.json (via --write) as the drift check and for any caller that
wants lists without parsing Turtle:

    python -m airo_min.vair_vocab --write

Each entry is {"id", "label", "definition"}: the VAIR local name, its English rdfs:label and its
rdfs:comment, in label order.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from rdflib import RDFS, URIRef

from .pickers import app_root_for
from .vair_terms import VAIR, _descendants, _graph, terms_for

#: The AIRO classes a form field takes its VAIR list from, in form order.
FORM_CLASSES: tuple[str, ...] = (
    "AISystem",  # System type
    "Purpose",  # Purpose
    "AICapability",  # Capabilities
    "Domain",  # Sectors
    "Modality",  # How the system reaches the market
    "LocalityOfUse",  # Where the system is used
    "AIOperator",  # Provider and deployer
    "AISubject",  # Risk: who is affected
    "AIComponent",  # Component type
    "RiskSource",  # Risk: what causes it
    "Consequence",  # Risk: what happens as a result
    "Impact",  # Risk: the harm
    "AreaOfImpact",  # Risk: what is affected
    "RiskControl",  # Risk: the measure and the follow-up
)

#: The AIComponent terms that are models: vair:Model and everything under it. A component of one of
#: these types is an airo:AIModel, which the system has by hasModel. VAIR files neural networks
#: under Algorithm, not Model, and this follows VAIR.
MODEL_TERMS: frozenset[str] = frozenset(
    {"Model"} | {str(t)[len(VAIR) :] for t in _descendants(frozenset({URIRef(VAIR + "Model")}))}
)

_PACKAGE = Path(__file__).resolve().parent
_APP_ROOT = app_root_for(_PACKAGE)
VOCAB_PATH: Path = (
    _APP_ROOT / "data" / "vair_vocab.json"
    if _APP_ROOT is not None
    else _PACKAGE / "vair_vocab.json"
)


def _spaced(name: str) -> str:
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)


def label_of(term: str) -> str:
    """The term's English label. Two terms carry a second, untagged label that is a source
    citation, so the language-tagged one wins; a term with none is spelled out from its name."""
    labels = list(_graph().objects(URIRef(VAIR + term), RDFS.label))
    english = [str(label) for label in labels if getattr(label, "language", None) == "en"]
    if english:
        return " ".join(english[0].split())
    return _spaced(term)


def definition_of(term: str) -> str:
    comments = [str(c) for c in _graph().objects(URIRef(VAIR + term), RDFS.comment)]
    return " ".join(comments[0].split()) if comments else ""


@lru_cache(maxsize=1)
def form_vocab() -> dict:
    classes = {
        cls: sorted(
            (
                {"id": t, "label": label_of(t), "definition": definition_of(t)}
                for t in terms_for(cls)
            ),
            key=lambda e: (e["label"].casefold(), e["id"]),
        )
        for cls in FORM_CLASSES
    }
    return {
        "_comment": (
            "Generated from src/airo/vair.ttl by "
            "`python -m airo_min.vair_vocab --write`; do not edit. "
            "tests/test_vair_vocab.py fails when it drifts."
        ),
        "classes": classes,
        "modelTerms": sorted(MODEL_TERMS),
    }


def _cli() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Write the form's VAIR lists.")
    ap.add_argument("--write", action="store_true", help=f"write {VOCAB_PATH}")
    args = ap.parse_args()
    text = json.dumps(form_vocab(), indent=2, ensure_ascii=False) + "\n"
    if args.write:
        VOCAB_PATH.write_text(text, encoding="utf-8")
        print(f"wrote {VOCAB_PATH}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
