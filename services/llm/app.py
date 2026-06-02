"""LiteLLM-backed completion service.

A thin FastAPI wrapper around the `litellm` Python library so the platform has a
single, provider-agnostic LLM endpoint. Apps point at LLM_SERVICE_URL and POST to
/generate; provider credentials (e.g. ANTHROPIC_API_KEY) live HERE, not in the
calling apps. This replaces the old direct-Anthropic-SDK path.

Run locally:
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn app:app --port 4000 --reload
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import litellm
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Default model; override per-request or via env. litellm uses the
# "<provider>/<model>" form and reads the provider key from the environment
# (ANTHROPIC_API_KEY for anthropic/*, OPENAI_API_KEY for openai/*, etc.).
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "mistral/mistral-large-latest")

app = FastAPI(title="AISC LiteLLM Service", version="0.1.0")


class GenerateRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    model: Optional[str] = None
    max_tokens: int = 4096
    temperature: Optional[float] = None


class GenerateResponse(BaseModel):
    text: str
    model: str


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    messages: List[Dict[str, Any]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.append({"role": "user", "content": req.prompt})

    model = req.model or DEFAULT_MODEL
    kwargs: Dict[str, Any] = {"max_tokens": req.max_tokens}
    if req.temperature is not None:
        kwargs["temperature"] = req.temperature

    try:
        completion = litellm.completion(model=model, messages=messages, **kwargs)
    except Exception as exc:  # noqa: BLE001 — surface any provider/litellm error
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}")

    text = completion["choices"][0]["message"]["content"] or ""
    return GenerateResponse(text=text, model=model)
