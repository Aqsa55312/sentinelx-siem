"""Mengatur panggilan penyedia AI dengan sanitasi, validasi, dan penanganan kesalahan."""

from __future__ import annotations

from typing import Any

from config import settings
from prompt import build_context
from providers import MockProvider, OpenAIProvider, ProviderError, ProviderTimeoutError
from validation import ValidationError, validate_investigation_response


class InvestigationService:
    """Mengatur panggilan penyedia AI dengan sanitasi, validasi, dan penanganan kesalahan."""

    def __init__(self) -> None:
        provider_name = settings.ai_provider.lower()
        if provider_name == "openai":
            self.provider = OpenAIProvider()
        else:
            self.provider = MockProvider()

    def investigate(
        self,
        incident_id: str,
        title: str,
        severity: str,
        risk_score: int,
        status: str,
        indicators: list[str],
        events: list[dict[str, Any]],
        alerts: list[dict[str, Any]],
        notes: list[dict[str, Any]],
        created_by: str,
    ) -> dict[str, Any]:
        context = build_context(events, alerts, notes)
        context["title"] = title
        context["severity"] = severity
        context["risk_score"] = risk_score
        context["status"] = status
        context["meta"] = {
            "incident_id": incident_id,
            "title": title,
            "severity": severity,
            "risk_score": risk_score,
            "status": status,
            "indicators": indicators,
            "created_by": created_by,
        }

        known_ids = {e.get("event_id", "") for e in events if e.get("event_id")}

        try:
            raw = self.provider.investigate(context)
        except ProviderTimeoutError as exc:
            raise ProviderTimeoutError(str(exc)) from exc
        except ProviderError as exc:
            raise ProviderError(str(exc)) from exc

        try:
            validated = validate_investigation_response(raw, known_ids)
        except ValidationError as exc:
            # Jika citasi tidak valid, buat fallback aman: hapus citasi yang tidak terverifikasi.
            fallback = dict(raw)
            fallback["timeline"] = [
                {k: v for k, v in item.items() if k != "citations"} | {"citations": []}
                for item in fallback.get("timeline", [])
            ]
            fallback["evidence"] = []
            validated = validate_investigation_response(fallback, known_ids)
            validated["limitations"] = (
                "Beberapa citasi dihapus karena tidak dapat diverifikasi terhadap bukti. "
                + validated.get("limitations", "")
            )

        validated["incident_id"] = incident_id
        return dict(validated)
