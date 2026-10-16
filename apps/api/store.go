// Package main: storage layer. MemoryStore is default for local demo;
// PostgresStore is used when DATABASE_URL is set (primary transactional store).
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type Event struct {
	ID         string         `json:"event_id"`
	OrgID      string         `json:"-"`
	SourceID   string         `json:"source_id,omitempty"`
	Timestamp  time.Time      `json:"timestamp"`
	EventType  string         `json:"event_type"`
	Severity   string         `json:"severity"`
	SrcIP      string         `json:"src_ip,omitempty"`
	Username   string         `json:"username,omitempty"`
	Message    string         `json:"message,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

type Alert struct {
	ID          string     `json:"alert_id"`
	OrgID       string     `json:"-"`
	RuleID      string     `json:"rule_id"`
	RuleVersion int        `json:"rule_version"`
	Title       string     `json:"title"`
	Severity    string     `json:"severity"`
	RiskScore   int        `json:"risk_score"`
	Status      string     `json:"status"`
	WindowStart *time.Time `json:"window_start,omitempty"`
	WindowEnd   *time.Time `json:"window_end,omitempty"`
	Reason      string     `json:"reason"`
	CreatedAt   time.Time  `json:"created_at"`
	EventIDs    []string   `json:"event_ids"`
}

type User struct {
	ID    string
	Email string
	Hash  string
	OrgID string
	Role  string
}

var allowedEventTypes = map[string]bool{
	"authentication_failed": true, "authentication_success": true,
	"authorization_denied": true, "admin_action": true,
	"web_request": true, "high_risk_event": true, "generic": true,
}

var secretKeys = []string{"password", "passwd", "token", "secret", "api_key", "apikey", "authorization", "cookie", "session"}
var bearerRe = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/=]+`)

func newID(prefix string) string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return prefix + "_" + hex.EncodeToString(b[:])
}

// redact removes secret-ish keys and bearer tokens from free text/maps.
func redactMessage(msg string) string { return bearerRe.ReplaceAllString(msg, "Bearer [REDACTED]") }

func redactAttrs(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(in))
	for k, v := range in {
		lk := strings.ToLower(k)
		redacted := false
		for _, s := range secretKeys {
			if strings.Contains(lk, s) {
				redacted = true
				break
			}
		}
		if redacted {
			out[k] = "[REDACTED]"
			continue
		}
		if s, ok := v.(string); ok {
			out[k] = redactMessage(s)
		} else {
			out[k] = v
		}
	}
	return out
}

func validateEventInput(m map[string]any) (Event, string) {
	tsRaw, _ := m["timestamp"].(string)
	if tsRaw == "" {
		return Event{}, "timestamp is required"
	}
	ts, err := time.Parse(time.RFC3339, tsRaw)
	if err != nil {
		return Event{}, "timestamp must be RFC3339 UTC"
	}
	et, _ := m["event_type"].(string)
	if !allowedEventTypes[et] {
		return Event{}, "unsupported event_type"
	}
	msg, _ := m["message"].(string)
	if len(msg) > 4096 {
		return Event{}, "message too long (max 4096)"
	}
	sev, _ := m["severity"].(string)
	if sev == "" {
		sev = "medium"
	}
	if sev != "low" && sev != "medium" && sev != "high" && sev != "critical" {
		return Event{}, "bad severity"
	}
	attrs := map[string]any{}
	if a, ok := m["attributes"].(map[string]any); ok {
		attrs = a
	}
	e := Event{
		Timestamp: ts.UTC(), EventType: et, Severity: sev,
		SrcIP:    strField(m, "src_ip"),
		Username: strField(m, "username"),
		Message:  redactMessage(msg),
		Attributes: redactAttrs(attrs),
	}
	if id, _ := m["event_id"].(string); id != "" {
		e.ID = id
	}
	if sn, _ := m["source_name"].(string); sn != "" {
		if e.Attributes == nil {
			e.Attributes = map[string]any{}
		}
		e.Attributes["source_name"] = sn
	}
	return e, ""
}

func strField(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

// ---------- Store interface ----------

type Source struct {
	ID     string `json:"source_id"`
	OrgID  string `json:"-"`
	Name   string `json:"name"`
	Type   string `json:"source_type"`
	Status string `json:"status"`
}

// EventFilter carries explorer filters; zero values mean "no filter".
type EventFilter struct {
	EventType string
	SrcIP     string
	Username  string
	SourceID  string
	From      time.Time
	To        time.Time
	HasFrom   bool
	HasTo     bool
}

func (f EventFilter) matches(e Event) bool {
	if f.EventType != "" && e.EventType != f.EventType {
		return false
	}
	if f.SrcIP != "" && e.SrcIP != f.SrcIP {
		return false
	}
	if f.Username != "" && e.Username != f.Username {
		return false
	}
	if f.SourceID != "" && e.SourceID != f.SourceID {
		return false
	}
	if f.HasFrom && e.Timestamp.Before(f.From) {
		return false
	}
	if f.HasTo && !e.Timestamp.Before(f.To) {
		return false
	}
	return true
}

type Store interface {
	Login(email, password string) (User, error)
	ListEvents(orgID string, f EventFilter, limit, offset int) (events []Event, total int)
	GetEvent(orgID, id string) (Event, bool)
	Ingest(orgID, sourceID string, raw []map[string]any) (accepted []Event, rejected int)
	ListAlerts(orgID string) []Alert
	GetAlert(orgID, id string) (Alert, []Event, bool)
	Overview(orgID string) map[string]any
	CountFailures(orgID, srcIP string, since time.Time) []Event
	CreateAlert(a Alert) Alert
	HasOpenAlertFor(ruleID, orgID, srcIP string, since time.Time) bool
	ListSources(orgID string) []Source
	CreateSource(orgID, name, typ string) (Source, error)
	Audit(orgID, actor, action, target, result, corrID string)
	AuditCount() int
}

// ---------- MemoryStore ----------

type MemoryStore struct {
	mu        sync.Mutex
	users     map[string]User // email -> user
	events    []Event
	eventsBy  map[string]Event
	alerts    []Alert
	sources   []Source
	audits    int
	ingested  int
	rejected  int
	idemCache map[string]bool
}

func NewMemoryStore() *MemoryStore {
	s := &MemoryStore{users: map[string]User{}, eventsBy: map[string]Event{}, idemCache: map[string]bool{}}
	adminHash, _ := hashPassword("password123")
	s.users["admin@sentinelx.local"] = User{ID: "user-admin-01", Email: "admin@sentinelx.local", Hash: adminHash, OrgID: "org-demo-01", Role: "admin"}
	s.users["analyst@sentinelx.local"] = User{ID: "user-analyst-01", Email: "analyst@sentinelx.local", Hash: adminHash, OrgID: "org-demo-01", Role: "analyst"}
	s.users["viewer@sentinelx.local"] = User{ID: "user-viewer-01", Email: "viewer@sentinelx.local", Hash: adminHash, OrgID: "org-demo-01", Role: "viewer"}
	s.sources = []Source{{ID: "source-demo-01", OrgID: "org-demo-01", Name: "demo-linux-01", Type: "simulator", Status: "healthy"}}
	return s
}

func (s *MemoryStore) Login(email, password string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[strings.ToLower(strings.TrimSpace(email))]
	if !ok || !checkPassword(u.Hash, password) {
		s.audits++
		return User{}, fmt.Errorf("invalid credentials")
	}
	s.audits++
	return u, nil
}

func (s *MemoryStore) Ingest(orgID, sourceID string, raw []map[string]any) ([]Event, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Event
	rejected := 0
	for _, m := range raw {
		e, errMsg := validateEventInput(m)
		if errMsg != "" {
			rejected++
			continue
		}
		if e.ID == "" {
			e.ID = newID("evt")
		}
		if s.eventsBy[e.ID].ID != "" {
			continue // idempotent: duplicate event_id skipped
		}
		e.OrgID = orgID
		e.SourceID = sourceID
		s.events = append(s.events, e)
		s.eventsBy[e.ID] = e
		s.ingested++
		out = append(out, e)
	}
	s.rejected += rejected
	return out, rejected
}

func (s *MemoryStore) ListEvents(orgID string, f EventFilter, limit, offset int) ([]Event, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	// Newest first: walk backwards, collect matches, then slice the page.
	var matched []Event
	for i := len(s.events) - 1; i >= 0; i-- {
		e := s.events[i]
		if e.OrgID != orgID || !f.matches(e) {
			continue
		}
		matched = append(matched, e)
	}
	total := len(matched)
	if offset >= total {
		return []Event{}, total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return matched[offset:end], total
}

func (s *MemoryStore) GetEvent(orgID, id string) (Event, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.eventsBy[id]
	if !ok || e.OrgID != orgID {
		return Event{}, false
	}
	return e, true
}

func (s *MemoryStore) ListAlerts(orgID string) []Alert {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Alert
	for i := len(s.alerts) - 1; i >= 0; i-- {
		if s.alerts[i].OrgID == orgID {
			out = append(out, s.alerts[i])
		}
	}
	return out
}

func (s *MemoryStore) GetAlert(orgID, id string) (Alert, []Event, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, a := range s.alerts {
		if a.ID == id && a.OrgID == orgID {
			var evs []Event
			for _, eid := range a.EventIDs {
				if e, ok := s.eventsBy[eid]; ok {
					evs = append(evs, e)
				}
			}
			return a, evs, true
		}
	}
	return Alert{}, nil, false
}

func (s *MemoryStore) Overview(orgID string) map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	bySev := map[string]int{}
	for _, a := range s.alerts {
		if a.OrgID == orgID {
			bySev[a.Severity]++
		}
	}
	n := 0
	for _, e := range s.events {
		if e.OrgID == orgID {
			n++
		}
	}
	return map[string]any{
		"organization_id": orgID, "total_events": n,
		"total_alerts": len(bySevList(s.alerts, orgID)),
		"alerts_by_severity": bySev,
		"ingested": s.ingested, "rejected": s.rejected,
		"sources": s.sourcesFor(orgID),
	}
}

func (s *MemoryStore) sourcesFor(orgID string) []Source {
	var out []Source
	for _, src := range s.sources {
		if src.OrgID == orgID {
			out = append(out, src)
		}
	}
	return out
}

func (s *MemoryStore) ListSources(orgID string) []Source {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sourcesFor(orgID)
}

func (s *MemoryStore) CreateSource(orgID, name, typ string) (Source, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name = strings.TrimSpace(name)
	if name == "" {
		return Source{}, fmt.Errorf("name is required")
	}
	if typ == "" {
		typ = "simulator"
	}
	switch typ {
	case "simulator", "auth", "web", "api", "host", "cloud":
	default:
		return Source{}, fmt.Errorf("unsupported source_type")
	}
	src := Source{ID: newID("source"), OrgID: orgID, Name: name, Type: typ, Status: "healthy"}
	s.sources = append(s.sources, src)
	s.audits++
	return src, nil
}

func bySevList(alerts []Alert, org string) []Alert {
	var o []Alert
	for _, a := range alerts {
		if a.OrgID == org {
			o = append(o, a)
		}
	}
	return o
}

func (s *MemoryStore) CountFailures(orgID, srcIP string, since time.Time) []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Event
	for _, e := range s.events {
		if e.OrgID == orgID && e.EventType == "authentication_failed" && e.SrcIP == srcIP && !e.Timestamp.Before(since) {
			out = append(out, e)
		}
	}
	return out
}

func (s *MemoryStore) CreateAlert(a Alert) Alert {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a.ID == "" {
		a.ID = newID("alt")
	}
	a.CreatedAt = time.Now().UTC()
	s.alerts = append(s.alerts, a)
	s.audits++
	return a
}

func (s *MemoryStore) HasOpenAlertFor(ruleID, orgID, srcIP string, since time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, a := range s.alerts {
		if a.RuleID == ruleID && a.OrgID == orgID && a.CreatedAt.After(since) && strings.Contains(a.Reason, srcIP) {
			return true
		}
	}
	return false
}

func (s *MemoryStore) Audit(orgID, actor, action, target, result, corrID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audits++
}

func (s *MemoryStore) AuditCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.audits
}

// ---------- PostgresStore (used when DATABASE_URL set) ----------

type PostgresStore struct {
	db *sql.DB
	mem *MemoryStore // audit counters fallback; primary reads go to PG
}

func OpenPostgres(url string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &PostgresStore{db: db, mem: NewMemoryStore()}, nil
}

func (p *PostgresStore) Login(email, password string) (User, error) {
	var id, hash, org, role string
	err := p.db.QueryRow(`SELECT u.id, u.password_hash, m.organization_id, m.role FROM users u
		JOIN memberships m ON m.user_id=u.id WHERE lower(u.email)=lower($1) LIMIT 1`, strings.TrimSpace(email)).Scan(&id, &hash, &org, &role)
	if err != nil || !checkPassword(hash, password) {
		_, _ = p.db.Exec(`INSERT INTO audit_logs (id, organization_id, actor_id, action, result) VALUES ($1,$2,$3,$4,$5)`,
			newID("aud"), sql.NullString{}, email, "auth.login", "denied")
		return User{}, fmt.Errorf("invalid credentials")
	}
	_, _ = p.db.Exec(`INSERT INTO audit_logs (id, organization_id, actor_id, action, result) VALUES ($1,$2,$3,$4,$5)`,
		newID("aud"), org, id, "auth.login", "ok")
	return User{ID: id, Email: email, Hash: hash, OrgID: org, Role: role}, nil
}

func (p *PostgresStore) Ingest(orgID, sourceID string, raw []map[string]any) ([]Event, int) {
	var out []Event
	rejected := 0
	for _, m := range raw {
		e, errMsg := validateEventInput(m)
		if errMsg != "" {
			rejected++
			continue
		}
		if e.ID == "" {
			e.ID = newID("evt")
		}
		attrs, _ := json.Marshal(e.Attributes)
		if sourceID == "" {
			sourceID = "source-demo-01"
		}
		_, err := p.db.Exec(`INSERT INTO events (id, organization_id, source_id, timestamp, event_type, severity, src_ip, username, message, attributes)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
			e.ID, orgID, sql.NullString{String: sourceID, Valid: true}, e.Timestamp, e.EventType, e.Severity,
			sql.NullString{String: e.SrcIP, Valid: e.SrcIP != ""}, sql.NullString{String: e.Username, Valid: e.Username != ""},
			sql.NullString{String: e.Message, Valid: e.Message != ""}, string(attrs))
		if err != nil {
			rejected++
			continue
		}
		e.OrgID = orgID
		e.SourceID = sourceID
		out = append(out, e)
	}
	return out, rejected
}

func scanEvent(r interface {
	Scan(...any) error
}) (Event, error) {
	var e Event
	var ts time.Time
	var src, ip, un, msg sql.NullString
	var attrs string
	var org string
	err := r.Scan(&e.ID, &org, &src, &ts, &e.EventType, &e.Severity, &ip, &un, &msg, &attrs)
	if err != nil {
		return e, err
	}
	e.OrgID = org
	e.SourceID = src.String
	e.Timestamp = ts
	e.SrcIP = ip.String
	e.Username = un.String
	e.Message = msg.String
	_ = json.Unmarshal([]byte(attrs), &e.Attributes)
	return e, nil
}

func (p *PostgresStore) ListEvents(orgID string, f EventFilter, limit, offset int) ([]Event, int) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where, args := eventWhere(orgID, f)
	var total int
	_ = p.db.QueryRow(`SELECT count(*) FROM events `+where, args...).Scan(&total)
	q := `SELECT id, organization_id, source_id, timestamp, event_type, severity, src_ip, username, message, attributes FROM events ` +
		where + fmt.Sprintf(` ORDER BY timestamp DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	args = append(args, limit, offset)
	rows, err := p.db.Query(q, args...)
	if err != nil {
		return []Event{}, total
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		var ts time.Time
		var src, ip, un, msg sql.NullString
		var attrs string
		if err := rows.Scan(&e.ID, &e.OrgID, &src, &ts, &e.EventType, &e.Severity, &ip, &un, &msg, &attrs); err != nil {
			continue
		}
		e.SourceID = src.String
		e.Timestamp = ts
		e.SrcIP = ip.String
		e.Username = un.String
		e.Message = msg.String
		_ = json.Unmarshal([]byte(attrs), &e.Attributes)
		out = append(out, e)
	}
	if out == nil {
		out = []Event{}
	}
	return out, total
}

// eventWhere builds a tenant-scoped WHERE clause shared by count + page queries.
func eventWhere(orgID string, f EventFilter) (string, []any) {
	where := `WHERE organization_id=$1`
	args := []any{orgID}
	add := func(cond string, v any) {
		where += fmt.Sprintf(" AND %s=$%d", cond, len(args)+1)
		args = append(args, v)
	}
	if f.EventType != "" {
		add("event_type", f.EventType)
	}
	if f.SrcIP != "" {
		add("src_ip", f.SrcIP)
	}
	if f.Username != "" {
		add("username", f.Username)
	}
	if f.SourceID != "" {
		add("source_id", f.SourceID)
	}
	if f.HasFrom {
		add("timestamp >=", f.From)
	}
	if f.HasTo {
		add("timestamp <", f.To)
	}
	return where, args
}

func (p *PostgresStore) GetEvent(orgID, id string) (Event, bool) {
	row := p.db.QueryRow(`SELECT id, organization_id, source_id, timestamp, event_type, severity, src_ip, username, message, attributes FROM events WHERE id=$1 AND organization_id=$2`, id, orgID)
	e, err := scanEvent(row)
	if err != nil {
		return Event{}, false
	}
	return e, true
}

func (p *PostgresStore) ListAlerts(orgID string) []Alert {
	rows, err := p.db.Query(`SELECT id, organization_id, rule_id, rule_version, title, severity, risk_score, status, window_start, window_end, reason, created_at FROM alerts WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []Alert
	for rows.Next() {
		var a Alert
		var ws, we sql.NullTime
		var rule sql.NullString
		if err := rows.Scan(&a.ID, &a.OrgID, &rule, &a.RuleVersion, &a.Title, &a.Severity, &a.RiskScore, &a.Status, &ws, &we, &a.Reason, &a.CreatedAt); err != nil {
			continue
		}
		a.RuleID = rule.String
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
		out = append(out, a)
	}
	return out
}

func (p *PostgresStore) GetAlert(orgID, id string) (Alert, []Event, bool) {
	var a Alert
	var ws, we sql.NullTime
	var rule sql.NullString
	err := p.db.QueryRow(`SELECT id, organization_id, rule_id, rule_version, title, severity, risk_score, status, window_start, window_end, reason, created_at FROM alerts WHERE id=$1 AND organization_id=$2`, id, orgID).
		Scan(&a.ID, &a.OrgID, &rule, &a.RuleVersion, &a.Title, &a.Severity, &a.RiskScore, &a.Status, &ws, &we, &a.Reason, &a.CreatedAt)
	if err != nil {
		return Alert{}, nil, false
	}
	a.RuleID = rule.String
	if ws.Valid {
		a.WindowStart = &ws.Time
	}
	if we.Valid {
		a.WindowEnd = &we.Time
	}
	rows, _ := p.db.Query(`SELECT e.id, e.organization_id, e.source_id, e.timestamp, e.event_type, e.severity, e.src_ip, e.username, e.message, e.attributes FROM alert_events ae JOIN events e ON e.id=ae.event_id WHERE ae.alert_id=$1`, id)
	var evs []Event
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var e Event
			var ts time.Time
			var src, ip, un, msg sql.NullString
			var attrs string
			if err := rows.Scan(&e.ID, &e.OrgID, &src, &ts, &e.EventType, &e.Severity, &ip, &un, &msg, &attrs); err != nil {
				continue
			}
			e.SourceID = src.String
			e.Timestamp = ts
			e.SrcIP = ip.String
			e.Username = un.String
			e.Message = msg.String
			_ = json.Unmarshal([]byte(attrs), &e.Attributes)
			evs = append(evs, e)
			a.EventIDs = append(a.EventIDs, e.ID)
		}
	}
	return a, evs, true
}

func (p *PostgresStore) Overview(orgID string) map[string]any {
	var total int
	_ = p.db.QueryRow(`SELECT count(*) FROM events WHERE organization_id=$1`, orgID).Scan(&total)
	bySev := map[string]int{}
	rows, _ := p.db.Query(`SELECT severity, count(*) FROM alerts WHERE organization_id=$1 GROUP BY severity`, orgID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var c int
			_ = rows.Scan(&s, &c)
			bySev[s] = c
		}
	}
	return map[string]any{"organization_id": orgID, "total_events": total, "alerts_by_severity": bySev, "sources": p.ListSources(orgID)}
}

func (p *PostgresStore) CountFailures(orgID, srcIP string, since time.Time) []Event {
	rows, err := p.db.Query(`SELECT id, organization_id, source_id, timestamp, event_type, severity, src_ip, username, message, attributes FROM events WHERE organization_id=$1 AND event_type='authentication_failed' AND src_ip=$2 AND timestamp >= $3 ORDER BY timestamp ASC`, orgID, srcIP, since)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		var ts time.Time
		var src, ip, un, msg sql.NullString
		var attrs string
		if err := rows.Scan(&e.ID, &e.OrgID, &src, &ts, &e.EventType, &e.Severity, &ip, &un, &msg, &attrs); err != nil {
			continue
		}
		e.SourceID = src.String
		e.Timestamp = ts
		e.SrcIP = ip.String
		e.Username = un.String
		e.Message = msg.String
		_ = json.Unmarshal([]byte(attrs), &e.Attributes)
		out = append(out, e)
	}
	return out
}

func (p *PostgresStore) CreateAlert(a Alert) Alert {
	if a.ID == "" {
		a.ID = newID("alt")
	}
	a.CreatedAt = time.Now().UTC()
	_, _ = p.db.Exec(`INSERT INTO alerts (id, organization_id, rule_id, rule_version, title, severity, risk_score, status, window_start, window_end, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		a.ID, a.OrgID, sql.NullString{String: a.RuleID, Valid: a.RuleID != ""}, a.RuleVersion, a.Title, a.Severity, a.RiskScore, a.Status,
		toNullTime(a.WindowStart), toNullTime(a.WindowEnd), a.Reason)
	for _, eid := range a.EventIDs {
		_, _ = p.db.Exec(`INSERT INTO alert_events (alert_id, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, a.ID, eid)
	}
	return a
}

func toNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func (p *PostgresStore) HasOpenAlertFor(ruleID, orgID, srcIP string, since time.Time) bool {
	var c int
	_ = p.db.QueryRow(`SELECT count(*) FROM alerts WHERE rule_id=$1 AND organization_id=$2 AND created_at >= $3 AND reason LIKE '%'||$4||'%'`, ruleID, orgID, since, srcIP).Scan(&c)
	return c > 0
}

func (p *PostgresStore) ListSources(orgID string) []Source {
	rows, err := p.db.Query(`SELECT id, name, source_type, status FROM log_sources WHERE organization_id=$1 ORDER BY name`, orgID)
	if err != nil {
		return []Source{}
	}
	defer rows.Close()
	out := []Source{}
	for rows.Next() {
		var s Source
		s.OrgID = orgID
		if err := rows.Scan(&s.ID, &s.Name, &s.Type, &s.Status); err != nil {
			continue
		}
		out = append(out, s)
	}
	return out
}

func (p *PostgresStore) CreateSource(orgID, name, typ string) (Source, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Source{}, fmt.Errorf("name is required")
	}
	if typ == "" {
		typ = "simulator"
	}
	switch typ {
	case "simulator", "auth", "web", "api", "host", "cloud":
	default:
		return Source{}, fmt.Errorf("unsupported source_type")
	}
	s := Source{ID: newID("source"), OrgID: orgID, Name: name, Type: typ, Status: "healthy"}
	_, err := p.db.Exec(`INSERT INTO log_sources (id, organization_id, name, source_type, status) VALUES ($1,$2,$3,$4,$5)`,
		s.ID, orgID, name, typ, s.Status)
	if err != nil {
		return Source{}, err
	}
	return s, nil
}

func (p *PostgresStore) Audit(orgID, actor, action, target, result, corrID string) {	_, _ = p.db.Exec(`INSERT INTO audit_logs (id, organization_id, actor_id, action, target_id, result, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		newID("aud"), sql.NullString{String: orgID, Valid: orgID != ""}, sql.NullString{String: actor, Valid: actor != ""},
		action, sql.NullString{String: target, Valid: target != ""}, result, sql.NullString{String: corrID, Valid: corrID != ""})
}

func (p *PostgresStore) AuditCount() int {
	var c int
	_ = p.db.QueryRow(`SELECT count(*) FROM audit_logs`).Scan(&c)
	return c
}
