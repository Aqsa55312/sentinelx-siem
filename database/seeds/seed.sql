-- Seed for local dev ONLY. All passwords are 'password123'. Never use in shared/prod deploy.
INSERT INTO organizations (id, name) VALUES ('org-demo-01', 'Demo Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, password_hash) VALUES
  ('user-admin-01', 'admin@sentinelx.local', '$2b$10$rRZNftBFtvCKKBNAtE0Hh.C8dUFUPpvzj/tFuzqeiYgyz7UMH557y'),
  ('user-analyst-01', 'analyst@sentinelx.local', '$2b$10$rRZNftBFtvCKKBNAtE0Hh.C8dUFUPpvzj/tFuzqeiYgyz7UMH557y'),
  ('user-responder-01', 'responder@sentinelx.local', '$2b$10$rRZNftBFtvCKKBNAtE0Hh.C8dUFUPpvzj/tFuzqeiYgyz7UMH557y'),
  ('user-viewer-01', 'viewer@sentinelx.local', '$2b$10$rRZNftBFtvCKKBNAtE0Hh.C8dUFUPpvzj/tFuzqeiYgyz7UMH557y')
ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO memberships (organization_id, user_id, role) VALUES
  ('org-demo-01', 'user-admin-01', 'admin'),
  ('org-demo-01', 'user-analyst-01', 'analyst'),
  ('org-demo-01', 'user-responder-01', 'responder'),
  ('org-demo-01', 'user-viewer-01', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO log_sources (id, organization_id, name, source_type, status, criticality) VALUES
  ('source-demo-01', 'org-demo-01', 'demo-linux-01', 'simulator', 'healthy', 70)
ON CONFLICT (id) DO UPDATE SET criticality = EXCLUDED.criticality;

INSERT INTO detection_rules (id, organization_id, name, version, config, enabled) VALUES
  ('rule-det-001', 'org-demo-01', 'DET-001 brute-force-like', 1,
   '{"threshold": 5, "window_seconds": 300, "event_type": "authentication_failed", "group_by": "src_ip"}', TRUE),
  ('rule-det-002', 'org-demo-01', 'DET-002 suspicious auth sequence', 1,
   '{"min_failures": 3, "window_seconds": 600, "event_types": ["authentication_failed","authentication_success"], "group_by": ["username","src_ip"]}', TRUE),
  ('rule-det-003', 'org-demo-01', 'DET-003 policy anomaly', 1,
   '{"event_type": "admin_action", "baseline_start_hour_utc": 8, "baseline_end_hour_utc": 18}', TRUE),
  ('rule-det-004', 'org-demo-01', 'DET-004 repeated high-risk', 1,
   '{"threshold": 3, "window_seconds": 120, "event_type": "high_risk_event", "group_by": "src_ip"}', TRUE)
ON CONFLICT (id) DO NOTHING;
