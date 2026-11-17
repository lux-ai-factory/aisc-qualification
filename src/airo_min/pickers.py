"""The picker lists, shared with the AIRO builder.

Not to be confused with airo_min/vair_terms.py, which holds the VAIR terms a
node may be typed with. The builder offers VAIR wherever VAIR has a vocabulary
for a field (airo_min/vair_vocab.py); this file holds our own lists, only for
what VAIR has none for: who a risk affects.

This module looks for the vocabulary in three places, in order, so the same
code works in the repo and inside the container image where there is no
data/ above the package:

  1. $AIRO_VOCAB_PATH
  2. <app root>/data/airo_vocab.json   (the repo layout)
  3. <package>/airo_vocab.json         (copied in at image build time)
"""

import json
import os
from pathlib import Path

_PACKAGE = Path(__file__).resolve().parent


def app_root_for(package_dir: Path) -> Path | None:
    """The app root = the ancestor holding data/, when there is one.

    In the repo the package is <repo>/src/airo_min and data/ sits at <repo>.
    In the image the package is /app/airo_min and the vocabularies are copied
    in beside it — no data/ above — which is an ordinary absence, not an error.
    """
    for parent in package_dir.parents:
        if (parent / "data").is_dir():
            return parent
    return None


_APP_ROOT = app_root_for(_PACKAGE)


def candidate_paths() -> list[Path]:
    """Where the shared vocabulary may live, most specific first."""
    paths = []
    override = os.environ.get("AIRO_VOCAB_PATH")
    if override:
        paths.append(Path(override))
    if _APP_ROOT is not None:
        paths.append(_APP_ROOT / "data" / "airo_vocab.json")
    paths.append(_PACKAGE / "airo_vocab.json")
    return paths


def load_vocab() -> dict[str, list[dict]]:
    tried = candidate_paths()
    for path in tried:
        if path.exists():
            with path.open(encoding="utf-8") as fh:
                return json.load(fh)
    raise FileNotFoundError(
        "airo_vocab.json not found; looked in: " + ", ".join(str(p) for p in tried)
    )


VOCAB_PATH: Path = next((p for p in candidate_paths() if p.exists()), candidate_paths()[-1])
PICKERS: dict[str, list[dict]] = load_vocab()

# picker group -> the AIRO class its terms specialise
VOCAB_CLASS: dict[str, str] = {
    "affected": "Stakeholder",
}


def picker_ids(group: str) -> set[str]:
    return {entry["id"] for entry in PICKERS[group]}
