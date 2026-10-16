// Package main: DET-001 evaluation + transparent risk scoring.
package main

import (
	"fmt"
	"time"
)

const (
	det001RuleID      = "rule-det-001"
	det001RuleVersion = 1
	det001Threshold   = 5
	det001WindowSec   = 300
	det001Confidence  = 80
)

func severityScore(sev string) int {
	switch sev {
	case "low":
		return 25
	case "medium":
		return 50
	case "high":
		return 75
	case "critical":
		return 100
	}
	return 50
}

// riskScore implements R = min(100, 0.4S+0.3C+0.2A+0.1B) — prototype weights.
func riskScore(severity string, confidence, assetCrit, behaviorDev int) int {
	s := severityScore(severity)
	r := 0.4*float64(s) + 0.3*float64(confidence) + 0.2*float64(assetCrit) + 0.1*float64(behaviorDev)
	if r > 100 {
		r = 100
	}
	return int(r)
}

func priorityOf(score int) string {
	switch {
	case score >= 90:
		return "Critical"
	case score >= 75:
		return "High"
	case score >= 50:
		return "Medium"
	case score >= 25:
		return "Low"
	default:
		return "Informational"
	}
}

// evaluateDET001 groups authentication_failed by src_ip within the window.
// Called synchronously after each ingest batch (streaming-simple for slice 1).
func evaluateDET001(st Store, orgID string, batch []Event) []Alert {
	byIP := map[string][]Event{}
	for _, e := range batch {
		if e.EventType == "authentication_failed" && e.SrcIP != "" {
			byIP[e.SrcIP] = append(byIP[e.SrcIP], e)
		}
	}
	var fired []Alert
	for ip := range byIP {
		latest := byIP[ip][len(byIP[ip])-1].Timestamp
		windowStart := latest.Add(-det001WindowSec * time.Second)
		failures := st.CountFailures(orgID, ip, windowStart)
		if len(failures) < det001Threshold {
			continue
		}
		// Deduplicate: one alert per IP per window (avoids alert storms).
		if st.HasOpenAlertFor(det001RuleID, orgID, ip, windowStart) {
			continue
		}
		behaviorDev := len(failures) * 10
		if behaviorDev > 100 {
			behaviorDev = 100
		}
		score := riskScore("high", det001Confidence, 50, behaviorDev)
		ids := make([]string, 0, len(failures))
		for _, f := range failures {
			ids = append(ids, f.ID)
		}
		ws, we := failures[0].Timestamp, failures[len(failures)-1].Timestamp
		a := st.CreateAlert(Alert{
			OrgID: orgID, RuleID: det001RuleID, RuleVersion: det001RuleVersion,
			Title:     fmt.Sprintf("Brute-force-like activity from %s (%d failures)", ip, len(failures)),
			Severity:  "high",
			RiskScore: score,
			Status:    "new",
			WindowStart: &ws, WindowEnd: &we,
			Reason: fmt.Sprintf("DET-001 v%d: %d authentication_failed from src_ip=%s within %ds (threshold %d). risk=%d (%s).",
				det001RuleVersion, len(failures), ip, det001WindowSec, det001Threshold, score, priorityOf(score)),
			EventIDs: ids,
		})
		st.Audit(orgID, "detection-engine", "detection.alert_created", a.ID, "ok", "")
		fired = append(fired, a)
	}
	return fired
}
