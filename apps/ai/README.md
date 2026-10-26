# SentinelX AI Investigation Service (Week 6)

Layanan terpisah (Python + FastAPI) yang menerima konteks insiden tersanitasi dari Go API dan mengembalikan ringkasan investigasi terstruktur berbasis bukti.

## Prinsip (PRD Module 6)
- AI adalah asisten, bukan sumber kebenaran tunggal.
- Input dibatasi ukurannya dan di-redaksi (token/password/secret).
- Output berupa JSON terstruktur dengan citasi `event_id` per klaim faktual.
- Log diperlakukan sebagai data tak tepercaya (anti prompt-injection).
- Tidak mengubah severity, tidak mengeksekusi perintah dari isi log.
- Model dan versi prompt dicatat untuk audit.

## Endpoint
- `GET /healthz` — kesehatan layanan
- `POST /investigate` — ringkasan investigasi (lihat `main.py` untuk skema request/response)

## Menjalankan secara lokal
```powershell
cd apps\ai
pip install -r requirements.txt
copy .env.example .env
# Secara default menggunakan provider mock (tidak perlu kunci API)
uvicorn main:app --reload --port 8000
```

## Uji
```powershell
cd apps\ai
pip install pytest
pytest -q
```

## Penyedia
- `mock` (default): deterministik, tanpa kunci API. Digunakan demo dan uji.
- `openai`: memerlukan `AI_OPENAI_API_KEY` dan jaringan ke endpoint OpenAI-compatible.

Docker tersedia melalui `Dockerfile`.
