"""Shared fixtures for the vendored AIRO builder's regression tests."""

from pathlib import Path

import pytest
from rdflib import Graph

ROOT = Path(__file__).resolve().parents[1]
AIRO_TTL = ROOT / "src" / "airo" / "airo.ttl"
VAIR_TTL = ROOT / "src" / "airo" / "vair.ttl"


@pytest.fixture(scope="session")
def airo_graph() -> Graph:
    return Graph().parse(AIRO_TTL, format="turtle")


@pytest.fixture(scope="session")
def vair_graph() -> Graph:
    return Graph().parse(VAIR_TTL, format="turtle")
