-- Week 4/5: asset criticality, alert triage fields, incidents, notes, timeline.
ALTER TABLE log_sources ADD COLUMN IF NOT EXISTS criticality INT NOT NULL DEFAULT 50;

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status_updated_by TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  risk_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','triaged','investigating','contained','resolved','closed','false_positive')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  indicators JSONB NOT NULL DEFAULT '[]',
  closed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_org_updated ON incidents (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_org_status ON incidents (organization_id, status);

CREATE TABLE IF NOT EXISTS incident_alerts (
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, alert_id)
);
CREATE INDEX IF NOT EXISTS idx_incident_alerts_alert ON incident_alerts (alert_id);

CREATE TABLE IF NOT EXISTS incident_notes (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_notes_incident ON incident_notes (incident_id, created_at);

CREATE TABLE IF NOT EXISTS incident_timeline (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON incident_timeline (incident_id, created_at);
