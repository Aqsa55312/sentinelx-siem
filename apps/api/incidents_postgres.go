// PostgresStore incident implementation.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
)

const incidentBaseColumns = `id, organization_id, title, severity, risk_score, status, assignee_id, created_by,
	indicators, closed_reason, created_at, updated_at`

const incidentColumns = incidentBaseColumns + `,
	(SELECT count(*) FROM incident_alerts ia WHERE ia.incident_id=incidents.id)`

func scanIncidentRow(sc interface{ Scan(...any) error }) (Incident, error) {
	var inc Incident
	var assignee, closed sql.NullString
	var indicators []byte
	err := sc.Scan(&inc.ID, &inc.OrgID, &inc.Title, &inc.Severity, &inc.RiskScore, &inc.Status,
		&assignee, &inc.CreatedBy, &indicators, &closed, &inc.CreatedAt, &inc.UpdatedAt, &inc.AlertCount)
	if err != nil {
		return inc, err
	}
	inc.AssigneeID = assignee.String
	inc.ClosedReason = closed.String
	_ = json.Unmarshal(indicators, &inc.Indicators)
	if inc.Indicators == nil {
		inc.Indicators = []string{}
	}
	return inc, nil
}

func (p *PostgresStore) ListIncidents(orgID string) []Incident {
	rows, err := p.db.Query(`SELECT `+incidentColumns+` FROM incidents WHERE organization_id=$1 ORDER BY updated_at DESC`, orgID)
	if err != nil {
		return []Incident{}
	}
	defer rows.Close()
	out := []Incident{}
	for rows.Next() {
		inc, err := scanIncidentRow(rows)
		if err != nil {
			continue
		}
		out = append(out, inc)
	}
	return out
}

func (p *PostgresStore) GetIncident(orgID, id string) (IncidentDetail, bool) {
	row := p.db.QueryRow(`SELECT `+incidentColumns+` FROM incidents WHERE id=$1 AND organization_id=$2`, id, orgID)
	inc, err := scanIncidentRow(row)
	if err != nil {
		return IncidentDetail{}, false
	}
	detail := IncidentDetail{
		Incident: inc,
		Alerts:   []Alert{},
		Notes:    []IncidentNote{},
		Timeline: []IncidentTimelineEntry{},
		Events:   []Event{},
	}

	rows, err := p.db.Query(`SELECT a.id, a.organization_id, a.rule_id, a.rule_version, a.title, a.severity,
		a.risk_score, a.status, coalesce(a.status_reason,''), a.window_start, a.window_end, a.reason, a.created_at
		FROM alerts a JOIN incident_alerts ia ON ia.alert_id=a.id WHERE ia.incident_id=$1 ORDER BY a.created_at DESC`, id)
	if err == nil {
		for rows.Next() {
			var a Alert
			var ws, we sql.NullTime
			var rule sql.NullString
			if err := rows.Scan(&a.ID, &a.OrgID, &rule, &a.RuleVersion, &a.Title, &a.Severity, &a.RiskScore,
				&a.Status, &a.StatusReason, &ws, &we, &a.Reason, &a.CreatedAt); err != nil {
				continue
			}
			a.RuleID = rule.String
			a.IncidentID = id
			if ws.Valid {
				a.WindowStart = &ws.Time
			}
			if we.Valid {
				a.WindowEnd = &we.Time
			}
			er, _ := p.db.Query(`SELECT event_id FROM alert_events WHERE alert_id=$1`, a.ID)
			for er.Next() {
				var eid string
				_ = er.Scan(&eid)
				a.EventIDs = append(a.EventIDs, eid)
			}
			er.Close()
			detail.Alerts = append(detail.Alerts, a)
		}
		rows.Close()
	}

	nr, err := p.db.Query(`SELECT id, incident_id, organization_id, author_id, body, created_at
		FROM incident_notes WHERE incident_id=$1 ORDER BY created_at ASC`, id)
	if err == nil {
		for nr.Next() {
			var n IncidentNote
			if err := nr.Scan(&n.ID, &n.IncidentID, &n.OrgID, &n.AuthorID, &n.Body, &n.CreatedAt); err == nil {
				detail.Notes = append(detail.Notes, n)
			}
		}
		nr.Close()
	}

	tr, err := p.db.Query(`SELECT id, incident_id, organization_id, kind, actor_id, message, created_at
		FROM incident_timeline WHERE incident_id=$1 ORDER BY created_at ASC, id ASC`, id)
	if err == nil {
		for tr.Next() {
			var t IncidentTimelineEntry
			if err := tr.Scan(&t.ID, &t.IncidentID, &t.OrgID, &t.Kind, &t.ActorID, &t.Message, &t.CreatedAt); err == nil {
				detail.Timeline = append(detail.Timeline, t)
			}
		}
		tr.Close()
	}

	evRows, err := p.db.Query(`SELECT e.id, e.organization_id, e.source_id, e.timestamp, e.event_type,
		e.severity, e.src_ip, e.username, e.message, e.attributes
		FROM events e WHERE e.id IN (
			SELECT ae.event_id FROM incident_alerts ia JOIN alert_events ae ON ae.alert_id=ia.alert_id WHERE ia.incident_id=$1
		) ORDER BY e.timestamp ASC`, id)
	if err == nil {
		for evRows.Next() {
			var e Event
			var ts time.Time
			var src, ip, un, msg sql.NullString
			var attrs string
			if err := evRows.Scan(&e.ID, &e.OrgID, &src, &ts, &e.EventType, &e.Severity, &ip, &un, &msg, &attrs); err != nil {
				continue
			}
			e.SourceID = src.String
			e.Timestamp = ts
			e.SrcIP = ip.String
			e.Username = un.String
			e.Message = msg.String
			_ = json.Unmarshal([]byte(attrs), &e.Attributes)
			detail.Events = append(detail.Events, e)
		}
		evRows.Close()
	}
	return detail, true
}

func (p *PostgresStore) CreateIncident(orgID, actor string, alertIDs []string, title, assignee string) (Incident, error) {
	alertIDs = uniqueStrings(alertIDs)
	if len(alertIDs) == 0 {
		return Incident{}, fmt.Errorf("alert_ids must contain at least one alert")
	}
	if assignee != "" && !p.userInOrg(orgID, assignee) {
		return Incident{}, fmt.Errorf("assignee is not a member of this organization")
	}

	// Idempotent only when every alert is already linked to the same incident.
	var linkedIncident sql.NullString
	var linkedCount, linkedIncidents int
	err := p.db.QueryRow(`SELECT count(*), count(DISTINCT incident_id), min(incident_id)
		FROM incident_alerts WHERE alert_id = ANY($1)`,
		pq.Array(alertIDs)).Scan(&linkedCount, &linkedIncidents, &linkedIncident)
	if err != nil {
		return Incident{}, err
	}
	if linkedCount == len(alertIDs) && linkedIncidents == 1 && linkedIncident.Valid {
		inc, ok := p.incidentExists(orgID, linkedIncident.String)
		if ok {
			return inc, nil
		}
		return Incident{}, fmt.Errorf("linked incident not found")
	}
	if linkedCount > 0 {
		return Incident{}, fmt.Errorf("one or more alerts already belong to an incident")
	}

	rows, err := p.db.Query(`SELECT title, severity, risk_score FROM alerts WHERE organization_id=$1 AND id = ANY($2)`,
		orgID, pq.Array(alertIDs))
	if err != nil {
		return Incident{}, err
	}
	severity := "low"
	risk := 0
	firstTitle := ""
	found := 0
	for rows.Next() {
		var t, sev string
		var r int
		if err := rows.Scan(&t, &sev, &r); err != nil {
			continue
		}
		if firstTitle == "" {
			firstTitle = t
		}
		severity = maxSeverity(severity, sev)
		if r > risk {
			risk = r
		}
		found++
	}
	rows.Close()
	if found != len(alertIDs) {
		return Incident{}, fmt.Errorf("one or more alerts were not found")
	}
	if strings.TrimSpace(title) == "" {
		title = firstTitle
	}
	indicators := p.indicatorsForAlerts(alertIDs)
	indicatorsJSON, _ := json.Marshal(indicators)
	id := newID("inc")

	tx, err := p.db.Begin()
	if err != nil {
		return Incident{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`INSERT INTO incidents (id, organization_id, title, severity, risk_score, status, assignee_id,
		created_by, indicators) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id, orgID, strings.TrimSpace(title), severity, risk, incidentStatusNew,
		sql.NullString{String: assignee, Valid: assignee != ""}, actor, string(indicatorsJSON)); err != nil {
		return Incident{}, err
	}
	for _, aid := range alertIDs {
		if _, err := tx.Exec(`INSERT INTO incident_alerts (incident_id, alert_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, aid); err != nil {
			return Incident{}, err
		}
	}
	if err := insertTimelineTx(tx, orgID, id, "created", actor,
		fmt.Sprintf("Incident created from %d alert(s)", len(alertIDs))); err != nil {
		return Incident{}, err
	}
	if err := tx.Commit(); err != nil {
		return Incident{}, err
	}
	p.Audit(orgID, actor, "incident.created", id, "ok", "")
	return p.mustIncident(orgID, id), nil
}

func (p *PostgresStore) AttachAlertsToIncident(orgID, id, actor string, alertIDs []string) (Incident, error) {
	alertIDs = uniqueStrings(alertIDs)
	tx, err := p.db.Begin()
	if err != nil {
		return Incident{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	if err := tx.QueryRow(`SELECT status FROM incidents WHERE id=$1 AND organization_id=$2 FOR UPDATE`, id, orgID).Scan(&status); err != nil {
		return Incident{}, fmt.Errorf("incident not found")
	}
	if status == incidentStatusClosed || status == incidentStatusFalsePositive {
		return Incident{}, fmt.Errorf("cannot link alerts to a %s incident", status)
	}

	added := 0
	for _, aid := range alertIDs {
		var org string
		if err := tx.QueryRow(`SELECT organization_id FROM alerts WHERE id=$1`, aid).Scan(&org); err != nil || org != orgID {
			return Incident{}, fmt.Errorf("alert %s not found", aid)
		}
		var current sql.NullString
		_ = tx.QueryRow(`SELECT incident_id FROM incident_alerts WHERE alert_id=$1`, aid).Scan(&current)
		if current.Valid {
			if current.String == id {
				continue
			}
			return Incident{}, fmt.Errorf("alert %s already belongs to incident %s", aid, current.String)
		}
		if _, err := tx.Exec(`INSERT INTO incident_alerts (incident_id, alert_id) VALUES ($1,$2)`, id, aid); err != nil {
			return Incident{}, err
		}
		added++
	}
	if added == 0 {
		if err := tx.Commit(); err != nil {
			return Incident{}, err
		}
		return p.mustIncident(orgID, id), nil
	}

	severity, risk, indicators := incidentAggregates(tx, id)
	inj, _ := json.Marshal(indicators)
	if _, err := tx.Exec(`UPDATE incidents SET severity=$1, risk_score=$2, indicators=$3, updated_at=now()
		WHERE id=$4 AND organization_id=$5`, severity, risk, string(inj), id, orgID); err != nil {
		return Incident{}, err
	}
	if err := insertTimelineTx(tx, orgID, id, "alerts_linked", actor,
		fmt.Sprintf("%d alert(s) linked by correlation", added)); err != nil {
		return Incident{}, err
	}
	if err := tx.Commit(); err != nil {
		return Incident{}, err
	}
	p.Audit(orgID, actor, "incident.alerts_linked", id, "ok", "")
	return p.mustIncident(orgID, id), nil
}

func (p *PostgresStore) UpdateIncident(orgID, id, actor string, patch IncidentPatch) (Incident, error) {
	tx, err := p.db.Begin()
	if err != nil {
		return Incident{}, err
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRow(`SELECT `+incidentBaseColumns+`, 0 FROM incidents WHERE id=$1 AND organization_id=$2 FOR UPDATE`, id, orgID)
	inc, err := scanIncidentRow(row)
	if err != nil {
		return Incident{}, fmt.Errorf("incident not found")
	}
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
		if err := insertTimelineTx(tx, orgID, id, "status_changed", actor, msg); err != nil {
			return Incident{}, err
		}
		if _, err := tx.Exec(`UPDATE alerts SET status=$1,
			status_reason=CASE WHEN $2 <> '' THEN $2 ELSE status_reason END,
			status_updated_by=$3, status_updated_at=now()
			WHERE id IN (SELECT alert_id FROM incident_alerts WHERE incident_id=$4)`,
			alertStatusForIncident(patch.Status), reason, actor, id); err != nil {
			return Incident{}, err
		}
		changed = true
	}

	if patch.AssigneeID != nil {
		next := strings.TrimSpace(*patch.AssigneeID)
		if next != inc.AssigneeID {
			if next != "" && !p.userInOrg(orgID, next) {
				return Incident{}, fmt.Errorf("assignee is not a member of this organization")
			}
			inc.AssigneeID = next
			msg := "Incident unassigned"
			if next != "" {
				msg = "Assigned to " + p.userEmail(orgID, next)
			}
			if err := insertTimelineTx(tx, orgID, id, "assignment_changed", actor, msg); err != nil {
				return Incident{}, err
			}
			changed = true
		}
	}

	if patch.Title != nil && strings.TrimSpace(*patch.Title) != inc.Title {
		if strings.TrimSpace(*patch.Title) == "" {
			return Incident{}, fmt.Errorf("title cannot be empty")
		}
		inc.Title = strings.TrimSpace(*patch.Title)
		if err := insertTimelineTx(tx, orgID, id, "title_changed", actor, "Title updated"); err != nil {
			return Incident{}, err
		}
		changed = true
	}

	if patch.Severity != nil && *patch.Severity != inc.Severity {
		if err := validateSeverity(*patch.Severity); err != nil {
			return Incident{}, err
		}
		inc.Severity = *patch.Severity
		if err := insertTimelineTx(tx, orgID, id, "severity_changed", actor, "Severity changed to "+*patch.Severity); err != nil {
			return Incident{}, err
		}
		changed = true
	}

	indicatorsJSON, _ := json.Marshal(inc.Indicators)
	if _, err := tx.Exec(`UPDATE incidents SET title=$1, severity=$2, status=$3, assignee_id=$4,
		closed_reason=$5, indicators=$6, updated_at=CASE WHEN $7 THEN now() ELSE updated_at END
		WHERE id=$8 AND organization_id=$9`,
		inc.Title, inc.Severity, inc.Status,
		sql.NullString{String: inc.AssigneeID, Valid: inc.AssigneeID != ""},
		sql.NullString{String: inc.ClosedReason, Valid: inc.ClosedReason != ""},
		string(indicatorsJSON), changed, id, orgID); err != nil {
		return Incident{}, err
	}
	if err := tx.Commit(); err != nil {
		return Incident{}, err
	}
	p.Audit(orgID, actor, "incident.updated", id, "ok", "")
	return p.mustIncident(orgID, id), nil
}

func (p *PostgresStore) AddIncidentNote(orgID, id, actor, body string) (IncidentNote, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return IncidentNote{}, fmt.Errorf("note body is required")
	}
	if len(body) > 4000 {
		return IncidentNote{}, fmt.Errorf("note is too long (max 4000)")
	}
	var exists int
	if err := p.db.QueryRow(`SELECT count(*) FROM incidents WHERE id=$1 AND organization_id=$2`, id, orgID).Scan(&exists); err != nil || exists == 0 {
		return IncidentNote{}, fmt.Errorf("incident not found")
	}
	now := time.Now().UTC()
	n := IncidentNote{ID: newID("note"), IncidentID: id, OrgID: orgID, AuthorID: actor, Body: body, CreatedAt: now}
	tx, err := p.db.Begin()
	if err != nil {
		return IncidentNote{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`INSERT INTO incident_notes (id, incident_id, organization_id, author_id, body, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, n.ID, n.IncidentID, n.OrgID, n.AuthorID, n.Body, n.CreatedAt); err != nil {
		return IncidentNote{}, err
	}
	if _, err := tx.Exec(`UPDATE incidents SET updated_at=now() WHERE id=$1 AND organization_id=$2`, id, orgID); err != nil {
		return IncidentNote{}, err
	}
	if err := insertTimelineTx(tx, orgID, id, "note_added", actor, "Investigation note added"); err != nil {
		return IncidentNote{}, err
	}
	if err := tx.Commit(); err != nil {
		return IncidentNote{}, err
	}
	p.Audit(orgID, actor, "incident.note_added", id, "ok", "")
	return n, nil
}

// ---------- helpers ----------

func insertTimelineTx(tx *sql.Tx, orgID, incidentID, kind, actor, message string) error {
	_, err := tx.Exec(`INSERT INTO incident_timeline (id, incident_id, organization_id, kind, actor_id, message)
		VALUES ($1,$2,$3,$4,$5,$6)`, newID("itl"), incidentID, orgID, kind, actor, message)
	return err
}

func (p *PostgresStore) incidentExists(orgID, id string) (Incident, bool) {
	if id == "" {
		return Incident{}, false
	}
	row := p.db.QueryRow(`SELECT `+incidentColumns+` FROM incidents WHERE id=$1 AND organization_id=$2`, id, orgID)
	inc, err := scanIncidentRow(row)
	return inc, err == nil
}

func (p *PostgresStore) mustIncident(orgID, id string) Incident {
	inc, _ := p.incidentExists(orgID, id)
	return inc
}

func (p *PostgresStore) userInOrg(orgID, userID string) bool {
	var c int
	_ = p.db.QueryRow(`SELECT count(*) FROM memberships WHERE organization_id=$1 AND user_id=$2`, orgID, userID).Scan(&c)
	return c > 0
}

func (p *PostgresStore) userEmail(orgID, userID string) string {
	var email string
	_ = p.db.QueryRow(`SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id
		WHERE m.organization_id=$1 AND u.id=$2`, orgID, userID).Scan(&email)
	return email
}

func (p *PostgresStore) indicatorsForAlerts(alertIDs []string) []string {
	rows, err := p.db.Query(`SELECT e.src_ip, e.username, e.source_id FROM events e
		WHERE e.id IN (SELECT event_id FROM alert_events WHERE alert_id = ANY($1))`, pq.Array(alertIDs))
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	evs := []Event{}
	for rows.Next() {
		var e Event
		var ip, user, src sql.NullString
		if err := rows.Scan(&ip, &user, &src); err != nil {
			continue
		}
		e.SrcIP, e.Username, e.SourceID = ip.String, user.String, src.String
		evs = append(evs, e)
	}
	return eventIndicators(evs)
}

// sqlQuerier is satisfied by both *sql.DB and *sql.Tx. Aggregates must run on
// the transaction that just inserted links, otherwise the read cannot see them.
type sqlQuerier interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

func incidentAggregates(q sqlQuerier, incidentID string) (string, int, []string) {
	rows, err := q.Query(`SELECT a.severity, a.risk_score FROM alerts a
		JOIN incident_alerts ia ON ia.alert_id=a.id WHERE ia.incident_id=$1`, incidentID)
	severity := "low"
	risk := 0
	if err == nil {
		for rows.Next() {
			var sev string
			var r int
			if err := rows.Scan(&sev, &r); err == nil {
				severity = maxSeverity(severity, sev)
				if r > risk {
					risk = r
				}
			}
		}
		rows.Close()
	}
	evRows, err := q.Query(`SELECT e.src_ip, e.username, e.source_id FROM events e
		WHERE e.id IN (
			SELECT ae.event_id FROM incident_alerts ia JOIN alert_events ae ON ae.alert_id=ia.alert_id WHERE ia.incident_id=$1
		)`, incidentID)
	evs := []Event{}
	if err == nil {
		for evRows.Next() {
			var e Event
			var ip, user, src sql.NullString
			if err := evRows.Scan(&ip, &user, &src); err == nil {
				e.SrcIP, e.Username, e.SourceID = ip.String, user.String, src.String
				evs = append(evs, e)
			}
		}
		evRows.Close()
	}
	return severity, risk, eventIndicators(evs)
}

func uniqueStrings(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range in {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}
