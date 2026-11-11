"""Request/response shapes of the headless qualification service."""
from typing import Any

from pydantic import BaseModel


class BuildRequest(BaseModel):
    project_pid: str
    questionnaire_id: str
    questionnaire: dict[str, Any] = {}
    answers: dict[str, Any] = {}
    system: dict[str, Any] = {}


class BuildResponse(BaseModel):
    view: dict[str, Any]
    jsonld: str
    turtle: str = ""
    problems: list[str] = []
    digest: str = ""
