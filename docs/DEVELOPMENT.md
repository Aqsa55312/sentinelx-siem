# SentinelX — Development Status & Runbook

Operational companion to the README. Tracks what is actually implemented and how to run/verify it.

**Last verified:** 21 October 2026 · `go test` 29/29 · `npm run build` OK

## Implemented

| Area | Status | Notes |
|------|--------|-------|
| Docs (BRD/PRD/ARCHITECTURE) | Done | `docs/*.md` |
| Event schema + OpenAPI | Done | `packages/event-schema/event.json`, `packages/api-contracts/openapi.yaml` (v0.4.0) |
| PostgreSQL schema | Done (runtime unverified) | `database/migrations/001_init.sql` … `003_incidents.sql`, seeds in `database/seeds/` |
| Auth + RBAC + tenant isolation | Done | HMAC bearer token (8h), roles `admin/analyst/responder/viewer`, server-side checks |
| Ingestion REST | Done | Batch validation, secret redaction, `event_id` idempotency, max 1MB / 1000 events |
| Ingestion file upload | Done | `.jsonl` / `.json` array, 10MB / 5000 events, parse rejects counted |
| Storage | Done | `MemoryStore` default for local demo; `PostgresStore` when `DATABASE_URL` is set |
| DET-001 brute-force | Done | 5 failures / 300s per `src_ip`; tested positive + negative |
| DET-002 suspicious auth sequence | Done | ≥3 failures then success, same `username` + `src_ip`, 600s window |
| DET-003 policy anomaly | Done | `admin_action` outside 08:00–18:00 UTC baseline; per-event override |
| DET-004 repeated high-risk | Done | 3 `high_risk_event` / 120s per source |
| Alert dedupe | Done | Rule + event-time bucket key, 24h lookback; retries don't duplicate, new windows still alert |
| Risk scoring | Done | `R = min(100, 0.4S+0.3C+0.2A+0.1B)`; `A` reads source criticality (default 50); prototype weights, not compromise probability |
| Event explorer API | Done | Filters (`event_type`, `src_ip`, `username`, `source_id`, `from`, `to`) + `limit`/`offset` + `total` |
| Sources API + UI | Done | Create/list sources, health, asset criticality input and column |
| Rule registry API + UI | Done | `GET /api/v1/rules` exposes config and test cases |
| Alert triage | Done | `PATCH /api/v1/alerts/{id}`; status + reason; linked incident shown in Alerts |
| Correlation | Done | 24h window; shared `ip:` / `user:` indicators; source-only overlap ignored; auto-creates incidents as `detection-engine` |
| Incident workflow | Done | `new → triaged → investigating → contained → resolved → closed` plus `false_positive`; invalid jumps rejected; `closed`/`false_positive` require reason |
| Incident collaboration | Done | Assignment, investigation notes, activity timeline, Markdown export, linked-alert status sync |
| React dashboard | Done | Overview (+incident queue), Event Explorer, Alerts triage, Incidents, Rules, Sources |
| Audit log | Partial | Auth, ingest, detection, source creation, alert/incident changes recorded internally; no read UI/API yet |

## Not implemented yet

- Python AI service (evidence-grounded summary, prompt-injection resistant) — Week 6
- Response simulation + approval — Week 7
- OpenSearch indexing, message broker, Redis
- Metrics endpoint/tracing, TLS, secret manager, retention jobs
- Audit-log read API/UI
- Full responder write access (responder is read-only until the Week 7 approval flow)

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
#    admin@sentinelx.local / password123     (admin)
#    analyst@sentinelx.local / password123   (analyst)
#    responder@sentinelx.local / password123 (responder — read-only until Week 7)
#    viewer@sentinelx.local / password123    (viewer — write endpoints return 403)
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

After uploading the four positive fixtures, the expected incident result is:

- tc01 + tc03 share `ip:192.0.2.10` / `user:demo-user`, so they are grouped into **one incident with 2 alerts**.
- tc04 and tc05 create **one incident each**.
- tc02 changes nothing.

### Upload without Python (PowerShell 5.1)

```powershell
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/auth/login' `
  -ContentType 'application/json' `
  -Body '{"email":"admin@sentinelx.local","password":"password123"}'
curl.exe -s -X POST 'http://localhost:8080/api/v1/ingest/upload' `
  -H "Authorization: Bearer $($login.token)" `
  -F "file=@simulator/fixtures/auth_failures_tc01.jsonl" `
  -F "source_id=source-demo-01"
```

## API surface (implemented)

| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/v1/auth/login` | public |
| GET | `/api/v1/dashboard/overview` | viewer+ |
| GET | `/api/v1/users` | viewer+ |
| GET | `/api/v1/sources` | viewer+ |
| POST | `/api/v1/sources` | analyst/admin |
| POST | `/api/v1/ingest/events` | analyst/admin |
| POST | `/api/v1/ingest/upload` | analyst/admin |
| GET | `/api/v1/events` | viewer+ |
| GET | `/api/v1/events/{id}` | viewer+ |
| GET | `/api/v1/alerts` | viewer+ |
| GET | `/api/v1/alerts/{id}` | viewer+ |
| PATCH | `/api/v1/alerts/{id}` | analyst/admin |
| GET | `/api/v1/incidents` | viewer+ |
| POST | `/api/v1/incidents` | analyst/admin |
| GET | `/api/v1/incidents/{id}` | viewer+ |
| PATCH | `/api/v1/incidents/{id}` | analyst/admin |
| POST | `/api/v1/incidents/{id}/notes` | analyst/admin |
| GET | `/api/v1/incidents/{id}/export` | viewer+ |
| GET | `/api/v1/rules` | viewer+ |
| GET | `/healthz` | public |

## Verification checklist (Week 4/5)

1. Upload tc01 + tc03 + tc04 + tc05; confirm `incidents_created` / `incidents_updated` in each response.
2. Open **Incidents**: one 2-alert case and two 1-alert cases; indicators show `ip:` / `user:` / `source:`.
3. Triage an incident: `new → triaged → investigating → contained → resolved → closed`.
4. Try an invalid jump (e.g. `new → resolved`) and close without a reason — both must return `400`.
5. Add a note and confirm it appears in the timeline and Markdown export.
6. Confirm linked alert statuses follow the incident, and Alerts → **Incident** opens the case.
7. Login as `viewer` and confirm triage/incidents/notes return `403`; login as another tenant and confirm resources are invisible.

## Known limitations

- Local in-memory store resets on restart; use PostgreSQL for persistence.
- Postgres/OpenSearch not exercised in the current sandbox (cluster could not start); SQL and store code are unverified at runtime.
- Correlation is indicator-based (IP/user within 24h), not a graph or sequence engine.
- Incident severity/risk is the maximum of linked alerts; it does not decay over time.
- Seed passwords are dev-only and must be replaced before any shared deployment.
- Risk weights and rule thresholds are starting defaults; no precision/recall measurement yet.
- No TLS locally (expected: reverse proxy in deployment).
