package main

import (
	"strings"
	"testing"
	"time"
)

func seedN(st *MemoryStore, n int) {
	base := time.Now().UTC().Add(-time.Duration(n) * time.Minute)
	for i := 0; i < n; i++ {
		raw := []map[string]any{{
			"timestamp":  base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339),
			"event_type": "authentication_failed",
			"src_ip":     "192.0.2.99",
			"username":   "u",
			"message":    "x",
		}}
		st.Ingest("org-demo-01", "source-demo-01", raw)
	}
}

func TestListEvents_Pagination(t *testing.T) {
	st := NewMemoryStore()
	seedN(st, 10)
	p1, total := st.ListEvents("org-demo-01", EventFilter{}, 4, 0)
	if total != 10 || len(p1) != 4 {
		t.Fatalf("page1: got %d total=%d, want 4/10", len(p1), total)
	}
	p2, _ := st.ListEvents("org-demo-01", EventFilter{}, 4, 4)
	p3, _ := st.ListEvents("org-demo-01", EventFilter{}, 4, 8)
	if len(p2) != 4 || len(p3) != 2 {
		t.Fatalf("pages: %d %d, want 4 2", len(p2), len(p3))
	}
	// Newest first: page 1 timestamps must be >= page 2.
	if p1[0].Timestamp.Before(p2[0].Timestamp) {
		t.Fatal("ordering is not newest-first")
	}
	// Offset past end returns empty with correct total.
	past, total := st.ListEvents("org-demo-01", EventFilter{}, 4, 100)
	if len(past) != 0 || total != 10 {
		t.Fatalf("past-end: %d total=%d", len(past), total)
	}
}

func TestListEvents_Filters(t *testing.T) {
	st := NewMemoryStore()
	now := time.Now().UTC()
	st.Ingest("org-demo-01", "source-demo-01", []map[string]any{
		{"timestamp": now.Format(time.RFC3339), "event_type": "authentication_failed", "src_ip": "192.0.2.11", "username": "alice", "message": "a"},
		{"timestamp": now.Format(time.RFC3339), "event_type": "web_request", "src_ip": "192.0.2.12", "username": "bob", "message": "b"},
	})
	if got, total := st.ListEvents("org-demo-01", EventFilter{EventType: "web_request"}, 50, 0); total != 1 || got[0].Username != "bob" {
		t.Fatalf("event_type filter: %d", total)
	}
	if _, total := st.ListEvents("org-demo-01", EventFilter{SrcIP: "192.0.2.11"}, 50, 0); total != 1 {
		t.Fatalf("src_ip filter: %d", total)
	}
	if _, total := st.ListEvents("org-demo-01", EventFilter{Username: "alice"}, 50, 0); total != 1 {
		t.Fatalf("username filter: %d", total)
	}
	f := EventFilter{HasFrom: true, From: now.Add(-time.Minute), HasTo: true, To: now.Add(time.Minute)}
	if _, total := st.ListEvents("org-demo-01", f, 50, 0); total != 2 {
		t.Fatalf("time range filter: %d", total)
	}
	f.To = now.Add(-time.Hour)
	if _, total := st.ListEvents("org-demo-01", f, 50, 0); total != 0 {
		t.Fatalf("empty range should match 0, got %d", total)
	}
}

func TestSources_CRUDIsolated(t *testing.T) {
	st := NewMemoryStore()
	if got := st.ListSources("org-demo-01"); len(got) != 1 {
		t.Fatalf("seed sources: %d", len(got))
	}
	src, err := st.CreateSource("org-demo-01", "web-01", "web", 50)
	if err != nil || src.ID == "" {
		t.Fatalf("create: %v", err)
	}
	if _, err := st.CreateSource("org-demo-01", "  ", "web", 50); err == nil {
		t.Fatal("empty name must fail")
	}
	if _, err := st.CreateSource("org-demo-01", "x", "firewall", 50); err == nil {
		t.Fatal("unknown type must fail")
	}
	if got := st.ListSources("org-other"); len(got) != 0 {
		t.Fatal("sources leak across tenants")
	}
}

func TestParseUpload_JSONL(t *testing.T) {
	body := "{\"timestamp\":\"2026-10-16T08:30:00Z\",\"event_type\":\"web_request\",\"message\":\"ok\"}\n\nnot-json\n{\"timestamp\":\"2026-10-16T08:31:00Z\",\"event_type\":\"generic\"}\n"
	raw, rej, err := parseUploadFile(strings.NewReader(body), "events.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != 2 || rej != 1 {
		t.Fatalf("parsed=%d rejected=%d, want 2/1", len(raw), rej)
	}
}

func TestParseUpload_JSONArray(t *testing.T) {
	body := `[{"timestamp":"2026-10-16T08:30:00Z","event_type":"generic"},{"timestamp":"2026-10-16T08:31:00Z","event_type":"generic"}]`
	raw, rej, err := parseUploadFile(strings.NewReader(body), "events.json")
	if err != nil || len(raw) != 2 || rej != 0 {
		t.Fatalf("array: %d rej=%d err=%v", len(raw), rej, err)
	}
	if _, _, err := parseUploadFile(strings.NewReader(`{"not":"array"}`), "events.json"); err == nil {
		t.Fatal("non-array .json must fail")
	}
}
