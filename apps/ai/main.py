"""Aplikasi FastAPI: layanan AI investigasi SentinelX (Week 6)."""

from __future__ import annotations

import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from service import InvestigationService
from validation import ValidationError
from providers import ProviderError, ProviderTimeoutError

app = FastAPI(title="SentinelX AI Investigation Service", version="0.6.0")


class AlertIn(BaseModel):
    alert_id: str = ""
    rule_id: str = ""
    title: str = ""
    severity: str = ""
    risk_score: int = 0
    status: str = ""


class EventIn(BaseModel):
    event_id: str = ""
    timestamp: str = ""
    event_type: str = ""
    severity: str = ""
    src_ip: str = ""
    username: str = ""
    message: str = ""
    attributes: dict[str, Any] = Field(default_factory=dict)


class NoteIn(BaseModel):
    author_id: str = ""
    body: str = ""


class InvestigateRequest(BaseModel):
    incident_id: str
    title: str = ""
    severity: str = "medium"
    risk_score: int = 0
    status: str = "new"
    indicators: list[str] = Field(default_factory=list)
    events: list[EventIn] = Field(default_factory=list)
    alerts: list[AlertIn] = Field(default_factory=list)
    notes: list[NoteIn] = Field(default_factory=list)
    created_by: str = "detection-engine"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "sentinelx-ai", "provider": "mock"}


@app.post("/investigate")
def investigate(req: InvestigateRequest) -> dict[str, Any]:
    service = InvestigationService()
    start = time.time()
    try:
        result = service.investigate(
            incident_id=req.incident_id,
            title=req.title,
            severity=req.severity,
            risk_score=req.risk_score,
            status=req.status,
            indicators=req.indicators,
            events=[e.model_dump() for e in req.events],
            alerts=[a.model_dump() for a in req.alerts],
            notes=[n.model_dump() for n in req.notes],
            created_by=req.created_by,
        )
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["duration_ms"] = int((time.time() - start) * 1000)
    return result
