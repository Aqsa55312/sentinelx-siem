"""Penyedia AI: mock deterministik untuk demo/uji dan OpenAI-compatible (opsional)."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from config import settings
from prompt import build_user_prompt, build_system_prompt
from validation import validate_investigation_response


class ProviderError(Exception):
    """Kesalahan dari penyedia AI (jaringan, respons tidak valid, dll)."""


class ProviderTimeoutError(ProviderError):
    """Pemanggilan penyedia AI melebihi batas waktu."""


def _extract_json(text: str) -> dict[str, Any]:
    """Ambil objek JSON dari teks (toleransi terhadap kode fence markdown)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ProviderError("respons AI tidak mengandung objek JSON")
    return json.loads(text[start : end + 1])


class MockProvider:
    """Penyedia deterministik tanpa kunci API. Hanya menyusun fakta bukti."""

    def __init__(self) -> None:
        self.model = settings.ai_model
        self.prompt_version = settings.ai_prompt_version

    def investigate(self, context: dict[str, Any]) -> dict[str, Any]:
        events = context.get("events", []) or []
        alerts = context.get("alerts", []) or []
        notes = context.get("notes", []) or []
        title = context.get("title", "Insiden tanpa judul")
        severity = context.get("severity", "medium")
        risk_score = int(context.get("risk_score", 0) or 0)

        # TC-07: tanpa bukti, nyatakan keterbatasan, jangan mengarang.
        if not events:
            return {
                "model": self.model,
                "prompt_version": self.prompt_version,
                "summary": (
                    "Tidak cukup bukti event untuk menyimpulkan pola serangan. "
                    "Semua pernyataan di bawah bersifat tidak terjamin karena tidak ada "
                    "event sumber yang tersedia dalam konteks insiden ini."
                ),
                "timeline": [],
                "evidence": [],
                "alternative_hypotheses": [
                    "Tidak dapat membandingkan karena data insiden kosong.",
                ],
                "unknowns": [
                    "Tidak ada event sumber untuk divisualisasikan dalam timeline.",
                ],
                "next_steps": [
                    "Unggah log sumber terkait ke SentinelX melalui Event Explorer.",
                    "Periksa kembali apakah insiden terhubung dengan alert yang valid.",
                ],
                "confidence": 10,
                "limitations": "Keterbatasan: tidak ada bukti event yang tersedia.",
            }

        # Susun timeline dari event yang tersedia (urut waktu, batasi jumlah).
        evs = sorted(events, key=lambda e: e.get("timestamp", ""))[: settings.ai_max_events]
        timeline = []
        evidence = []
        for e in evs:
            eid = e.get("event_id", "")
            desc = f"{e.get('event_type','')} dari {e.get('src_ip') or 'IP tidak diketahui'} " \
                   f"pada {e.get('username') or 'pengguna tidak diketahui'}"
            timeline.append(
                {
                    "time": e.get("timestamp", ""),
                    "event_id": eid,
                    "description": desc,
                    "citations": [eid] if eid else [],
                }
            )
            if eid:
                claim = f"Event {eid} mencatat {e.get('event_type','')} " \
                        f"dari {e.get('src_ip') or 'IP tidak diketahui'}"
                evidence.append(
                    {
                        "event_id": eid,
                        "claim": claim,
                        "supported": True,
                    }
                )

        # Ringkasan berbasis fakta, tidak mengubah severity, tidak mengeksekusi perintah.
        top_alert = max(alerts, key=lambda a: int(a.get("risk_score", 0) or 0)) if alerts else None
        summary = (
            f"Insiden '{title}' (severity {severity}, risiko {risk_score}/100) "
            f"terdapat {len(events)} event bukti dan {len(alerts)} alert terhubung. "
            + (
                f"Alert tertinggi: {top_alert.get('title')} ({top_alert.get('rule_id')}, "
                f"risiko {top_alert.get('risk_score')}/100). "
                if top_alert
                else "Tidak ada alert tertaut yang dianggap tinggi risiko. "
            )
            + "Semua pernyataan di bawah direferensikan ke event sumber yang tersedia. "
              "Model tidak mengubah severity dan tidak mengeksekusi perintah dari isi log."
        )

        confidence = min(90, 30 + min(len(events), 20) * 3 + min(len(alerts), 5) * 5)

        return {
            "model": self.model,
            "prompt_version": self.prompt_version,
            "summary": summary,
            "timeline": timeline,
            "evidence": evidence,
            "alternative_hypotheses": [
                "IP yang sama boleh berasal dari NAT/jaringan bersama, bukan seluruhnya satu pelaku.",
                "Aktivitas admin di luar jam kerja bisa jadi operasi rutin berjadwal.",
            ],
            "unknowns": [
                "Intentisasi pelaku belum dapat ditetapkan hanya dari log yang tersedia.",
            ],
            "next_steps": [
                "Verifikasi event secara manual terhadap sumber asli.",
                "Tandai indikator IP/pengguna yang berulang untuk pemantauan lebih lanjut.",
                "Konsultasikan dengan pemilik sumber sebelum mengubah status akun.",
            ],
            "confidence": confidence,
            "limitations": "Ringkasan ini adalah bantuan analis, bukan bukti kompromi.",
        }


class OpenAIProvider:
    """Penyedia OpenAI-compatible. Memerlukan AI_OPENAI_API_KEY dan jaringan."""

    def __init__(self) -> None:
        self.base_url = settings.openai_base_url.rstrip("/")
        self.api_key = settings.openai_api_key
        self.model = settings.openai_model
        self.timeout = settings.ai_service_timeout

    def investigate(self, context: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderError("AI_OPENAI_API_KEY belum diatur untuk provider openai")

        system_prompt = build_system_prompt()
        user_prompt = build_user_prompt(context)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", json=body, headers=headers)
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(f"pembuat AI melebihi batas waktu ({self.timeout}s)") from exc
        except httpx.RequestError as exc:
            raise ProviderError(f"gagal menghubungi penyedia AI: {exc}") from exc

        if resp.status_code >= 400:
            raise ProviderError(f"penyedia AI mengembalikan {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            raise ProviderError("respons AI kosong")

        parsed = _extract_json(content)
        return validate_investigation_response(parsed)
