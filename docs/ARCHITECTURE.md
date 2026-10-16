# SentinelX — Architecture (ARCHITECTURE.md)

## 1. Komponen

```
React+TS (apps/web)
  Dashboard · Event Explorer · Incident Workspace
        |
Go Core API (apps/api) — :8080
  AuthZ · Ingestion · Detection orchestration · Incidents
   |            |                |
PostgreSQL   OpenSearch*    Detection Worker   Python AI Service*
(tx records) (event search) (rules+correlation) (evidence summaries)
```

`*` = tahap lanjut. **Slice 1:** React + Go + PostgreSQL (+ fallback in-memory) + DET-001 sinkron. Tanpa broker: ingestion sinkron, retry via pola outbox saat OpenSearch ditambahkan.

**Keputusan stack:**
- Go = core API (alasan: konkurensi ingestion, single binary, mudah dioperasikan).
- Python+FastAPI = layanan AI terpisah (alasan: ekosistem LLM/ML), dipanggil dengan konteks tersanitasi + timeout.
- PostgreSQL = sumber kebenaran transaksional (users, orgs, rules, alerts, incidents, audit).
- OpenSearch = indeks pencarian event (ditambahkan saat volume/pencarian membutuhkannya; bukan pengganti DB).
- Redis = cache/rate-limit/koordinasi (tahap lanjut).
- Docker Compose = dev/demo; Nginx = TLS termination saat deploy.

## 2. Data flow end-to-end

1. Sumber kirim event via `POST /api/v1/ingest/events` (auth + `Idempotency-Key`) atau upload JSONL.
2. Go validasi auth, izin, ukuran payload, schema.
3. Normalisasi: `event_id`, timestamp UTC, `source_type/name`, `event_type`, IP/username/message/attributes. Redaksi secret.
4. Simpan di PostgreSQL (`events`); indeks ke OpenSearch via outbox/retry (tahap lanjut).
5. Detection worker evaluasi rule (slice 1: DET-001 sinkron) → tulis `alerts` + `alert_events`.
6. Analis buka alert → buat/update incident.
7. AI service terima konteks tersanitasi → kembalikan ringkasan terstruktur (tahap 6).
8. Respons: preview → approve → eksekusi di simulator → audit log.

PostgreSQL dan OpenSearch **tidak satu transaksi**: gunakan transactional outbox atau retry agar event tersimpan tidak hilang dari indeks.

## 3. Database design (PostgreSQL, MVP)

Tabel inti: `organizations, users, memberships, log_sources, events, detection_rules, alerts, alert_events, incidents, incident_alerts, incident_notes, ai_reports, response_actions, approvals, audit_logs`.

Relasi: org 1—N users (via memberships); source 1—N events; rule 1—N alerts; alert N—M events (via alert_events); incident N—M alerts; incident 1—N notes/reports/actions.

Aturan penting:
- UUID/ID konsisten, FK + unique constraints.
- Indeks: `organization_id`, `timestamp`, `status`, FK sering dipakai; gabungan `(organization_id, timestamp)` untuk pencarian event.
- Waktu UTC; jangan simpan API secret di kolom config biasa.
- Tenant filtering di backend + pertimbangkan Row-Level Security.
- Retensi event & audit didefinisikan sejak awal.
- Lihat `database/migrations/001_init.sql` untuk DDL slice 1.

## 4. Kontrak API (`/api/v1`)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| POST | /auth/login | Login |
| GET | /dashboard/overview | Ringkasan dashboard |
| POST | /sources | Buat sumber log |
| GET | /sources | Daftar sumber |
| POST | /ingest/events | Kirim event (202 Accepted bila async) |
| POST | /ingest/upload | Upload JSONL |
| GET | /events | Cari event + pagination |
| GET | /events/{id} | Detail event |
| GET | /alerts | Daftar alert |
| GET | /alerts/{id} | Detail alert + bukti |
| POST | /alerts/{id}/incidents | Buat insiden dari alert |
| GET | /incidents | Daftar insiden |
| GET | /incidents/{id} | Detail + timeline |
| PATCH | /incidents/{id} | Update status/assignment |
| POST | /incidents/{id}/notes | Tambah catatan |
| POST | /incidents/{id}/ai-summary | Minta ringkasan AI |
| POST | /incidents/{id}/response-actions | Rencana respons |
| POST | /response-actions/{id}/approve | Setujui |
| POST | /response-actions/{id}/reject | Tolak |
| GET | /audit-logs | Audit trail |

Detail field: lihat `packages/api-contracts/openapi.yaml` (slice 1 mencakup auth, ingest, events, alerts, dashboard).

Contoh ingest:

```http
POST /api/v1/ingest/events
Authorization: Bearer <token>
Idempotency-Key: demo-event-0001
{"source_id":"source-demo-01","events":[{"timestamp":"2026-10-16T08:30:00Z","event_type":"authentication_failed","username":"demo-user","src_ip":"192.0.2.10","message":"Authentication failed"}]}
```

Gunakan IP dokumentasi (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) untuk simulasi — bukan target nyata.

## 5. Event schema (ringkas)

```json
{"event_id":"evt_01JXYZ","timestamp":"2026-10-16T08:30:00Z","source_type":"auth","source_name":"demo-linux-01","event_type":"authentication_failed","severity":"medium","src_ip":"192.0.2.10","username":"demo-user","message":"Authentication failed","attributes":{"protocol":"ssh","environment":"lab"}}
```

Kontrak penuh: `packages/event-schema/event.json`.

## 6. Threat model (ringkas)

- **Aset:** kredensial, log (mungkin sensitif), rule config, insiden, audit.
- **Ancaman:** akses lintas-tenant, privilege escalation pada approval, injection via log (prompt injection / XSS di message), secret tersimpan mentah, SSRF via source config, DoS via payload besar.
- **Kontrol slice 1:** RBAC server-side, isolasi org per query, validasi ukuran+schema, redaksi secret, parameterized query, token expiry, audit auth, Idempotency-Key, batas rate dasar.
- **Belum di MVP:** TLS (di reverse proxy saat deploy), KMS/HSM, SIEM connector penuh, aksi containment nyata.

## 7. Observability & operasi

- `GET /healthz` (liveness), log terstruktur + correlation ID, metrics dasar (counter ingest/detect), health ingestion per source.
- Retensi & backup/restore didefinisikan di NFR-09/10; diimplementasikan bertahap.
