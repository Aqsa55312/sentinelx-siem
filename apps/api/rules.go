// Package main: rule registry exposed read-only via GET /api/v1/rules.
package main

// Rule describes a detection rule with its effective config and test coverage.
// The registry is the single place the UI and tests read rule metadata from.
type Rule struct {
	ID          string         `json:"rule_id"`
	Name        string         `json:"name"`
	Version     int            `json:"version"`
	Enabled     bool           `json:"enabled"`
	Severity    string         `json:"severity"`
	Description string         `json:"description"`
	Config      map[string]any `json:"config"`
	TestCases   []string       `json:"test_cases"`
}

func ruleRegistry() []Rule {
	return []Rule{
		{
			ID: det001RuleID, Name: "DET-001 brute-force-like authentication failures",
			Version: det001RuleVersion, Enabled: true, Severity: "high",
			Description: "Many authentication_failed events from the same src_ip within a time window.",
			Config: map[string]any{
				"event_type": "authentication_failed", "group_by": "src_ip",
				"threshold": det001Threshold, "window_seconds": det001WindowSec,
				"confidence": det001Confidence,
			},
			TestCases: []string{
				"TC-01: 6 failures / 5 min same IP => alert",
				"TC-02: 4 failures / 5 min same IP => no alert",
				"dedupe: same window re-uploaded => no duplicate alert",
			},
		},
		{
			ID: det002RuleID, Name: "DET-002 suspicious authentication sequence",
			Version: det002RuleVersion, Enabled: true, Severity: "high",
			Description: "Repeated authentication failures followed by a success for the same username and src_ip.",
			Config: map[string]any{
				"event_types":  []string{"authentication_failed", "authentication_success"},
				"group_by":     []string{"username", "src_ip"},
				"min_failures": det002MinFailures, "window_seconds": det002WindowSec,
				"confidence": det002Confidence,
			},
			TestCases: []string{
				"TC-03: 4 failures then success, same user+IP => alert",
				"negative: success without failures => no alert",
				"negative: failures below minimum => no alert",
				"negative: failures and success from different IPs => no alert",
			},
		},
		{
			ID: det003RuleID, Name: "DET-003 admin activity outside baseline",
			Version: det003RuleVersion, Enabled: true, Severity: "medium",
			Description: "admin_action outside the simulated baseline hours (UTC). Baseline is overridable per event for lab scenarios.",
			Config: map[string]any{
				"event_type":              "admin_action",
				"baseline_start_hour_utc": det003BaselineStartHour,
				"baseline_end_hour_utc":   det003BaselineEndHour,
				"confidence":              det003Confidence,
			},
			TestCases: []string{
				"positive: admin_action at 02:15 UTC => alert",
				"negative: admin_action at 10:00 UTC => no alert",
				"baseline override via attributes => no alert",
			},
		},
		{
			ID: det004RuleID, Name: "DET-004 repeated high-risk events",
			Version: det004RuleVersion, Enabled: true, Severity: "high",
			Description: "Repeated high_risk_event from the same source in a short window.",
			Config: map[string]any{
				"event_type": "high_risk_event", "group_by": "src_ip",
				"threshold": det004Threshold, "window_seconds": det004WindowSec,
				"confidence": det004Confidence,
			},
			TestCases: []string{
				"positive: 3 high-risk events / 2 min same IP => alert",
				"negative: 2 high-risk events / 2 min => no alert",
			},
		},
	}
}
