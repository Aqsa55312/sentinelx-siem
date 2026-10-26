"""Konfigurasi layanan AI investigasi (baca dari environment)."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Penyedia: "mock" (deterministik, tanpa kunci API) atau "openai".
    ai_provider: str = "mock"
    # Batas waktu pemanggilan penyedia AI (detik).
    ai_service_timeout: float = 30.0
    # Batas ukuran konteks yang dikirim ke model.
    ai_max_events: int = 50
    ai_max_chars: int = 6000
    # Identitas model dan versi prompt yang dicatat untuk audit.
    ai_model: str = "sentinelx-mock/v1"
    ai_prompt_version: str = "v1"

    # OpenAI-compatible provider (opsional, memerlukan AI_OPENAI_API_KEY).
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    class Config:
        env_file = ".env"
        case_insensitive = True


settings = Settings()
