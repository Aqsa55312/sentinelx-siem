// Correlation engine: groups alerts into incidents using shared IP/user
// indicators inside a bounded time window. Auto-created incidents are marked
// with actor "detection-engine" and can be triaged like manual ones.
package main

import (
	"log"
	"time"
)

func correlateAlerts(st Store, orgID, actor string, alerts []Alert) CorrelationResult {
	res := CorrelationResult{IncidentIDs: []string{}}
	if len(alerts) == 0 {
		return res
	}
	seen := map[string]bool{}
	for _, a := range alerts {
		current, evidence, ok := st.GetAlert(orgID, a.ID)
		if !ok || current.IncidentID != "" {
			continue
		}
		indicators := eventIndicators(evidence)

		candidates := st.ListIncidents(orgID)
		bestID := ""
		bestScore := 0
		var bestUpdated time.Time
		for _, inc := range candidates {
			if !incidentActiveStatuses[inc.Status] {
				continue
			}
			if time.Since(inc.UpdatedAt) > incidentCorrelationWindow {
				continue
			}
			overlap := strongIndicatorOverlap(inc.Indicators, indicators)
			if overlap == 0 {
				continue
			}
			// Prefer the strongest overlap, then the most recently active case.
			if overlap > bestScore || (overlap == bestScore && inc.UpdatedAt.After(bestUpdated)) {
				bestID, bestScore, bestUpdated = inc.ID, overlap, inc.UpdatedAt
			}
		}

		if bestID != "" {
			if _, err := st.AttachAlertsToIncident(orgID, bestID, actor, []string{current.ID}); err != nil {
				log.Printf("correlation: attach alert %s to %s failed: %v", current.ID, bestID, err)
				continue
			}
			res.Updated++
			if !seen[bestID] {
				seen[bestID] = true
				res.IncidentIDs = append(res.IncidentIDs, bestID)
			}
			continue
		}

		inc, err := st.CreateIncident(orgID, actor, []string{current.ID}, "", "")
		if err != nil {
			log.Printf("correlation: create incident for alert %s failed: %v", current.ID, err)
			continue
		}
		res.Created++
		res.IncidentIDs = append(res.IncidentIDs, inc.ID)
	}
	return res
}
