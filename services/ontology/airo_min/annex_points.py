"""The 14 Annex IV points, shared with the TypeScript app.

The default form asks one question per point; a custom question may be tagged
with one of these ids so the graph and the coverage line know which point it
answers. The ids are the default form's question ids, and each citation is the
one airo_min.build._annex_citation rebuilds from that id.

The file lives under the app's src/data, next to the vocabulary. Like
airo_min/pickers.py, this module looks for it in three places, in order:

  1. $ANNEX_POINTS_PATH
  2. <app root>/src/data/annexPoints.json   (the repo layout)
  3. <package>/annex_points.json            (copied in at image build time)
"""
import json
import os
from pathlib import Path

from .pickers import app_root_for

_PACKAGE = Path(__file__).resolve().parent
_APP_ROOT = app_root_for(_PACKAGE)


def candidate_paths() -> list[Path]:
    """Where the shared points may live, most specific first.

    Reads the module globals at call time, so a test can point them elsewhere.
    """
    paths = []
    override = os.environ.get("ANNEX_POINTS_PATH")
    if override:
        paths.append(Path(override))
    if _APP_ROOT is not None:
        paths.append(_APP_ROOT / "src" / "data" / "annexPoints.json")
    paths.append(_PACKAGE / "annex_points.json")
    return paths


def load_annex_points() -> list[dict]:
    tried = candidate_paths()
    for path in tried:
        if path.exists():
            with path.open(encoding="utf-8") as fh:
                return json.load(fh)["points"]
    raise FileNotFoundError(
        "annexPoints.json not found; looked in: "
        + ", ".join(str(p) for p in tried)
    )


ANNEX_POINTS: list[dict] = load_annex_points()
_CITATIONS: dict[str, str] = {p["id"]: p["citation"] for p in ANNEX_POINTS}


def annex_citation(point: str) -> str:
    """The citation of one of the 14 points; KeyError for any other id."""
    return _CITATIONS[point]
