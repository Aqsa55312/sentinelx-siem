package main

import (
	"fmt"
	"testing"
	"time"
)

// mkEvent builds a raw event map for tests.
func mkEvent(ts time.Time, typ, ip, user string, attrs map[string]any) map[string]any {
	m := map[string]any{
		"timestamp":  ts.UTC().Format(time.RFC3339),
		"event_type": typ,
		"src_ip":     ip,
		"username":   user,
		"message":    typ,
	}
	if attrs != nil {
		m["attributes"] = attrs
	}
	return m
}

func ids(evs []Event) []string {
	out := make([]string, 0, len(evs))
	for _, e := range evs {
		out = append(out, e.ID)
	}
	return out
}

// TC-03: repeated failures followed by a success must fire DET-002 exactly once.
func TestDET002_FiresOnFailureThenSuccess(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC)
	var raw []map[string]any
	for i := 0; i < 4; i++ {
		raw = append(raw, mkEvent(base.Add(time.Duration(i)*30*time.Second), "authentication_failed", "192.0.2.50", "demo-user", nil))
	}
	raw = append(raw, mkEvent(base.Add(3*time.Minute), "authentication_success", "192.0.2.50", "demo-user", nil))

	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	fired := evaluateAll(st, "org-demo-01", accepted)

	det002 := filterRule(fired, det002RuleID)
	if len(det002) != 1 {
		t.Fatalf("DET-002 alerts = %d, want 1", len(det002))
	}
	if len(det002[0].EventIDs) != 5 {
		t.Fatalf("evidence = %d, want 4 failures + 1 success", len(det002[0].EventIDs))
	}
	if det002[0].RiskScore <= 0 || det002[0].RiskScore > 100 {
		t.Fatalf("risk out of range: %d", det002[0].RiskScore)
	}
}

// DET-002 negative: a success with no preceding failures must stay silent.
func TestDET002_SilentWithoutFailures(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC)
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", []map[string]any{
		mkEvent(base, "authentication_success", "192.0.2.51", "quiet-user", nil),
	})
	fired := evaluateAll(st, "org-demo-01", accepted)
	if got := filterRule(fired, det002RuleID); len(got) != 0 {
		t.Fatalf("DET-002 alerts = %d, want 0", len(got))
	}
}

// DET-002 negative: failures below the minimum do not trigger.
func TestDET002_SilentBelowMinimum(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC)
	raw := []map[string]any{
		mkEvent(base, "authentication_failed", "192.0.2.52", "low-user", nil),
		mkEvent(base.Add(time.Minute), "authentication_failed", "192.0.2.52", "low-user", nil),
		mkEvent(base.Add(2*time.Minute), "authentication_success", "192.0.2.52", "low-user", nil),
	}
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if got := filterRule(evaluateAll(st, "org-demo-01", accepted), det002RuleID); len(got) != 0 {
		t.Fatalf("DET-002 alerts = %d, want 0", len(got))
	}
}

// DET-002 must not correlate across different accounts or sources.
func TestDET002_RequiresSameAccountAndSource(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC)
	var raw []map[string]any
	for i := 0; i < 4; i++ {
		raw = append(raw, mkEvent(base.Add(time.Duration(i)*30*time.Second), "authentication_failed", "192.0.2.53", "alice", nil))
	}
	raw = append(raw, mkEvent(base.Add(3*time.Minute), "authentication_success", "192.0.2.54", "alice", nil))
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if got := filterRule(evaluateAll(st, "org-demo-01", accepted), det002RuleID); len(got) != 0 {
		t.Fatalf("DET-002 cross-source alert = %d, want 0", len(got))
	}
}

// DET-003: admin action outside baseline hours fires; inside baseline does not.
func TestDET003_PolicyAnomaly(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 2, 15, 0, 0, time.UTC)
	raw := []map[string]any{
		mkEvent(base, "admin_action", "192.0.2.60", "night-admin", map[string]any{"action": "user.create"}),
		mkEvent(time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC), "admin_action", "192.0.2.61", "day-admin", nil),
	}
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	got := filterRule(evaluateAll(st, "org-demo-01", accepted), det003RuleID)
	if len(got) != 1 {
		t.Fatalf("DET-003 alerts = %d, want 1 (only the 02:15 action)", len(got))
	}
	if got[0].Severity != "medium" {
		t.Fatalf("severity = %s, want medium", got[0].Severity)
	}
}

// DET-003 baseline override via attributes keeps lab scenarios configurable.
func TestDET003_BaselineOverride(t *testing.T) {
	st := NewMemoryStore()
	ts := time.Date(2026, 10, 16, 22, 0, 0, 0, time.UTC)
	raw := []map[string]any{
		mkEvent(ts, "admin_action", "192.0.2.62", "ops-admin", map[string]any{"baseline_start_hour": 0, "baseline_end_hour": 24}),
	}
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if got := filterRule(evaluateAll(st, "org-demo-01", accepted), det003RuleID); len(got) != 0 {
		t.Fatalf("DET-003 alerts = %d, want 0 with 24h baseline", len(got))
	}
}

// DET-004: repeated high-risk events in a short window fire; below threshold does not.
func TestDET004_RepeatedHighRisk(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 11, 0, 0, 0, time.UTC)
	var raw []map[string]any
	for i := 0; i < 3; i++ {
		raw = append(raw, mkEvent(base.Add(time.Duration(i)*20*time.Second), "high_risk_event", "192.0.2.70", "u", nil))
	}
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if got := filterRule(evaluateAll(st, "org-demo-01", accepted), det004RuleID); len(got) != 1 {
		t.Fatalf("DET-004 alerts = %d, want 1", len(got))
	}
}

func TestDET004_SilentBelowThreshold(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 11, 0, 0, 0, time.UTC)
	var raw []map[string]any
	for i := 0; i < 2; i++ {
		raw = append(raw, mkEvent(base.Add(time.Duration(i)*20*time.Second), "high_risk_event", "192.0.2.71", "u", nil))
	}
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if got := filterRule(evaluateAll(st, "org-demo-01", accepted), det004RuleID); len(got) != 0 {
		t.Fatalf("DET-004 alerts = %d, want 0", len(got))
	}
}

// Deduplication: the same attack window uploaded twice with different event ids
// must not create a second alert for the same rule + bucket.
func TestAlertDedupe_SameWindowTwice(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

	batch1 := mkFailures(6, "192.0.2.80", base)
	acc1, _ := st.Ingest("org-demo-01", "source-demo-01", batch1)
	fired1 := filterRule(evaluateAll(st, "org-demo-01", acc1), det001RuleID)

	// Re-upload the same window but with newly generated event ids.
	batch2 := mkFailures(6, "192.0.2.80", base)
	for i := range batch2 {
		batch2[i]["event_id"] = fmt.Sprintf("evt-retry-%d", i)
	}
	acc2, _ := st.Ingest("org-demo-01", "source-demo-01", batch2)
	fired2 := filterRule(evaluateAll(st, "org-demo-01", acc2), det001RuleID)

	if len(fired1) != 1 || len(fired2) != 0 {
		t.Fatalf("dedupe: first=%d second=%d, want 1/0", len(fired1), len(fired2))
	}
	if alerts := st.ListAlerts("org-demo-01"); len(alerts) != 1 {
		t.Fatalf("stored alerts = %d, want 1", len(alerts))
	}
}

// A later attack in a different time bucket must still alert.
func TestAlertDedupe_NewWindowStillAlerts(t *testing.T) {
	st := NewMemoryStore()
	base := time.Date(2026, 10, 16, 13, 0, 0, 0, time.UTC)
	acc1, _ := st.Ingest("org-demo-01", "source-demo-01", mkFailures(6, "192.0.2.81", base))
	evaluateAll(st, "org-demo-01", acc1)
	acc2, _ := st.Ingest("org-demo-01", "source-demo-01", mkFailures(6, "192.0.2.81", base.Add(30*time.Minute)))
	fired := filterRule(evaluateAll(st, "org-demo-01", acc2), det001RuleID)
	if len(fired) != 1 {
		t.Fatalf("later window alerts = %d, want 1", len(fired))
	}
}

func filterRule(alerts []Alert, ruleID string) []Alert {
	var out []Alert
	for _, a := range alerts {
		if a.RuleID == ruleID {
			out = append(out, a)
		}
	}
	return out
}

var _ = ids // keeps helper available for debugging in go test -v later
