# SentinelX — Development Status & Runbook

Operational companion to the README. Tracks what is actually implemented and how to run/verify it.

**Last verified:** 19 October 2026 · `go test` 19/19 · `npm run build` OK

## Implemented

| Area | Status | Notes |
|------|--------|-------|
| Docs (BRD/PRD/ARCHITECTURE) | Done | `docs/*.md` |
| Event schema + OpenAPI | Done | `packages/event-schema/event.json`, `packages/api-contracts/openapi.yaml` (v0.3.0) |
| PostgreSQL schema | Done | `database/migrations/001_init.sql`, `002_detection.sql`, seeds in `database/seeds/` |
| Auth + RBAC + tenant isolation | Done | HMAC bearer token (8h), roles `admin/analyst/responder/viewer`, server-side checks |
| Ingestion REST | Done | Batch validation, secret redaction, `event_id` idempotency, max 1MB / 1000 events |
| Ingestion file upload | Done | `.jsonl` / `.json` array, 10MB / 5000 events, parse rejects counted |
| Storage | Done | `MemoryStore` default for local demo; `PostgresStore` when `DATABASE_URL` is set |
| DET-001 brute-force | Done | 5 failures / 300s per `src_ip`; tested positive + negative |
| DET-002 suspicious auth sequence | Done | ≥3 failures then success, same `username` + `src_ip`, 600s window |
| DET-003 policy anomaly | Done | `admin_action` outside 08:00–18:00 UTC baseline; per-event override |
| DET-004 repeated high-risk | Done | 3 `high_risk_event` / 120s per source |
| Alert dedupe | Done | Rule + event-time bucket key, 24h lookback; retries don't duplicate, new windows still alert |
| Risk scoring | Done | `R = min(100, 0.4S+0.3C+0.2A+0.1B)`, priority mapping; prototype weights, not compromise probability |
| Event explorer API | Done | Filters (`event_type`, `src_ip`, `username`, `source_id`, `from`, `to`) + `limit`/`offset` + `total` |
| Sources API + UI | Done | Create/list log sources, health status shown on overview |
| Rule registry API + UI | Done | `GET /api/v1/rules` exposes config and test cases |
| React dashboard | Done | Overview, Event Explorer (+filters, pagination, upload), Alerts + evidence, Rules, Sources |
| Audit log | Partial | Auth, ingest, detection, source creation recorded; no read UI/API yet |

## Not implemented yet

- Incident workflow (create from alert, status transitions, assignment, notes, export) — Week 5
- Correlation engine (grouping related alerts into incidents) — Week 4
- Python AI service (evidence-grounded summary, prompt-injection resistant) — Week 6
- Response simulation + approval — Week 7
- OpenSearch indexing, message broker, Redis
- Metrics endpoint/tracing, TLS, secret manager, retention jobs

## Run locally (Windows PowerShell)

```powershell
# 1. API (:8080). In-memory by default.
cd sentinelx\apps\api
go run .

# Optional PostgreSQL (Docker):
#   docker compose up -d postgres
#   $env:DATABASE_URL="postgres://sentinelx:sentinelx@localhost:5432/sentinelx?sslmode=disable"
#   then apply database/migrations/*.sql and database/seeds/seed.sql

# 2. Web (:5173, proxies /api to :8080)
cd sentinelx\apps\web
npm install
npm run dev

# 3. Login
#    admin@sentinelx.local / password123   (admin)
#    analyst@sentinelx.local / password123 (analyst)
#    viewer@sentinelx.local / password123  (viewer — write endpoints return 403)
```

## Demo scenarios (each triggers one rule)

```powershell
cd sentinelx
python simulator\scenarios\send_fixture.py admin@sentinelx.local password123 simulator\fixtures\auth_failures_tc01.jsonl       # DET-001
python simulator\scenarios\send_fixture.py admin@sentinelx.local password123 simulator\fixtures\auth_sequence_tc03.jsonl        # DET-002
python simulator\scenarios\send_fixture.py admin@sentinelx.local password123 simulator\fixtures\admin_offhours_tc04.jsonl       # DET-003
python simulator\scenarios\send_fixture.py admin@sentinelx.local password123 simulator\fixtures\high_risk_repeated_tc05.jsonl   # DET-004
```

Negative control: `auth_failures_tc02.jsonl` (4 failures) must produce **0** alerts.
Re-uploading `auth_failures_tc01.jsonl` must also produce **0** new alerts (dedupe).

## API surface (implemented)

| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/v1/auth/login` | public |
| GET | `/api/v1/dashboard/overview` | viewer+ |
| GET | `/api/v1/sources` | viewer+ |
| POST | `/api/v1/sources` | analyst/admin |
| POST | `/api/v1/ingest/events` | analyst/admin |
| POST | `/api/v1/ingest/upload` | analyst/admin |
| GET | `/api/v1/events` | viewer+ |
| GET | `/api/v1/events/{id}` | viewer+ |
| GET | `/api/v1/alerts` | viewer+ |
| GET | `/api/v1/alerts/{id}` | viewer+ |
| GET | `/api/v1/rules` | viewer+ |
| GET | `/healthz` | public |

## Known limitations

- Local in-memory store resets on restart; use PostgreSQL for persistence.
- Postgres/OpenSearch not exercised in the current sandbox (cluster could not start); SQL and store code are unverified at runtime.
- Seed passwords are dev-only and must be replaced before any shared deployment.
- Risk weights and rule thresholds are starting defaults; no precision/recall measurement yet.
- No TLS locally (expected: reverse proxy in deployment).
