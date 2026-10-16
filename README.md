# SentinelX — Mini-SIEM (slice 1 + week 2 ready)

Vertical slice berjalan end-to-end: **simulator fixture / file upload → Go ingestion API → storage → DET-001 → React dashboard**.

## Status

- [x] `docs/BRD.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`
- [x] `packages/event-schema/event.json`, `packages/api-contracts/openapi.yaml` (v0.2.0)
- [x] `database/migrations/001_init.sql` + seeds (bcrypt `password123` valid)
- [x] Go API: auth+RBAC, ingest JSON + **upload JSONL/JSON (10MB/5000)**, validasi + redaksi + idempotency, DET-001 + risk scoring, **events filter + pagination**, **sources CRUD**, overview + kesehatan source
- [x] `go test` 11/11 hijau + `go vet` bersih
- [x] Smoke: login → upload TC-01 → 1 alert; TC-02 → 0 alert; pagination + filter + RBAC viewer 403
- [x] React dashboard (login, overview+sources, events + filter + pagination + upload, alerts+evidence, sources) + `npm run build` sukses
- [ ] Postgres lokal terisolasi: kode `PostgresStore` + migrasi siap dan dipakai saat `DATABASE_URL` di-set (docker-compose/CI). Cluster `.pgdata` port 5544 **tidak dijalankan di sini** — proses postgres anak mati di sandbox ini (`0xC0000142`), dan Postgres sistem butuh password yang tidak diketahui. Default lokal = in-memory.
- [ ] Tahap 3+: DET-002/003/004, correlation, incidents, AI service, response simulation

## Quickstart (Windows PowerShell)

```powershell
# 1. API
cd sentinelx\apps\api
go run .                # :8080 (in-memory; set DATABASE_URL untuk Postgres)

# 2. Web (terminal kedua)
cd sentinelx\apps\web
npm install
npm run dev             # :5173, proxy /api -> :8080

# 3. Login: admin@sentinelx.local / password123 (viewer@sentinelx.local untuk uji RBAC)

# 4. Kirim skenario brute-force (terminal ketiga) — atau upload via tab Events
cd sentinelx
python simulator\scenarios\send_fixture.py admin@sentinelx.local password123 simulator\fixtures\auth_failures_tc01.jsonl
# -> alerts_fired=1, lihat di tab Alerts
```

Dataset negatif (tidak boleh alert): `simulator\fixtures\auth_failures_tc02.jsonl` (4 failures).
Upload file: tab Events → pilih `.jsonl`/`.json` (maks 10MB / 5000 event).

## API ringkas

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | /api/v1/auth/login | publik |
| GET | /dashboard/overview | viewer+ |
| GET/POST | /sources | baca viewer+, tulis analyst/admin |
| POST | /ingest/events | analyst/admin |
| POST | /ingest/upload (multipart `file`, opsional `source_id`) | analyst/admin |
| GET | /events?event_type=&src_ip=&username=&source_id=&from=&to=&limit=&offset= | viewer+ → `{events,total,limit,offset}` |
| GET | /events/{id} | viewer+ |
| GET | /alerts, /alerts/{id} | viewer+ |
| GET | /healthz | publik |

## MVP readiness (8 checklist Bagian J)

- [x] Event ingestion & normalisasi (valid/invalid ditangani, redaksi, idempotency)
- [~] Detection rules (DET-001 +/− test; DET-002..004 berikutnya)
- [~] Alert & incident (alert→evidence ok; incident workflow berikutnya)
- [ ] AI investigation (tahap 6)
- [~] Security (RBAC+isolasi+redaksi+audit diuji; TLS/KMS saat deploy)
- [ ] Response simulation (tahap 7)
- [~] Observability (healthz, structured log, counter; metrics penuh tahap 8)
- [~] Documentation (BRD/PRD/ARCH + README; threat model penuh + demo video tahap 8)

## Berikutnya (sesuai roadmap)

Minggu 2: selesai (upload JSONL + filter/pagination + sources; Postgres tetap via `DATABASE_URL`/compose karena sandbox lokal tak bisa menjalankan cluster). Minggu 3: DET-002/003/004 + idempotency alert. Minggu 4: correlation + risk tuning. Minggu 5: incidents + dashboard penuh. Minggu 6: AI service. Minggu 7: response simulation + audit. Minggu 8: hardening + demo.
