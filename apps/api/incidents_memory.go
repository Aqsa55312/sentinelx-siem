// MemoryStore incident implementation (local demo default).
package main

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *MemoryStore) ListUsers(orgID string) []UserSummary {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []UserSummary{}
	for _, u := range s.users {
		if u.OrgID == orgID {
			out = append(out, UserSummary{ID: u.ID, Email: u.Email, Role: u.Role})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Email < out[j].Email })
	return out
}

func (s *MemoryStore) Criticality(orgID, sourceID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, src := range s.sources {
		if src.OrgID == orgID && src.ID == sourceID {
			return src.Criticality
		}
	}
	return 50
}

func (s *MemoryStore) ListIncidents(orgID string) []Incident {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []Incident{}
	for _, inc := range s.incidents {
		if inc.OrgID != orgID {
			continue
		}
		inc.AlertCount = len(s.incidentAlerts[inc.ID])
		out = append(out, inc)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *MemoryStore) GetIncident(orgID, id string) (IncidentDetail, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inc, ok := s.incidentByIDLocked(orgID, id)
	if !ok {
		return IncidentDetail{}, false
	}
	inc.AlertCount = len(s.incidentAlerts[id])
	detail := IncidentDetail{
		Incident: *inc,
		Alerts:   s.incidentAlertListLocked(id),
		Notes:    []IncidentNote{},
		Timeline: []IncidentTimelineEntry{},
		Events:   []Event{},
	}
	for _, n := range s.incidentNotes {
		if n.IncidentID == id && n.OrgID == orgID {
			detail.Notes = append(detail.Notes, n)
		}
	}
	sort.Slice(detail.Notes, func(i, j int) bool { return detail.Notes[i].CreatedAt.Before(detail.Notes[j].CreatedAt) })
	for _, t := range s.incidentTimeline {
		if t.IncidentID == id && t.OrgID == orgID {
			detail.Timeline = append(detail.Timeline, t)
		}
	}
	sort.Slice(detail.Timeline, func(i, j int) bool { return detail.Timeline[i].CreatedAt.Before(detail.Timeline[j].CreatedAt) })
	seen := map[string]bool{}
	for _, a := range detail.Alerts {
		for _, eid := range a.EventIDs {
			if seen[eid] {
				continue
			}
			if e, ok := s.eventsBy[eid]; ok {
				seen[eid] = true
				detail.Events = append(detail.Events, e)
			}
		}
	}
	sortEventsAsc(detail.Events)
	return detail, true
}

func (s *MemoryStore) CreateIncident(orgID, actor string, alertIDs []string, title, assignee string) (Incident, error) {
	alertIDs = uniqueStrings(alertIDs)
	if len(alertIDs) == 0 {
		return Incident{}, fmt.Errorf("alert_ids must contain at least one alert")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	// Idempotent when every alert already belongs to the same incident.
	existing := map[string]string{}
	for _, aid := range alertIDs {
		if iid := s.alertIncident[aid]; iid != "" {
			existing[iid] = iid
		}
	}
	if len(existing) == 1 {
		for iid := range existing {
			if inc, ok := s.incidentByIDLocked(orgID, iid); ok {
				inc.AlertCount = len(s.incidentAlerts[iid])
				return *inc, nil
			}
		}
	}
	if len(existing) > 1 {
		return Incident{}, fmt.Errorf("alerts already belong to different incidents")
	}

	var alerts []Alert
	severity := "low"
	risk := 0
	var indicators []string
	for _, aid := range alertIDs {
		a, evs, ok := s.alertByIDLocked(orgID, aid)
		if !ok {
			return Incident{}, fmt.Errorf("alert %s not found", aid)
		}
		if s.alertIncident[aid] != "" {
			return Incident{}, fmt.Errorf("alert %s already belongs to another incident", aid)
		}
		alerts = append(alerts, a)
		severity = maxSeverity(severity, a.Severity)
		if a.RiskScore > risk {
			risk = a.RiskScore
		}
		indicators = mergeIndicators(indicators, eventIndicators(evs))
	}
	if strings.TrimSpace(title) == "" {
		title = alerts[0].Title
	}
	if assignee != "" && s.userByIDLocked(orgID, assignee) == "" {
		return Incident{}, fmt.Errorf("assignee is not a member of this organization")
	}
	now := time.Now().UTC()
	inc := Incident{
		ID: newID("inc"), OrgID: orgID, Title: strings.TrimSpace(title),
		Severity: severity, RiskScore: risk, Status: incidentStatusNew,
		AssigneeID: assignee, CreatedBy: actor, Indicators: indicators,
		CreatedAt: now, UpdatedAt: now, AlertCount: len(alerts),
	}
	s.incidents = append(s.incidents, inc)
	for _, a := range alerts {
		s.incidentAlerts[inc.ID] = append(s.incidentAlerts[inc.ID], a.ID)
		s.alertIncident[a.ID] = inc.ID
	}
	s.appendTimelineLocked(orgID, inc.ID, "created", actor,
		fmt.Sprintf("Incident created from %d alert(s)", len(alerts)), now)
	s.audits++
	return inc, nil
}

func (s *MemoryStore) AttachAlertsToIncident(orgID, id, actor string, alertIDs []string) (Incident, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inc, ok := s.incidentByIDLocked(orgID, id)
	if !ok {
		return Incident{}, fmt.Errorf("incident not found")
	}
	if inc.Status == incidentStatusClosed || inc.Status == incidentStatusFalsePositive {
		return Incident{}, fmt.Errorf("cannot link alerts to a %s incident", inc.Status)
	}
	now := time.Now().UTC()
	added := 0
	for _, aid := range alertIDs {
		if s.alertIncident[aid] == id {
			continue
		}
		a, evs, ok := s.alertByIDLocked(orgID, aid)
		if !ok {
			return Incident{}, fmt.Errorf("alert %s not found", aid)
		}
		if other := s.alertIncident[aid]; other != "" {
			return Incident{}, fmt.Errorf("alert %s already belongs to incident %s", aid, other)
		}
		s.incidentAlerts[id] = append(s.incidentAlerts[id], aid)
		s.alertIncident[aid] = id
		inc.Severity = maxSeverity(inc.Severity, a.Severity)
		if a.RiskScore > inc.RiskScore {
			inc.RiskScore = a.RiskScore
		}
		inc.Indicators = mergeIndicators(inc.Indicators, eventIndicators(evs))
		added++
	}
	inc.AlertCount = len(s.incidentAlerts[id])
	if added > 0 {
		inc.UpdatedAt = now
		s.appendTimelineLocked(orgID, id, "alerts_linked", actor,
			fmt.Sprintf("%d alert(s) linked by correlation", added), now)
		s.audits++
	}
	return *inc, nil
}

func (s *MemoryStore) UpdateIncident(orgID, id, actor string, patch IncidentPatch) (Incident, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inc, ok := s.incidentByIDLocked(orgID, id)
	if !ok {
		return Incident{}, fmt.Errorf("incident not found")
	}
	now := time.Now().UTC()
	changed := false

	if patch.Status != "" && patch.Status != inc.Status {
		if !validIncidentStatus(patch.Status) {
			return Incident{}, fmt.Errorf("unsupported incident status")
		}
		if !canTransitionIncident(inc.Status, patch.Status) {
			return Incident{}, fmt.Errorf("invalid transition %s -> %s", inc.Status, patch.Status)
		}
		reason := strings.TrimSpace(patch.ClosedReason)
		if (patch.Status == incidentStatusClosed || patch.Status == incidentStatusFalsePositive) && reason == "" {
			return Incident{}, fmt.Errorf("closed_reason is required for %s", patch.Status)
		}
		old := inc.Status
		inc.Status = patch.Status
		if reason != "" {
			inc.ClosedReason = reason
		}
		msg := fmt.Sprintf("Status changed: %s -> %s", old, patch.Status)
		if reason != "" {
			msg += " (" + reason + ")"
		}
		s.appendTimelineLocked(orgID, id, "status_changed", actor, msg, now)
		s.syncAlertStatusLocked(id, alertStatusForIncident(patch.Status), reason)
		changed = true
		s.audits++
	}

	if patch.AssigneeID != nil {
		next := strings.TrimSpace(*patch.AssigneeID)
		if next != inc.AssigneeID {
			if next != "" {
				if s.userByIDLocked(orgID, next) == "" {
					return Incident{}, fmt.Errorf("assignee is not a member of this organization")
				}
			}
			inc.AssigneeID = next
			msg := "Incident unassigned"
			if next != "" {
				msg = "Assigned to " + s.userByIDLocked(orgID, next)
			}
			s.appendTimelineLocked(orgID, id, "assignment_changed", actor, msg, now)
			changed = true
			s.audits++
		}
	}

	if patch.Title != nil && strings.TrimSpace(*patch.Title) != inc.Title {
		if strings.TrimSpace(*patch.Title) == "" {
			return Incident{}, fmt.Errorf("title cannot be empty")
		}
		inc.Title = strings.TrimSpace(*patch.Title)
		s.appendTimelineLocked(orgID, id, "title_changed", actor, "Title updated", now)
		changed = true
	}

	if patch.Severity != nil && *patch.Severity != inc.Severity {
		if err := validateSeverity(*patch.Severity); err != nil {
			return Incident{}, err
		}
		inc.Severity = *patch.Severity
		s.appendTimelineLocked(orgID, id, "severity_changed", actor,
			"Severity changed to "+*patch.Severity, now)
		changed = true
	}

	if changed {
		inc.UpdatedAt = now
	}
	inc.AlertCount = len(s.incidentAlerts[id])
	s.audits++
	return *inc, nil
}

func (s *MemoryStore) AddIncidentNote(orgID, id, actor, body string) (IncidentNote, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return IncidentNote{}, fmt.Errorf("note body is required")
	}
	if len(body) > 4000 {
		return IncidentNote{}, fmt.Errorf("note is too long (max 4000)")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	inc, ok := s.incidentByIDLocked(orgID, id)
	if !ok {
		return IncidentNote{}, fmt.Errorf("incident not found")
	}
	now := time.Now().UTC()
	n := IncidentNote{ID: newID("note"), IncidentID: id, OrgID: orgID, AuthorID: actor, Body: body, CreatedAt: now}
	s.incidentNotes = append(s.incidentNotes, n)
	inc.UpdatedAt = now
	s.appendTimelineLocked(orgID, id, "note_added", actor, "Investigation note added", now)
	s.audits++
	return n, nil
}

// ---------- locked helpers ----------

func (s *MemoryStore) incidentByIDLocked(orgID, id string) (*Incident, bool) {
	for i := range s.incidents {
		if s.incidents[i].ID == id && s.incidents[i].OrgID == orgID {
			return &s.incidents[i], true
		}
	}
	return nil, false
}

func (s *MemoryStore) alertByIDLocked(orgID, id string) (Alert, []Event, bool) {
	for _, a := range s.alerts {
		if a.ID != id || a.OrgID != orgID {
			continue
		}
		a.IncidentID = s.alertIncident[a.ID]
		var evs []Event
		for _, eid := range a.EventIDs {
			if e, ok := s.eventsBy[eid]; ok {
				evs = append(evs, e)
			}
		}
		return a, evs, true
	}
	return Alert{}, nil, false
}

func (s *MemoryStore) incidentAlertListLocked(id string) []Alert {
	out := []Alert{}
	for _, aid := range s.incidentAlerts[id] {
		for i := range s.alerts {
			if s.alerts[i].ID == aid {
				a := s.alerts[i]
				a.IncidentID = id
				out = append(out, a)
				break
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *MemoryStore) appendTimelineLocked(orgID, incidentID, kind, actor, message string, at time.Time) {
	s.incidentTimeline = append(s.incidentTimeline, IncidentTimelineEntry{
		ID: newID("itl"), IncidentID: incidentID, OrgID: orgID,
		Kind: kind, ActorID: actor, Message: message, CreatedAt: at,
	})
}

func (s *MemoryStore) syncAlertStatusLocked(incidentID, status, reason string) {
	for _, aid := range s.incidentAlerts[incidentID] {
		for i := range s.alerts {
			if s.alerts[i].ID == aid {
				s.alerts[i].Status = status
				if reason != "" {
					s.alerts[i].StatusReason = reason
				}
			}
		}
	}
}

func (s *MemoryStore) userByIDLocked(orgID, id string) string {
	for _, u := range s.users {
		if u.ID == id && u.OrgID == orgID {
			return u.Email
		}
	}
	return ""
}
