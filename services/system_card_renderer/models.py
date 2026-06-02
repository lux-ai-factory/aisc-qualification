"""Pydantic schemas for the AI Act system card payload."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TargetSystem(BaseModel):
    category: str
    subcategory: str


class Classification(BaseModel):
    target_systems: List[TargetSystem] = Field(default_factory=list)
    sectors: List[str] = Field(default_factory=list)


class ArticleFinding(BaseModel):
    article: str = Field(..., description='e.g. "Article 10"')
    title: str = Field(..., description="Human title for the article")
    summary: str = Field(..., description="One-paragraph synthesis")
    points: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)


class SystemCard(BaseModel):
    """Machine-readable AI Act system card."""

    system_name: str
    system_version: str
    provider: str
    description: str
    target_use_case: str
    target_users: str
    classification: Classification
    overview: str
    findings: List[ArticleFinding] = Field(default_factory=list)
    open_issues: List[str] = Field(default_factory=list)
    generated_at: Optional[str] = None
    qualification_id: Optional[str] = None
