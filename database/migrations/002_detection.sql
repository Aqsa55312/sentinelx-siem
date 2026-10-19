-- Week 3: per-rule alert de-duplication key + query support.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- One open alert per (org, rule, dedupe_key) window; supports DET-001..DET-004.
CREATE INDEX IF NOT EXISTS idx_alerts_dedupe ON alerts (organization_id, rule_id, dedupe_key);

-- Detection needs ordered window scans for correlation-style rules.
CREATE INDEX IF NOT EXISTS idx_events_org_ip_user_ts ON events (organization_id, src_ip, username, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_org_type_ts ON events (organization_id, event_type, timestamp);
