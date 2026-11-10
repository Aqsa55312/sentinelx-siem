-- Week 7: response simulation + approval flow.
-- All actions are simulated only; no production command is ever executed.
CREATE TABLE IF NOT EXISTS response_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('disable_user','isolate_host','block_ip','notify')),
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','failed')),
  created_by TEXT NOT NULL,
  approver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  executed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_response_actions_incident ON response_actions (incident_id);
CREATE INDEX IF NOT EXISTS idx_response_actions_org_status ON response_actions (organization_id, status);
