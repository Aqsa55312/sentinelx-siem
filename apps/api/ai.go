// Week 6: AI-assisted investigation. Memanggil layanan AI terpisah (Python/FastAPI)
// dengan konteks insiden yang sudah di-sanitasi, lalu mengembalikan ringkasan
// terstruktur berdasar bukti. AI hanya sebagai asisten; tidak ada eksekusi perintah.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultAIServiceURL = "http://localhost:8000"
const defaultAITimeout = 30 * time.Second

type aiEvent struct {
	EventID    string         `json:"event_id"`
	Timestamp  string         `json:"timestamp"`
	EventType  string         `json:"event_type"`
	Severity   string         `json:"severity"`
	SrcIP      string         `json:"src_ip,omitempty"`
	Username   string         `json:"username,omitempty"`
	Message    string         `json:"message,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

type aiAlert struct {
	AlertID   string `json:"alert_id"`
	RuleID   string `json:"rule_id"`
	Title    string `json:"title"`
	Severity string `json:"severity"`
	RiskScore int   `json:"risk_score"`
	Status   string `json:"status"`
}

type aiNote struct {
	AuthorID string `json:"author_id"`
	Body     string `json:"body"`
}

type aiInvestigateRequest struct {
	IncidentID  string    `json:"incident_id"`
	Title       string    `json:"title"`
	Severity    string    `json:"severity"`
	RiskScore   int       `json:"risk_score"`
	Status      string    `json:"status"`
	Indicators  []string  `json:"indicators"`
	Events      []aiEvent `json:"events"`
	Alerts      []aiAlert `json:"alerts"`
	Notes       []aiNote  `json:"notes"`
	CreatedBy   string    `json:"created_by"`
}

func aiServiceURL() string {
	if u := os.Getenv("AI_SERVICE_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return defaultAIServiceURL
}

func aiServiceTimeout() time.Duration {
	if v := os.Getenv("AI_SERVICE_TIMEOUT"); v != "" {
		if d, err := strconv.ParseFloat(v, 64); err == nil && d > 0 {
			return time.Duration(d * float64(time.Second))
		}
	}
	return defaultAITimeout
}

func handleAISummary(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	detail, ok := st.GetIncident(cl.OrgID, id)
	if !ok {
		writeErr(w, 404, "incident not found")
		return
	}

	inc := detail.Incident
	req := aiInvestigateRequest{
		IncidentID: inc.ID,
		Title:      inc.Title,
		Severity:   inc.Severity,
		RiskScore:  inc.RiskScore,
		Status:     inc.Status,
		Indicators: inc.Indicators,
		CreatedBy:  inc.CreatedBy,
	}
	for _, e := range detail.Events {
		req.Events = append(req.Events, aiEvent{
			EventID:    e.ID,
			Timestamp:  e.Timestamp.UTC().Format(time.RFC3339),
			EventType:  e.EventType,
			Severity:   e.Severity,
			SrcIP:      e.SrcIP,
			Username:   e.Username,
			Message:    e.Message,
			Attributes: e.Attributes,
		})
	}
	for _, a := range detail.Alerts {
		req.Alerts = append(req.Alerts, aiAlert{
			AlertID:    a.ID,
			RuleID:     a.RuleID,
			Title:      a.Title,
			Severity:   a.Severity,
			RiskScore:  a.RiskScore,
			Status:     a.Status,
		})
	}
	for _, n := range detail.Notes {
		req.Notes = append(req.Notes, aiNote{
			AuthorID: n.AuthorID,
			Body:     n.Body,
		})
	}

	body, err := json.Marshal(req)
	if err != nil {
		writeErr(w, 500, "failed to build AI request")
		return
	}

	client := &http.Client{Timeout: aiServiceTimeout()}
	resp, err := client.Post(aiServiceURL()+"/investigate", "application/json", strings.NewReader(string(body)))
	if err != nil {
		st.Audit(cl.OrgID, cl.UserID, "incident.ai_summary", id, "error", corrID(r))
		writeErr(w, 502, "AI service unavailable")
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		st.Audit(cl.OrgID, cl.UserID, "incident.ai_summary", id, "error", corrID(r))
		writeErr(w, 502, fmt.Sprintf("AI service error (HTTP %d)", resp.StatusCode))
		return
	}

	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		st.Audit(cl.OrgID, cl.UserID, "incident.ai_summary", id, "error", corrID(r))
		writeErr(w, 502, "invalid AI response")
		return
	}

	// Catat model + versi prompt untuk audit (disisipkan dalam action agar tercatat terstruktur).
	model, _ := result["model"].(string)
	promptVer, _ := result["prompt_version"].(string)
	auditAction := fmt.Sprintf("incident.ai_summary model=%s prompt=%s", model, promptVer)
	st.Audit(cl.OrgID, cl.UserID, auditAction, id, "ok", corrID(r))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(raw)
}
