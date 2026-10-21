package main

import (
	"strings"
	"testing"
	"time"
)

func seedAlert(t *testing.T, st *MemoryStore, ip, user string) Alert {
	t.Helper()
	ts := time.Now().UTC().Add(-time.Minute)
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", []map[string]any{{
		"timestamp": ts.Format(time.RFC3339), "event_type": "authentication_failed",
		"src_ip": ip, "username": user, "message": "test failure",
	}})
	if len(accepted) != 1 {
		t.Fatalf("seed event rejected: %d", len(accepted))
	}
	return st.CreateAlert(Alert{
		OrgID: "org-demo-01", RuleID: "rule-test", RuleVersion: 1,
		Title: "Test alert for " + ip, Severity: "high", RiskScore: 70,
		Status: "new", EventIDs: []string{accepted[0].ID},
	})
}

func TestCorrelateAlerts_GroupsSharedIndicators(t *testing.T) {
	st := NewMemoryStore()
	a1 := seedAlert(t, st, "192.0.2.10", "demo-user")
	a2 := seedAlert(t, st, "192.0.2.10", "demo-user")
	a3 := seedAlert(t, st, "198.51.100.7", "other-user")

	res := correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a1})
	if res.Created != 1 || len(res.IncidentIDs) != 1 {
		t.Fatalf("first alert: %+v", res)
	}
	incidentID := res.IncidentIDs[0]

	res = correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a2})
	if res.Updated != 1 || res.Created != 0 || res.IncidentIDs[0] != incidentID {
		t.Fatalf("correlated alert should attach: %+v", res)
	}

	res = correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a3})
	if res.Created != 1 {
		t.Fatalf("unrelated alert should create incident: %+v", res)
	}

	incidents := st.ListIncidents("org-demo-01")
	if len(incidents) != 2 {
		t.Fatalf("incidents=%d, want 2", len(incidents))
	}
	detail, ok := st.GetIncident("org-demo-01", incidentID)
	if !ok {
		t.Fatal("incident detail missing")
	}
	if len(detail.Alerts) != 2 || detail.Incident.AlertCount != 2 {
		t.Fatalf("linked alerts=%d count=%d, want 2/2", len(detail.Alerts), detail.Incident.AlertCount)
	}
	if len(detail.Events) != 2 {
		t.Fatalf("evidence events=%d, want 2", len(detail.Events))
	}
	if !strings.Contains(strings.Join(detail.Incident.Indicators, ","), "ip:192.0.2.10") {
		t.Fatalf("indicators missing ip: %v", detail.Incident.Indicators)
	}
}

func TestCorrelateAlerts_DoesNotReuseClosedIncident(t *testing.T) {
	st := NewMemoryStore()
	a1 := seedAlert(t, st, "192.0.2.44", "demo-user")
	res := correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a1})
	incidentID := res.IncidentIDs[0]

	if _, err := st.UpdateIncident("org-demo-01", incidentID, "user-analyst-01", IncidentPatch{
		Status: incidentStatusFalsePositive, ClosedReason: "benign scanner",
	}); err != nil {
		t.Fatal(err)
	}

	a2 := seedAlert(t, st, "192.0.2.44", "demo-user")
	res = correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a2})
	if res.Created != 1 {
		t.Fatalf("closed incident must not be reused: %+v", res)
	}
	if res.IncidentIDs[0] == incidentID {
		t.Fatal("reused a closed incident")
	}
}

func TestContainedIncident_StaysOpenButDoesNotCorrelate(t *testing.T) {
	st := NewMemoryStore()
	a1 := seedAlert(t, st, "192.0.2.55", "demo-user")
	res := correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a1})
	incidentID := res.IncidentIDs[0]

	if _, err := st.UpdateIncident("org-demo-01", incidentID, "user-analyst-01", IncidentPatch{
		Status: incidentStatusInvestigating,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.UpdateIncident("org-demo-01", incidentID, "user-analyst-01", IncidentPatch{
		Status: incidentStatusContained,
	}); err != nil {
		t.Fatal(err)
	}

	// Contained cases are still open on the dashboard...
	if got := st.Overview("org-demo-01")["active_incidents"]; got != 1 {
		t.Fatalf("active_incidents=%v, want 1", got)
	}

	// ...but new detections must not be attached to a contained case.
	a2 := seedAlert(t, st, "192.0.2.55", "demo-user")
	res = correlateAlerts(st, "org-demo-01", "detection-engine", []Alert{a2})
	if res.Created != 1 {
		t.Fatalf("contained incident must not receive new alerts: %+v", res)
	}
	if res.IncidentIDs[0] == incidentID {
		t.Fatal("reused a contained incident")
	}
}

func TestAlertTriage_StatusAndTenantIsolation(t *testing.T) {
	st := NewMemoryStore()
	a := seedAlert(t, st, "192.0.2.11", "demo-user")

	got, err := st.UpdateAlertStatus("org-demo-01", a.ID, "triaged", "user-analyst-01", "")
	if err != nil || got.Status != "triaged" {
		t.Fatalf("triage: %v status=%s", err, got.Status)
	}
	if _, err := st.UpdateAlertStatus("org-demo-01", a.ID, "false_positive", "user-analyst-01", ""); err == nil {
		t.Fatal("false_positive without reason must fail")
	}
	if _, err := st.UpdateAlertStatus("org-demo-01", a.ID, "false_positive", "user-analyst-01", "known test"); err != nil {
		t.Fatalf("false_positive with reason: %v", err)
	}
	if _, err := st.UpdateAlertStatus("org-other", a.ID, "closed", "user-analyst-01", "x"); err == nil {
		t.Fatal("cross-tenant update must fail")
	}
	if _, err := st.UpdateAlertStatus("org-demo-01", a.ID, "bogus", "user-analyst-01", ""); err == nil {
		t.Fatal("unknown status must fail")
	}
}

func TestIncidentWorkflow(t *testing.T) {
	st := NewMemoryStore()
	a1 := seedAlert(t, st, "203.0.113.5", "alice")
	a2 := seedAlert(t, st, "203.0.113.5", "alice")

	inc, err := st.CreateIncident("org-demo-01", "user-analyst-01", []string{a1.ID, a2.ID}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if inc.Status != incidentStatusNew || inc.AlertCount != 2 {
		t.Fatalf("created incident: %+v", inc)
	}

	// Invalid jump is rejected.
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-analyst-01", IncidentPatch{Status: incidentStatusResolved}); err == nil {
		t.Fatal("new -> resolved must be rejected")
	}

	// Valid transitions + assignment + note.
	assignee := "user-analyst-01"
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-admin-01", IncidentPatch{
		Status: incidentStatusInvestigating, AssigneeID: &assignee,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.AddIncidentNote("org-demo-01", inc.ID, "user-analyst-01", "Checked auth logs; no lateral movement."); err != nil {
		t.Fatal(err)
	}
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-analyst-01", IncidentPatch{
		Status: incidentStatusFalsePositive,
	}); err == nil {
		t.Fatal("false_positive without reason must be rejected")
	}
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-admin-01", IncidentPatch{
		Status: incidentStatusFalsePositive, ClosedReason: "red-team exercise",
	}); err != nil {
		t.Fatal(err)
	}

	detail, ok := st.GetIncident("org-demo-01", inc.ID)
	if !ok {
		t.Fatal("detail missing")
	}
	if detail.Incident.Status != incidentStatusFalsePositive || detail.Incident.ClosedReason != "red-team exercise" {
		t.Fatalf("incident state: %+v", detail.Incident)
	}
	if len(detail.Notes) != 1 || len(detail.Timeline) < 4 {
		t.Fatalf("notes=%d timeline=%d", len(detail.Notes), len(detail.Timeline))
	}
	for _, a := range detail.Alerts {
		if a.Status != "false_positive" {
			t.Fatalf("linked alert status=%s, want false_positive", a.Status)
		}
	}
	if _, ok := st.GetIncident("org-other", inc.ID); ok {
		t.Fatal("cross-tenant incident read must fail")
	}
	if _, err := st.UpdateIncident("org-other", inc.ID, "user-admin-01", IncidentPatch{Title: strPtr("hijack")}); err == nil {
		t.Fatal("cross-tenant incident update must fail")
	}
}

func TestIncidentAssignmentValidation(t *testing.T) {
	st := NewMemoryStore()
	a := seedAlert(t, st, "203.0.113.9", "bob")
	inc, err := st.CreateIncident("org-demo-01", "user-analyst-01", []string{a.ID}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	bad := "user-does-not-exist"
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-admin-01", IncidentPatch{AssigneeID: &bad}); err == nil {
		t.Fatal("unknown assignee must fail")
	}
	empty := ""
	if _, err := st.UpdateIncident("org-demo-01", inc.ID, "user-admin-01", IncidentPatch{AssigneeID: &empty}); err != nil {
		t.Fatalf("unassign: %v", err)
	}
}

func TestCreateSource_CriticalityValidation(t *testing.T) {
	st := NewMemoryStore()
	if _, err := st.CreateSource("org-demo-01", "critical-host", "host", 101); err == nil {
		t.Fatal("criticality > 100 must fail")
	}
	src, err := st.CreateSource("org-demo-01", "critical-host", "host", 95)
	if err != nil || src.Criticality != 95 {
		t.Fatalf("create critical source: %v %+v", err, src)
	}
	if got := st.Criticality("org-demo-01", src.ID); got != 95 {
		t.Fatalf("criticality=%d, want 95", got)
	}
	if got := st.Criticality("org-demo-01", "unknown-source"); got != 50 {
		t.Fatalf("unknown source fallback=%d, want 50", got)
	}
}

func TestAssetCriticality_AffectsDetectionRisk(t *testing.T) {
	st := NewMemoryStore()
	src, err := st.CreateSource("org-demo-01", "critical-auth", "auth", 100)
	if err != nil {
		t.Fatal(err)
	}
	base := time.Now().UTC().Add(-time.Minute)
	raw := make([]map[string]any, 0, 5)
	for i := 0; i < 5; i++ {
		raw = append(raw, map[string]any{
			"timestamp":  base.Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			"event_type": "authentication_failed",
			"src_ip":     "192.0.2.200",
			"username":   "demo-user",
			"message":    "fail",
		})
	}
	accepted, _ := st.Ingest("org-demo-01", src.ID, raw)
	fired := evaluateAll(st, "org-demo-01", accepted)
	if len(fired) != 1 {
		t.Fatalf("fired=%d, want 1", len(fired))
	}
	// 0.4*75 (high) + 0.3*80 (confidence) + 0.2*100 (asset) + 0.1*50 (behavior)
	want := 30 + 24 + 20 + 5
	if fired[0].RiskScore != want {
		t.Fatalf("risk=%d, want %d", fired[0].RiskScore, want)
	}
}

func strPtr(s string) *string { return &s }
