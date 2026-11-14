"""The agents service reads LEDGER_MODE strictly: a misspelt mode is refused, not read as off, and an absent
one means record. It uses its own copy of the shared switch parser (fill/switches.py)."""
import importlib

import pytest

from fill import ledger


def _switch_invalid():
    try:
        return importlib.import_module("fill.switches").SwitchInvalid
    except ModuleNotFoundError:
        pytest.fail("fill/switches.py is missing: the agents service has no strict switch parser")


def test_a_misspelt_ledger_mode_is_refused(monkeypatch):
    monkeypatch.setenv("LEDGER_MODE", "recrod")
    invalid = _switch_invalid()
    with pytest.raises(invalid):
        ledger.on()


def test_an_absent_ledger_mode_records(monkeypatch):
    monkeypatch.delenv("LEDGER_MODE", raising=False)
    assert ledger.on() is True
