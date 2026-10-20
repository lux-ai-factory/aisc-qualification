"""Where the package finds the app root, and that the service starts without the picker file.

The module airo_min/pickers.py used to load airo_vocab.json at import, for lists nothing used,
and vair_vocab and annex_points imported it for app_root_for alone: a missing airo_vocab.json
stopped the service from starting. app_root_for lives on its own now, and the service needs no airo_vocab.json.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent.parent
APP = SERVICE.parent.parent


def test_the_container_layout_has_no_app_root_above_it():
    """In the image the package is /app/airo_min, with nothing three levels up.

    Asking for it by index would raise IndexError at import time and stop the
    service from starting: the data sits beside the package there, so the
    missing app root is an ordinary absence, not an error.
    """
    from airo_min.app_root import app_root_for

    assert app_root_for(Path("/app/airo_min")) is None


def test_the_repo_layout_still_finds_the_app_root():
    from airo_min.app_root import app_root_for

    root = app_root_for(Path("/w/apps/qualification/services/ontology/airo_min"))
    assert root == Path("/w/apps/qualification")


def test_the_service_starts_without_airo_vocab_json(tmp_path):
    # an app root with the Annex IV points and no picker file, and an override pointing nowhere
    root = tmp_path / "app"
    shutil.copytree(SERVICE, root / "services" / "ontology",
                    ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", "airo_vocab.json"))
    (root / "src" / "data").mkdir(parents=True)
    shutil.copy(APP / "src" / "data" / "annexPoints.json", root / "src" / "data" / "annexPoints.json")
    env = {**os.environ, "AIRO_VOCAB_PATH": str(tmp_path / "nowhere.json"), "PYTHONDONTWRITEBYTECODE": "1"}
    done = subprocess.run([sys.executable, "-c", "import app"], cwd=root / "services" / "ontology",
                          env=env, capture_output=True, text=True, timeout=60)
    assert done.returncode == 0, done.stderr[-2000:]
