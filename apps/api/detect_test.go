package main

import (
	"fmt"
	"testing"
	"time"
)

func mkFailures(n int, ip string, start time.Time) []map[string]any {
	var out []map[string]any
	for i := 0; i < n; i++ {
		out = append(out, map[string]any{
			"timestamp":  start.Add(time.Duration(i*40) * time.Second).UTC().Format(time.RFC3339),
			"event_type": "authentication_failed",
			"username":   "demo-user",
			"src_ip":     ip,
			"message":    "Authentication failed",
		})
	}
	return out
}

// TC-01: failures above threshold MUST fire DET-001.
func TestDET001_FiresAboveThreshold(t *testing.T) {
	st := NewMemoryStore()
	base := time.Now().UTC().Add(-4 * time.Minute)
	accepted, rej := st.Ingest("org-demo-01", "source-demo-01", mkFailures(6, "192.0.2.10", base))
	if rej != 0 || len(accepted) != 6 {
		t.Fatalf("ingest = %d accepted %d rejected, want 6/0", len(accepted), rej)
	}
	fired := evaluateDET001(st, "org-demo-01", accepted)
	if len(fired) != 1 {
		t.Fatalf("fired = %d, want 1", len(fired))
	}
	if fired[0].RuleID != "rule-det-001" || len(fired[0].EventIDs) != 6 {
		t.Fatalf("bad alert: %+v", fired[0])
	}
	if fired[0].RiskScore <= 0 || fired[0].RiskScore > 100 {
		t.Fatalf("risk out of range: %d", fired[0].RiskScore)
	}
}

// TC-02: failures below threshold MUST NOT fire.
func TestDET001_SilentBelowThreshold(t *testing.T) {
	st := NewMemoryStore()
	base := time.Now().UTC().Add(-4 * time.Minute)
	accepted, _ := st.Ingest("org-demo-01", "source-demo-01", mkFailures(4, "192.0.2.20", base))
	if fired := evaluateDET001(st, "org-demo-01", accepted); len(fired) != 0 {
		t.Fatalf("fired = %d, want 0", len(fired))
	}
}

// TC-05: duplicate event_id must not duplicate storage.
func TestIngest_Idempotent(t *testing.T) {
	st := NewMemoryStore()
	raw := []map[string]any{{
		"event_id": "evt-dup-001", "timestamp": time.Now().UTC().Format(time.RFC3339),
		"event_type": "authentication_failed", "src_ip": "192.0.2.30", "message": "x",
	}}
	a1, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	a2, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if len(a1) != 1 || len(a2) != 0 {
		t.Fatalf("idempotency broken: %d then %d", len(a1), len(a2))
	}
}

// TC-06: tenant isolation — org A cannot read org B events.
func TestTenantIsolation(t *testing.T) {
	st := NewMemoryStore()
	raw := []map[string]any{{
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"event_type": "authentication_failed", "src_ip": "192.0.2.40", "message": "x",
	}}
	st.Ingest("org-demo-01", "source-demo-01", raw)
	if got, total := st.ListEvents("org-other", EventFilter{}, 50, 0); len(got) != 0 || total != 0 {
		t.Fatalf("cross-tenant leak: %d events total=%d", len(got), total)
	}
}

// TC-04: invalid payload rejected and counted.
func TestIngest_InvalidRejected(t *testing.T) {
	st := NewMemoryStore()
	raw := []map[string]any{{"event_type": "nope-not-valid"}}
	_, rej := st.Ingest("org-demo-01", "source-demo-01", raw)
	if rej != 1 {
		t.Fatalf("rejected = %d, want 1", rej)
	}
}

// Secrets must be redacted, never stored raw.
func TestRedaction(t *testing.T) {
	st := NewMemoryStore()
	raw := []map[string]any{{
		"timestamp": time.Now().UTC().Format(time.RFC3339), "event_type": "web_request",
		"message":    "call with Bearer abcdef123456",
		"attributes": map[string]any{"api_key": "super-secret", "user": "u"},
	}}
	acc, _ := st.Ingest("org-demo-01", "source-demo-01", raw)
	if len(acc) != 1 {
		t.Fatal("ingest failed")
	}
	e, _ := st.GetEvent("org-demo-01", acc[0].ID)
	if e.Attributes["api_key"] == "super-secret" {
		t.Fatal("secret stored raw")
	}
	fmt.Println("redacted message:", e.Message)
}
