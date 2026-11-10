// Week 7: response simulation + approval flow handlers.
// Response actions are simulated only — no production command is ever sent.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type createResponseActionRequest struct {
	ActionType string `json:"action_type"`
	Target     string `json:"target"`
	Reason     string `json:"reason"`
}

type rejectResponseActionRequest struct {
	Reason string `json:"reason"`
}

func handleCreateResponseAction(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	incidentID := r.PathValue("id")
	var req createResponseActionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	ra, err := st.CreateResponseAction(cl.OrgID, cl.UserID, incidentID, req.ActionType, req.Target, req.Reason)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	st.Audit(cl.OrgID, cl.UserID, "response_action.created", ra.ID, "ok", corrID(r))
	writeJSON(w, 201, ra)
}

func handleListResponseActions(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	incidentID := r.PathValue("id")
	actions := st.ListResponseActions(cl.OrgID, incidentID)
	writeJSON(w, 200, map[string]any{"response_actions": actions})
}

func handleApproveResponseAction(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ra, err := st.ApproveResponseAction(cl.OrgID, id, cl.UserID)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	st.Audit(cl.OrgID, cl.UserID, "response_action.executed", ra.ID, "ok", corrID(r))
	writeJSON(w, 200, ra)
}

func handleRejectResponseAction(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req rejectResponseActionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	ra, err := st.RejectResponseAction(cl.OrgID, id, cl.UserID, req.Reason)
	if err != nil {
		writeErr(w, storeErrStatus(err), err.Error())
		return
	}
	st.Audit(cl.OrgID, cl.UserID, "response_action.rejected", ra.ID, "ok", corrID(r))
	writeJSON(w, 200, ra)
}

func handleListAuditLogs(st Store, cl Claims, w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strAtoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	logs := st.ListAuditLogs(cl.OrgID)
	if len(logs) > limit {
		logs = logs[:limit]
	}
	writeJSON(w, 200, map[string]any{"audit_logs": logs, "limit": limit})
}

func strAtoi(s string) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not an integer")
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}
