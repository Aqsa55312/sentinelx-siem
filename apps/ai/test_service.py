"""Uji layanan AI investigasi (provider mock deterministik)."""

from __future__ import annotations

import pytest

from service import InvestigationService
from validation import ValidationError, validate_investigation_response
from providers import MockProvider


def _svc() -> InvestigationService:
    return InvestigationService()


def test_no_events_states_limitation():
    # TC-07: AI tanpa bukti harus nyatakan keterbatasan, tidak mengarang.
    result = _svc().investigate(
        incident_id="inc-x", title="Kosong", severity="low", risk_score=10,
        status="new", indicators=[], events=[], alerts=[], notes=[],
        created_by="analyst",
    )
    assert result["confidence"] <= 30
    assert "tidak cukup bukti" in result["summary"].lower() or "keterbatasan" in result["limitations"].lower()
    assert result["timeline"] == []
    assert result["evidence"] == []


def test_with_events_produces_cited_timeline():
    events = [
        {"event_id": "evt-1", "timestamp": "2026-10-16T08:30:00Z",
         "event_type": "authentication_failed", "severity": "high",
         "src_ip": "192.0.2.10", "username": "demo-user", "message": "gagal login",
         "attributes": {}},
        {"event_id": "evt-2", "timestamp": "2026-10-16T08:31:00Z",
         "event_type": "authentication_failed", "severity": "high",
         "src_ip": "192.0.2.10", "username": "demo-user", "message": "gagal login",
         "attributes": {}},
    ]
    alerts = [
        {"alert_id": "alt-1", "rule_id": "DET-001", "title": "Brute force",
         "severity": "high", "risk_score": 75, "status": "new"},
    ]
    result = _svc().investigate(
        incident_id="inc-x", title="Brute force demo", severity="high", risk_score=75,
        status="new", indicators=["ip:192.0.2.10", "user:demo-user"],
        events=events, alerts=alerts, notes=[],
        created_by="analyst",
    )
    assert result["summary"]
    assert result["timeline"], "harus ada timeline"
    assert all(t.get("event_id") in {"evt-1", "evt-2"} for t in result["timeline"])
    assert all(e["event_id"] in {"evt-1", "evt-2"} for e in result["evidence"])
    assert 0 <= result["confidence"] <= 100
    assert "tidak mengeksekusi perintah" in result["summary"].lower()


def test_secrets_redacted():
    events = [
        {"event_id": "evt-1", "timestamp": "2026-10-16T08:30:00Z",
         "event_type": "web_request", "severity": "medium",
         "src_ip": "192.0.2.1", "username": "u", "message": "token=abc123secret",
         "attributes": {"password": "hunter2", "api_key": "sk-xyz"}},
    ]
    result = _svc().investigate(
        incident_id="inc-x", title="Redaksi", severity="medium", risk_score=30,
        status="new", indicators=[], events=events, alerts=[], notes=[],
        created_by="analyst",
    )
    payload = str(result)
    assert "hunter2" not in payload
    assert "sk-xyz" not in payload
    assert "abc123secret" not in payload


def test_validation_rejects_unknown_citation():
    with pytest.raises(ValidationError):
        validate_investigation_response(
            {
                "model": "m", "prompt_version": "v1", "summary": "s", "limitations": "l",
                "confidence": 50,
                "timeline": [{"time": "t", "event_id": "evt-missing", "description": "d", "citations": ["evt-missing"]}],
                "evidence": [],
                "alternative_hypotheses": [], "unknowns": [], "next_steps": [],
            },
            known_event_ids={"evt-real"},
        )


def test_validation_rejects_bad_confidence():
    with pytest.raises(ValidationError):
        validate_investigation_response(
            {
                "model": "m", "prompt_version": "v1", "summary": "s", "limitations": "l",
                "confidence": 110,
                "timeline": [], "evidence": [], "alternative_hypotheses": [],
                "unknowns": [], "next_steps": [],
            },
        )


def test_provider_is_mock_by_default():
    svc = InvestigationService()
    assert isinstance(svc.provider, MockProvider)
