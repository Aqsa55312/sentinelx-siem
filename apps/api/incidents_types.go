// Package main: incident models, status workflow, and correlation helpers.
package main

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Incident status workflow (PRD Module 7).
const (
	incidentStatusNew           = "new"
	incidentStatusTriaged       = "triaged"
	incidentStatusInvestigating = "investigating"
	incidentStatusContained     = "contained"
	incidentStatusResolved      = "resolved"
	incidentStatusClosed        = "closed"
	incidentStatusFalsePositive = "false_positive"

	incidentCorrelationWindow = 24 * time.Hour
)

var incidentStatuses = map[string]bool{
	incidentStatusNew: true, incidentStatusTriaged: true, incidentStatusInvestigating: true,
	incidentStatusContained: true, incidentStatusResolved: true,
	incidentStatusClosed: true, incidentStatusFalsePositive: true,
}

// incidentTransitions is deliberately explicit: invalid jumps are rejected
// server-side so the UI cannot bypass the workflow.
var incidentTransitions = map[string]map[string]bool{
	incidentStatusNew: {
		incidentStatusTriaged: true, incidentStatusInvestigating: true,
		incidentStatusFalsePositive: true, incidentStatusClosed: true,
	},
	incidentStatusTriaged: {
		incidentStatusInvestigating: true, incidentStatusFalsePositive: true, incidentStatusClosed: true,
	},
	incidentStatusInvestigating: {
		incidentStatusContained: true, incidentStatusResolved: true,
		incidentStatusFalsePositive: true, incidentStatusClosed: true,
	},
	incidentStatusContained: {
		incidentStatusInvestigating: true, incidentStatusResolved: true,
		incidentStatusFalsePositive: true, incidentStatusClosed: true,
	},
	incidentStatusResolved:      {incidentStatusClosed: true},
	incidentStatusClosed:        {},
	incidentStatusFalsePositive: {},
}

var incidentActiveStatuses = map[string]bool{
	incidentStatusNew: true, incidentStatusTriaged: true, incidentStatusInvestigating: true,
}

// Open cases remain visible on the dashboard after containment until they are
// resolved or closed. Correlation only attaches new alerts to pre-containment
// states (incidentActiveStatuses).
var incidentOpenStatuses = map[string]bool{
	incidentStatusNew: true, incidentStatusTriaged: true, incidentStatusInvestigating: true,
	incidentStatusContained: true,
}

func validIncidentStatus(s string) bool { return incidentStatuses[s] }

func canTransitionIncident(from, to string) bool {
	if from == to {
		return true
	}
	return incidentTransitions[from][to]
}

// alertStatusForIncident keeps linked alerts in step with their incident.
func alertStatusForIncident(status string) string {
	switch status {
	case incidentStatusContained:
		return "investigating"
	case incidentStatusClosed:
		return "closed"
	case incidentStatusFalsePositive:
		return "false_positive"
	default:
		return status
	}
}

type Incident struct {
	ID           string    `json:"incident_id"`
	OrgID        string    `json:"-"`
	Title        string    `json:"title"`
	Severity     string    `json:"severity"`
	RiskScore    int       `json:"risk_score"`
	Status       string    `json:"status"`
	AssigneeID   string    `json:"assignee_id,omitempty"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	ClosedReason string    `json:"closed_reason,omitempty"`
	Indicators   []string  `json:"indicators"`
	AlertCount   int       `json:"alert_count"`
}

type IncidentNote struct {
	ID         string    `json:"note_id"`
	IncidentID string    `json:"incident_id"`
	OrgID      string    `json:"-"`
	AuthorID   string    `json:"author_id"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

type IncidentTimelineEntry struct {
	ID         string    `json:"entry_id"`
	IncidentID string    `json:"incident_id"`
	OrgID      string    `json:"-"`
	Kind       string    `json:"kind"`
	ActorID    string    `json:"actor_id"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"created_at"`
}

type IncidentDetail struct {
	Incident Incident                `json:"incident"`
	Alerts   []Alert                 `json:"alerts"`
	Notes    []IncidentNote          `json:"notes"`
	Timeline []IncidentTimelineEntry `json:"timeline"`
	Events   []Event                 `json:"events"`
}

// IncidentPatch expresses a partial update. Pointer fields distinguish
// "omitted" from "clear this value" (e.g. unassign).
type IncidentPatch struct {
	Status       string
	AssigneeID   *string
	Title        *string
	Severity     *string
	ClosedReason string
}

type UserSummary struct {
	ID    string `json:"user_id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

type CorrelationResult struct {
	Created     int      `json:"incidents_created"`
	Updated     int      `json:"incidents_updated"`
	IncidentIDs []string `json:"incident_ids"`
}

// ---------- indicators ----------

func eventIndicators(evs []Event) []string {
	out := []string{}
	for _, e := range evs {
		if e.SrcIP != "" {
			out = append(out, "ip:"+e.SrcIP)
		}
		if e.Username != "" {
			out = append(out, "user:"+e.Username)
		}
		if e.SourceID != "" {
			out = append(out, "source:"+e.SourceID)
		}
	}
	return mergeIndicators(nil, out)
}

func mergeIndicators(a, b []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(a)+len(b))
	for _, v := range append(append([]string{}, a...), b...) {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

// strongIndicatorOverlap counts shared IP/user indicators. Source-only overlap
// is intentionally weak because many events share one collector.
func strongIndicatorOverlap(a, b []string) int {
	set := map[string]bool{}
	for _, v := range a {
		if strings.HasPrefix(v, "ip:") || strings.HasPrefix(v, "user:") {
			set[v] = true
		}
	}
	n := 0
	for _, v := range b {
		if set[v] {
			n++
		}
	}
	return n
}

func hasStrongIndicator(indicators []string) bool {
	for _, v := range indicators {
		if strings.HasPrefix(v, "ip:") || strings.HasPrefix(v, "user:") {
			return true
		}
	}
	return false
}

// ---------- severity ----------

func severityRank(sev string) int {
	switch sev {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	}
	return 0
}

func maxSeverity(a, b string) string {
	if severityRank(b) > severityRank(a) {
		return b
	}
	return a
}

func validateSeverity(sev string) error {
	if severityRank(sev) == 0 && sev != "low" {
		return fmt.Errorf("severity must be low, medium, high, or critical")
	}
	return nil
}
