-- SentinelX slice 1 DDL (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','analyst','responder','viewer')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS log_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'simulator',
  status TEXT NOT NULL DEFAULT 'healthy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES log_sources(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  src_ip TEXT,
  username TEXT,
  message TEXT,
  attributes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_org_ts ON events (organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_src_ip ON events (src_ip);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);

CREATE TABLE IF NOT EXISTS detection_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES detection_rules(id) ON DELETE SET NULL,
  rule_version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_org_created ON alerts (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_events (
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'trigger',
  PRIMARY KEY (alert_id, event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  result TEXT NOT NULL DEFAULT 'ok',
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs (organization_id, created_at DESC);
