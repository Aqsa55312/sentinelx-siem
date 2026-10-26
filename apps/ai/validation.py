"""Validasi skema dan citasi untuk respons investigasi AI."""

from __future__ import annotations

from typing import Any

REQUIRED_FIELDS = [
    "model", "prompt_version", "summary", "timeline", "evidence",
    "alternative_hypotheses", "unknowns", "next_steps", "confidence", "limitations",
]


class ValidationError(Exception):
    """Respons AI tidak sesuai skema atau citasi tidak valid."""


def _is_list(value: Any) -> bool:
    return isinstance(value, list)


def validate_investigation_response(data: Any, known_event_ids: set[str] | None = None) -> dict[str, Any]:
    """Validasi struktur respons dan (opsional) citasi event_id yang diklaim."""
    if not isinstance(data, dict):
        raise ValidationError("respons AI harus berupa objek JSON")

    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        raise ValidationError(f"field wajib hilang: {', '.join(missing)}")

    if not isinstance(data.get("summary"), str) or not data["summary"].strip():
        raise ValidationError("summary harus berupa string non-kosong")
    if not isinstance(data.get("limitations"), str):
        raise ValidationError("limitations harus berupa string")
    conf = data.get("confidence")
    if not isinstance(conf, int) or not (0 <= conf <= 100):
        raise ValidationError("confidence harus bilangan bulat 0..100")

    timeline = data.get("timeline")
    evidence = data.get("evidence")
    if not _is_list(timeline):
        raise ValidationError("timeline harus berupa array")
    if not _is_list(evidence):
        raise ValidationError("evidence harus berupa array")

    for item in timeline:
        if not isinstance(item, dict):
            raise ValidationError("setiap entri timeline harus berupa objek")
        for key in ("time", "event_id", "description", "citations"):
            if key not in item:
                raise ValidationError(f"entri timeline kehilangan field {key}")
        if not isinstance(item.get("citations"), list):
            raise ValidationError("citations harus berupa array")

    for item in evidence:
        if not isinstance(item, dict):
            raise ValidationError("setiap entri evidence harus berupa objek")
        for key in ("event_id", "claim", "supported"):
            if key not in item:
                raise ValidationError(f"entri evidence kehilangan field {key}")
        if not isinstance(item.get("supported"), bool):
            raise ValidationError("supported harus berupa boolean")

    # Validasi citasi: setiap event_id yang disebutkan harus ada di bukti yang diberikan.
    if known_event_ids is not None:
        cited: set[str] = set()
        for item in timeline:
            for cid in item.get("citations", []):
                if isinstance(cid, str):
                    cited.add(cid)
        for item in evidence:
            eid = item.get("event_id")
            if isinstance(eid, str):
                cited.add(eid)
        unknown = sorted(cid for cid in cited if cid and cid not in known_event_ids)
        if unknown:
            raise ValidationError(
                f"citasi ke event yang tidak ada dalam konteks: {', '.join(unknown)}"
            )

    return data
