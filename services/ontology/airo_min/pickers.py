"""The form's picker lists, shared with the TypeScript app.

Not to be confused with airo_min/vair_terms.py, which holds the VAIR terms a
node may be typed with. These four lists are the closed choices the form itself
offers: how a system reaches the market, where it is used, what an impact
touches, and who is affected.

The file lives under the app's src/data so the form imports it directly and the ids
stay in lockstep. This module looks for it in three places, in order, so the same
code works in the repo and inside the container image where there is no src/data
above the package:

  1. $AIRO_VOCAB_PATH
  2. <app root>/src/data/airo_vocab.json   (the repo layout)
  3. <package>/airo_vocab.json             (copied in at image build time)
"""
import json
import os
from pathlib import Path

_PACKAGE = Path(__file__).resolve().parent
# .../apps/qualification/services/ontology/airo_min -> apps/qualification
_APP_ROOT = _PACKAGE.parents[2]


def candidate_paths() -> list[Path]:
    """Where the shared vocabulary may live, most specific first."""
    paths = []
    override = os.environ.get("AIRO_VOCAB_PATH")
    if override:
        paths.append(Path(override))
    paths.append(_APP_ROOT / "src" / "data" / "airo_vocab.json")
    paths.append(_PACKAGE / "airo_vocab.json")
    return paths


def load_vocab() -> dict[str, list[dict]]:
    tried = candidate_paths()
    for path in tried:
        if path.exists():
            with path.open(encoding="utf-8") as fh:
                return json.load(fh)
    raise FileNotFoundError(
        "airo_vocab.json not found; looked in: "
        + ", ".join(str(p) for p in tried)
    )


VOCAB_PATH: Path = next(
    (p for p in candidate_paths() if p.exists()), candidate_paths()[-1]
)
PICKERS: dict[str, list[dict]] = load_vocab()

# picker group -> the AIRO class its terms specialise
VOCAB_CLASS: dict[str, str] = {
    "marketForm": "Modality",
    "locality": "LocalityOfUse",
    "impactArea": "AreaOfImpact",
    "affected": "Stakeholder",
}


def picker_ids(group: str) -> set[str]:
    return {entry["id"] for entry in PICKERS[group]}
