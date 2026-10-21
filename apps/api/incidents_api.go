// Week 4/5 API handlers: alert triage, incidents, notes, timeline, export.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func handleListUsers(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"users": st.ListUsers(cl.OrgID)})
}

func handleUpdateAlert(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	a, err := st.UpdateAlertStatus(cl.OrgID, r.PathValue("id"), strings.TrimSpace(body.Status), cl.UserID, body.Reason)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	st.Audit(cl.OrgID, cl.UserID, "alert.status_changed", a.ID, "ok", corrID(r))
	writeJSON(w, 200, a)
}

func handleListIncidents(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"incidents": st.ListIncidents(cl.OrgID)})
}

func handleCreateIncident(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		AlertIDs   []string `json:"alert_ids"`
		Title      string   `json:"title"`
		AssigneeID string   `json:"assignee_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	if len(body.AlertIDs) == 0 || len(body.AlertIDs) > 50 {
		writeErr(w, 400, "alert_ids must contain 1..50 alerts")
		return
	}
	inc, err := st.CreateIncident(cl.OrgID, cl.UserID, body.AlertIDs, body.Title, body.AssigneeID)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	writeJSON(w, 201, inc)
}

func handleGetIncident(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	detail, ok := st.GetIncident(cl.OrgID, r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "incident not found")
		return
	}
	writeJSON(w, 200, detail)
}

func handleUpdateIncident(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status       string  `json:"status"`
		AssigneeID   *string `json:"assignee_id"`
		Title        *string `json:"title"`
		Severity     *string `json:"severity"`
		ClosedReason string  `json:"closed_reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	inc, err := st.UpdateIncident(cl.OrgID, r.PathValue("id"), cl.UserID, IncidentPatch{
		Status: strings.TrimSpace(body.Status), AssigneeID: body.AssigneeID,
		Title: body.Title, Severity: body.Severity, ClosedReason: body.ClosedReason,
	})
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"incident": inc})
}

func handleAddIncidentNote(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	note, err := st.AddIncidentNote(cl.OrgID, r.PathValue("id"), cl.UserID, body.Body)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	writeJSON(w, 201, note)
}

func handleExportIncident(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	detail, ok := st.GetIncident(cl.OrgID, id)
	if !ok {
		writeErr(w, 404, "incident not found")
		return
	}
	inc := detail.Incident
	assignee := inc.AssigneeID
	if assignee == "" {
		assignee = "unassigned"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Incident: %s\n\n", inc.Title)
	fmt.Fprintf(&b, "- **Incident ID:** `%s`\n", inc.ID)
	fmt.Fprintf(&b, "- **Status:** %s\n", inc.Status)
	fmt.Fprintf(&b, "- **Severity:** %s\n", inc.Severity)
	fmt.Fprintf(&b, "- **Risk score:** %d/100\n", inc.RiskScore)
	fmt.Fprintf(&b, "- **Assignee:** %s\n", assignee)
	fmt.Fprintf(&b, "- **Created by:** %s at %s\n", inc.CreatedBy, inc.CreatedAt.Format(time.RFC3339))
	fmt.Fprintf(&b, "- **Last updated:** %s\n", inc.UpdatedAt.Format(time.RFC3339))
	if inc.ClosedReason != "" {
		fmt.Fprintf(&b, "- **Closure reason:** %s\n", inc.ClosedReason)
	}
	fmt.Fprintf(&b, "\n## Indicators\n\n")
	if len(inc.Indicators) == 0 {
		fmt.Fprintf(&b, "_None recorded._\n")
	}
	for _, ind := range inc.Indicators {
		fmt.Fprintf(&b, "- `%s`\n", ind)
	}

	fmt.Fprintf(&b, "\n## Linked alerts (%d)\n\n", len(detail.Alerts))
	fmt.Fprintf(&b, "| Alert | Rule | Severity | Risk | Status | Created |\n|---|---|---|---|---|---|\n")
	for _, a := range detail.Alerts {
		fmt.Fprintf(&b, "| %s | %s | %s | %d | %s | %s |\n",
			mdCell(a.Title), mdCell(a.RuleID), a.Severity, a.RiskScore, a.Status, a.CreatedAt.Format(time.RFC3339))
	}

	fmt.Fprintf(&b, "\n## Evidence timeline (%d events)\n\n", len(detail.Events))
	for _, e := range detail.Events {
		fmt.Fprintf(&b, "- `%s` — **%s** — src `%s` — user `%s` — %s (`%s`)\n",
			e.Timestamp.Format(time.RFC3339), mdCell(e.EventType), mdCell(e.SrcIP), mdCell(e.Username),
			mdCell(e.Message), e.ID)
	}

	fmt.Fprintf(&b, "\n## Investigation notes\n\n")
	if len(detail.Notes) == 0 {
		fmt.Fprintf(&b, "_No notes yet._\n")
	}
	for _, n := range detail.Notes {
		fmt.Fprintf(&b, "### %s — %s\n\n%s\n\n", n.CreatedAt.Format(time.RFC3339), mdCell(n.AuthorID), n.Body)
	}

	fmt.Fprintf(&b, "\n## Activity timeline\n\n")
	for _, t := range detail.Timeline {
		fmt.Fprintf(&b, "- %s — **%s** — %s — %s\n",
			t.CreatedAt.Format(time.RFC3339), mdCell(t.Kind), mdCell(t.ActorID), mdCell(t.Message))
	}
	fmt.Fprintf(&b, "\n---\n_Generated by SentinelX. Detection results are evidence-backed but not proof of compromise._\n")

	st.Audit(cl.OrgID, cl.UserID, "incident.exported", id, "ok", corrID(r))
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+inc.ID+`.md"`)
	w.WriteHeader(200)
	_, _ = w.Write([]byte(b.String()))
}

func mdCell(s string) string {
	s = strings.ReplaceAll(s, "|", `\|`)
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

// storeErrStatus maps store validation errors to HTTP codes without exposing
// internal details.
func storeErrStatus(err error) int {
	if err == nil {
		return 200
	}
	if strings.Contains(err.Error(), "not found") {
		return 404
	}
	if strings.Contains(err.Error(), "already belongs") {
		return 409
	}
	return 400
}
