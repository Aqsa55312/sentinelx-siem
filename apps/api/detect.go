// Package main: rule-based detection (DET-001..DET-004) + transparent risk scoring.
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

	det002RuleID      = "rule-det-002"
	det002RuleVersion = 1
	det002MinFailures = 3
	det002WindowSec   = 600
	det002Confidence  = 85

	det003RuleID            = "rule-det-003"
	det003RuleVersion       = 1
	det003BaselineStartHour = 8
	det003BaselineEndHour   = 18
	det003Confidence        = 60

	det004RuleID      = "rule-det-004"
	det004RuleVersion = 1
	det004Threshold   = 3
	det004WindowSec   = 120
	det004Confidence  = 70

	// alertDedupeLookback bounds how far back de-duplication looks. The dedupe
	// key itself carries an event-time bucket, so replayed datasets and later
	// attacks still produce new alerts.
	alertDedupeLookback = 24 * time.Hour
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

// riskScore implements R = min(100, 0.4S+0.3C+0.2A+0.1B) — prototype weights,
// not a probability of compromise.
func riskScore(severity string, confidence, assetCrit, behaviorDev int) int {
	s := severityScore(severity)
	r := 0.4*float64(s) + 0.3*float64(confidence) + 0.2*float64(assetCrit) + 0.1*float64(behaviorDev)
	if r > 100 {
		r = 100
	}
	if r < 0 {
		r = 0
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

// bucketKey turns an event time into a stable window bucket so the same attack
// observed twice (retry / duplicate upload) de-duplicates, while a later
// occurrence in a different bucket still alerts.
func bucketKey(t time.Time, window time.Duration) string {
	return t.UTC().Truncate(window).Format("20060102T150405")
}

func dedupeSince() time.Time { return time.Now().UTC().Add(-alertDedupeLookback) }

// clamp keeps behavior-deviation inputs inside the 0..100 contract.
func clamp(v int) int {
	if v > 100 {
		return 100
	}
	if v < 0 {
		return 0
	}
	return v
}

// fire creates an alert unless the same rule + dedupe key already fired within
// the lookback window. Returns (alert, created).
func fire(st Store, orgID, ruleID string, ruleVersion int, dedupeKey, title, severity string,
	confidence, assetCrit, behaviorDev int, reason string, windowStart, windowEnd time.Time, eventIDs []string) (Alert, bool) {

	if st.HasRecentAlert(orgID, ruleID, dedupeKey, dedupeSince()) {
		return Alert{}, false
	}
	score := riskScore(severity, confidence, assetCrit, behaviorDev)
	a := st.CreateAlert(Alert{
		OrgID: orgID, RuleID: ruleID, RuleVersion: ruleVersion,
		Title: title, Severity: severity, RiskScore: score, Status: "new",
		WindowStart: &windowStart, WindowEnd: &windowEnd,
		Reason:    fmt.Sprintf("%s risk=%d (%s).", reason, score, priorityOf(score)),
		DedupeKey: dedupeKey,
		EventIDs:  eventIDs,
	})
	st.Audit(orgID, "detection-engine", "detection.alert_created", a.ID, "ok", "")
	return a, true
}

// assetCriticality returns the highest configured criticality across the
// evidence sources. Unknown sources fall back to the neutral 50 baseline.
func assetCriticality(st Store, orgID string, evs ...Event) int {
	best := -1
	seen := map[string]bool{}
	for _, e := range evs {
		if e.SourceID == "" || seen[e.SourceID] {
			continue
		}
		seen[e.SourceID] = true
		if v := st.Criticality(orgID, e.SourceID); v > best {
			best = v
		}
	}
	if best < 0 {
		return 50
	}
	return best
}

// evaluateDET001: many authentication_failed from the same src_ip in a window.
func evaluateDET001(st Store, orgID string, batch []Event) []Alert {
	byIP := map[string][]Event{}
	for _, e := range batch {
		if e.EventType == "authentication_failed" && e.SrcIP != "" {
			byIP[e.SrcIP] = append(byIP[e.SrcIP], e)
		}
	}
	var fired []Alert
	for ip, evs := range byIP {
		latest := evs[len(evs)-1].Timestamp
		windowStart := latest.Add(-det001WindowSec * time.Second)
		failures := st.CountFailures(orgID, ip, windowStart)
		if len(failures) < det001Threshold {
			continue
		}
		ids := make([]string, 0, len(failures))
		for _, f := range failures {
			ids = append(ids, f.ID)
		}
		a, created := fire(st, orgID, det001RuleID, det001RuleVersion,
			fmt.Sprintf("ip:%s|w:%s", ip, bucketKey(latest, det001WindowSec*time.Second)),
			fmt.Sprintf("Brute-force-like activity from %s (%d failures)", ip, len(failures)),
			"high", det001Confidence, assetCriticality(st, orgID, failures...), clamp(len(failures)*10),
			fmt.Sprintf("DET-001 v%d: %d authentication_failed from src_ip=%s within %ds (threshold %d).",
				det001RuleVersion, len(failures), ip, det001WindowSec, det001Threshold),
			failures[0].Timestamp, latest, ids)
		if created {
			fired = append(fired, a)
		}
	}
	return fired
}

// evaluateDET002: repeated failures followed by a success for the same account
// and source — a suspicious authentication sequence, not proof of compromise.
func evaluateDET002(st Store, orgID string, batch []Event) []Alert {
	var fired []Alert
	for _, succ := range batch {
		if succ.EventType != "authentication_success" || succ.Username == "" || succ.SrcIP == "" {
			continue
		}
		windowStart := succ.Timestamp.Add(-det002WindowSec * time.Second)
		failures := st.EventsInWindow(orgID, EventFilter{
			EventType: "authentication_failed", SrcIP: succ.SrcIP, Username: succ.Username,
		}, windowStart, succ.Timestamp)
		if len(failures) < det002MinFailures {
			continue
		}
		ids := make([]string, 0, len(failures)+1)
		for _, f := range failures {
			ids = append(ids, f.ID)
		}
		ids = append(ids, succ.ID)
		evidence := append(append([]Event{}, failures...), succ)
		a, created := fire(st, orgID, det002RuleID, det002RuleVersion,
			fmt.Sprintf("user:%s|ip:%s|w:%s", succ.Username, succ.SrcIP, bucketKey(succ.Timestamp, det002WindowSec*time.Second)),
			fmt.Sprintf("Suspicious authentication sequence for %s from %s", succ.Username, succ.SrcIP),
			"high", det002Confidence, assetCriticality(st, orgID, evidence...), clamp(len(failures)*15),
			fmt.Sprintf("DET-002 v%d: %d authentication_failed followed by authentication_success for username=%s src_ip=%s within %ds.",
				det002RuleVersion, len(failures), succ.Username, succ.SrcIP, det002WindowSec),
			failures[0].Timestamp, succ.Timestamp, ids)
		if created {
			fired = append(fired, a)
		}
	}
	return fired
}

// evaluateDET003: admin activity outside the simulated baseline hours (UTC).
// Baseline bounds can be overridden per event via attributes for lab scenarios.
func evaluateDET003(st Store, orgID string, batch []Event) []Alert {
	var fired []Alert
	for _, e := range batch {
		if e.EventType != "admin_action" {
			continue
		}
		start, end := det003BaselineStartHour, det003BaselineEndHour
		if v, ok := attrInt(e.Attributes["baseline_start_hour"]); ok {
			start = v
		}
		if v, ok := attrInt(e.Attributes["baseline_end_hour"]); ok {
			end = v
		}
		hour := e.Timestamp.UTC().Hour()
		if hour >= start && hour < end {
			continue
		}
		actor := e.Username
		if actor == "" {
			actor = "unknown"
		}
		a, created := fire(st, orgID, det003RuleID, det003RuleVersion,
			fmt.Sprintf("user:%s|day:%s", actor, e.Timestamp.UTC().Format("2006-01-02")),
			fmt.Sprintf("Admin activity outside baseline hours by %s", actor),
			"medium", det003Confidence, assetCriticality(st, orgID, e), 70,
			fmt.Sprintf("DET-003 v%d: admin_action at %s UTC by username=%s, outside baseline %02d:00-%02d:00 UTC (simulated baseline).",
				det003RuleVersion, e.Timestamp.UTC().Format("15:04"), actor, start, end),
			e.Timestamp, e.Timestamp, []string{e.ID})
		if created {
			fired = append(fired, a)
		}
	}
	return fired
}

// evaluateDET004: repeated high-risk events from one source in a short window.
func evaluateDET004(st Store, orgID string, batch []Event) []Alert {
	byKey := map[string][]Event{}
	for _, e := range batch {
		if e.EventType != "high_risk_event" {
			continue
		}
		key := e.SrcIP
		if key == "" {
			key = "user:" + e.Username
		}
		byKey[key] = append(byKey[key], e)
	}
	var fired []Alert
	for key, evs := range byKey {
		latest := evs[len(evs)-1].Timestamp
		windowStart := latest.Add(-det004WindowSec * time.Second)
		matched := st.EventsInWindow(orgID, EventFilter{EventType: "high_risk_event", SrcIP: key},
			windowStart, latest.Add(time.Nanosecond))
		if len(matched) < det004Threshold {
			continue
		}
		ids := make([]string, 0, len(matched))
		for _, m := range matched {
			ids = append(ids, m.ID)
		}
		a, created := fire(st, orgID, det004RuleID, det004RuleVersion,
			fmt.Sprintf("src:%s|w:%s", key, bucketKey(latest, det004WindowSec*time.Second)),
			fmt.Sprintf("Repeated high-risk events from %s (%d in %ds)", key, len(matched), det004WindowSec),
			"high", det004Confidence, assetCriticality(st, orgID, matched...), clamp(len(matched)*20),
			fmt.Sprintf("DET-004 v%d: %d high_risk_event from src=%s within %ds (threshold %d).",
				det004RuleVersion, len(matched), key, det004WindowSec, det004Threshold),
			matched[0].Timestamp, latest, ids)
		if created {
			fired = append(fired, a)
		}
	}
	return fired
}

// evaluateAll runs every enabled rule over one ingest batch. Rules are
// deterministic and each alert keeps rule id/version + evidence event ids.
func evaluateAll(st Store, orgID string, batch []Event) []Alert {
	out := evaluateDET001(st, orgID, batch)
	out = append(out, evaluateDET002(st, orgID, batch)...)
	out = append(out, evaluateDET003(st, orgID, batch)...)
	out = append(out, evaluateDET004(st, orgID, batch)...)
	return out
}

func attrInt(v any) (int, bool) {
	switch n := v.(type) {
	case float64:
		return int(n), true
	case int:
		return n, true
	case string:
		var i int
		if _, err := fmt.Sscanf(n, "%d", &i); err == nil {
			return i, true
		}
	}
	return 0, false
}
