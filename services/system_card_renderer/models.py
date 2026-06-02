"""Pydantic schemas for the system card payload."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TargetSystem(BaseModel):
    category: str
    subcategory: str


class Classification(BaseModel):
    target_systems: List[TargetSystem] = Field(default_factory=list)
    sectors: List[str] = Field(default_factory=list)


class Finding(BaseModel):
    title: str = Field(..., description="The topic area, e.g. Data & data governance")
    summary: str = Field(..., description="One-paragraph synthesis")
    points: List[str] = Field(default_factory=list)


class SystemCard(BaseModel):
    """Machine-readable system card."""

    system_name: str
    system_version: str
    provider: str
    description: str
    target_use_case: str
    target_users: str
    classification: Classification
    overview: str
    findings: List[Finding] = Field(default_factory=list)
    open_issues: List[str] = Field(default_factory=list)
    generated_at: Optional[str] = None
    qualification_id: Optional[str] = None
