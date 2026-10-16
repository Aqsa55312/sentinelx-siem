// SentinelX Core API — slice 1: auth, ingestion, DET-001, events/alerts, overview.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type ctxKey string

const claimsKey ctxKey = "claims"

func main() {
	var st Store = NewMemoryStore()
	if url := os.Getenv("DATABASE_URL"); url != "" {
		if pg, err := OpenPostgres(url); err != nil {
			log.Printf("postgres unavailable (%v); using in-memory store", err)
		} else {
			st = pg
			log.Print("using PostgreSQL store")
		}
	} else {
		log.Print("DATABASE_URL unset; using in-memory store (set it for PostgreSQL)")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"status": "ok", "service": "sentinelx-api", "time": time.Now().UTC()})
	})
	mux.HandleFunc("POST /api/v1/auth/login", handleLogin(st))
	mux.HandleFunc("GET /api/v1/dashboard/overview", withAuth(st, handleOverview))
	mux.HandleFunc("POST /api/v1/sources", withAuth(st, handleCreateSource, true))
	mux.HandleFunc("GET /api/v1/sources", withAuth(st, handleListSources))
	mux.HandleFunc("POST /api/v1/ingest/events", withAuth(st, handleIngest, true))
	mux.HandleFunc("POST /api/v1/ingest/upload", withAuth(st, handleUpload, true))
	mux.HandleFunc("GET /api/v1/events", withAuth(st, handleListEvents))
	mux.HandleFunc("GET /api/v1/events/{id}", withAuth(st, handleGetEvent))
	mux.HandleFunc("GET /api/v1/alerts", withAuth(st, handleListAlerts))
	mux.HandleFunc("GET /api/v1/alerts/{id}", withAuth(st, handleGetAlert))

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8080"
	}
	srv := &http.Server{Addr: ":" + addr, Handler: cors(mux), ReadHeaderTimeout: 10 * time.Second}
	log.Printf("sentinelx-api listening on :%s", addr)
	log.Fatal(srv.ListenAndServe())
}

// ---------- middleware ----------

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		if o == "http://localhost:5173" || o == "http://localhost:3000" {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withAuth(st Store, h func(Store, Claims, http.ResponseWriter, *http.Request), requireWrite ...bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if tok == "" {
			writeErr(w, 401, "missing bearer token")
			return
		}
		cl, err := parseToken(strings.TrimSpace(tok))
		if err != nil {
			writeErr(w, 401, "invalid or expired token")
			return
		}
		if len(requireWrite) > 0 && requireWrite[0] && !canWrite(cl.Role) {
			st.Audit(cl.OrgID, cl.UserID, "authz.denied", r.URL.Path, "denied", corrID(r))
			writeErr(w, 403, "role "+cl.Role+" cannot write")
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), claimsKey, cl))
		h(st, cl, w, r)
	}
}

func corrID(r *http.Request) string {
	if c := r.Header.Get("X-Correlation-ID"); c != "" {
		return c
	}
	return newID("corr")
}

// ---------- handlers ----------

func handleLogin(st Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			writeErr(w, 400, "invalid JSON")
			return
		}
		u, err := st.Login(body.Email, body.Password)
		if err != nil {
			writeErr(w, 401, "invalid credentials")
			return
		}
		tok := issueToken(Claims{UserID: u.ID, OrgID: u.OrgID, Role: u.Role})
		writeJSON(w, 200, map[string]any{"token": tok, "role": u.Role, "organization_id": u.OrgID})
	}
}

func handleOverview(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, st.Overview(cl.OrgID))
}

func handleIngest(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		SourceID string           `json:"source_id"`
		Events   []map[string]any `json:"events"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON (max 1MB)")
		return
	}
	if len(body.Events) == 0 || len(body.Events) > 1000 {
		writeErr(w, 400, "events must contain 1..1000 items")
		return
	}
	if body.SourceID == "" {
		body.SourceID = "source-demo-01"
	}
	accepted, rejected := st.Ingest(cl.OrgID, body.SourceID, body.Events)
	fired := evaluateDET001(st, cl.OrgID, accepted)
	st.Audit(cl.OrgID, cl.UserID, "ingest.batch", body.SourceID, "ok", corrID(r))
	writeJSON(w, 202, map[string]any{
		"accepted": len(accepted), "rejected": rejected,
		"alerts_fired": len(fired),
		"alert_ids":    alertIDs(fired),
	})
}

func alertIDs(a []Alert) []string {
	o := make([]string, 0, len(a))
	for _, x := range a {
		o = append(o, x.ID)
	}
	return o
}

func handleListEvents(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 50
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	offset := 0
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		offset = v
	}
	f := EventFilter{
		EventType: q.Get("event_type"),
		SrcIP:     q.Get("src_ip"),
		Username:  q.Get("username"),
		SourceID:  q.Get("source_id"),
	}
	if from := q.Get("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			writeErr(w, 400, "from must be RFC3339")
			return
		}
		f.From, f.HasFrom = t.UTC(), true
	}
	if to := q.Get("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			writeErr(w, 400, "to must be RFC3339")
			return
		}
		f.To, f.HasTo = t.UTC(), true
	}
	events, total := st.ListEvents(cl.OrgID, f, limit, offset)
	writeJSON(w, 200, map[string]any{"events": events, "total": total, "limit": limit, "offset": offset})
}

func handleListSources(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"sources": st.ListSources(cl.OrgID)})
}

func handleCreateSource(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Type string `json:"source_type"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&body); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	src, err := st.CreateSource(cl.OrgID, body.Name, body.Type)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	st.Audit(cl.OrgID, cl.UserID, "source.created", src.ID, "ok", corrID(r))
	writeJSON(w, 201, src)
}

func handleUpload(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10MB cap
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeErr(w, 400, "invalid multipart (max 10MB)")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "field 'file' (.jsonl/.json) is required")
		return
	}
	defer f.Close()
	sourceID := r.FormValue("source_id")
	if sourceID == "" {
		sourceID = "source-demo-01"
	}
	raw, rejectedParse, err := parseUploadFile(f, hdr.Filename)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if len(raw) == 0 {
		writeErr(w, 400, "no valid events found in file")
		return
	}
	accepted, rejectedSchema := st.Ingest(cl.OrgID, sourceID, raw)
	fired := evaluateDET001(st, cl.OrgID, accepted)
	st.Audit(cl.OrgID, cl.UserID, "ingest.upload", sourceID, "ok", corrID(r))
	writeJSON(w, 202, map[string]any{
		"filename": hdr.Filename, "accepted": len(accepted),
		"rejected_parse": rejectedParse, "rejected_schema": rejectedSchema,
		"alerts_fired": len(fired), "alert_ids": alertIDs(fired),
	})
}

func handleGetEvent(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	e, ok := st.GetEvent(cl.OrgID, id)
	if !ok {
		writeErr(w, 404, "event not found")
		return
	}
	writeJSON(w, 200, e)
}

func handleListAlerts(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"alerts": st.ListAlerts(cl.OrgID)})
}

func handleGetAlert(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a, evs, ok := st.GetAlert(cl.OrgID, id)
	if !ok {
		writeErr(w, 404, "alert not found")
		return
	}
	writeJSON(w, 200, map[string]any{"alert": a, "evidence": evs})
}

// ---------- helpers ----------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}
