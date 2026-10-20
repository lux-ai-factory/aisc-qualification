"""Where the app root is, for the modules that read the app's shared data files
(annex_points.py, vair_vocab.py)."""
from pathlib import Path


def app_root_for(package_dir: Path) -> Path | None:
    """The app root three levels above the package, when there is one.

    In the repo the package is .../apps/qualification/services/ontology/airo_min,
    so the app root is apps/qualification. In the image it is /app/airo_min, with
    nothing three levels up: that is an ordinary absence (the data is copied in
    beside the package), not an error, and asking for it by index would raise at
    import and stop the service from starting.
    """
    parents = package_dir.parents
    return parents[2] if len(parents) > 2 else None
