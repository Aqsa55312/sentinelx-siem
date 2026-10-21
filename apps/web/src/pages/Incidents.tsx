import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDateTime, riskTone, timeAgo, titleCase } from '../lib/format';
import {
  IconArrowRight,
  IconCase,
  IconClock,
  IconDownload,
  IconNote,
} from '../components/Icons';
import Meta from '../components/Meta';
import RiskMeter from '../components/RiskMeter';

type Props = {
  refreshKey: number;
  focusId?: string | null;
  canWrite: boolean;
  onOpenAlert: (id: string) => void;
  onViewEvents: (srcIp: string) => void;
};

type Transition = { status: string; label: string; prompt?: string };

const TRANSITIONS: Record<string, Transition[]> = {
  new: [
    { status: 'triaged', label: 'Triage' },
    { status: 'investigating', label: 'Investigate' },
    { status: 'false_positive', label: 'False positive', prompt: 'Why is this incident a false positive? (required, audit-logged)' },
  ],
  triaged: [
    { status: 'investigating', label: 'Investigate' },
    { status: 'false_positive', label: 'False positive', prompt: 'Why is this incident a false positive? (required, audit-logged)' },
  ],
  investigating: [
    { status: 'contained', label: 'Contain' },
    { status: 'resolved', label: 'Resolve' },
    { status: 'false_positive', label: 'False positive', prompt: 'Why is this incident a false positive? (required, audit-logged)' },
  ],
  contained: [
    { status: 'resolved', label: 'Resolve' },
    { status: 'investigating', label: 'Reopen investigation' },
    { status: 'false_positive', label: 'False positive', prompt: 'Why is this incident a false positive? (required, audit-logged)' },
  ],
  resolved: [{ status: 'closed', label: 'Close', prompt: 'Closure summary (required, audit-logged)' }],
  closed: [],
  false_positive: [],
};

const TIMELINE_LABEL: Record<string, string> = {
  created: 'Incident created',
  alerts_linked: 'Alerts linked',
  status_changed: 'Status changed',
  assignment_changed: 'Assignment changed',
  note_added: 'Investigation note',
  title_changed: 'Title updated',
  severity_changed: 'Severity changed',
};

function timelineDot(kind: string) {
  if (kind === 'status_changed') return 'failed';
  if (kind === 'note_added') return 'success';
  if (kind === 'alerts_linked') return 'denied';
  return '';
}

export default function Incidents({ refreshKey, focusId, canWrite, onOpenAlert, onViewEvents }: Props) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(focusId ?? null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [detailKey, setDetailKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([api.incidents(), api.users()])
      .then(([r, u]) => {
        if (!alive) return;
        const list = r.incidents ?? [];
        setIncidents(list);
        setUsers(u.users ?? []);
        setSelected((cur) => cur ?? focusId ?? list[0]?.incident_id ?? null);
      })
      .catch((e: any) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (focusId && focusId !== selected) setSelected(focusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .incidentDetail(selected)
      .then((r) => {
        if (!alive) return;
        setDetail(r);
        setErr('');
      })
      .catch((e: any) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected, detailKey, refreshKey]);

  const userMap = useMemo(() => {
    const m = new Map<string, any>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  const userLabel = (id?: string) => {
    if (!id) return 'Unassigned';
    return userMap.get(id)?.email ?? id;
  };

  const evidence = useMemo(() => {
    const evs: any[] = detail?.events ?? [];
    return [...evs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [detail]);
  const firstIp = evidence.find((e) => e.src_ip)?.src_ip ?? '';

  async function refreshList() {
    const r = await api.incidents();
    setIncidents(r.incidents ?? []);
  }

  async function updateIncident(patch: Record<string, unknown>, promptText?: string) {
    if (!selected) return;
    if (promptText) {
      const input = window.prompt(promptText);
      if (input === null) return;
      const reason = input.trim();
      if (!reason) {
        setActionErr('A reason is required for this action.');
        return;
      }
      patch = { ...patch, closed_reason: reason };
    }
    setBusy(true);
    setActionErr('');
    setNotice('');
    try {
      await api.updateIncident(selected, patch);
      await refreshList();
      setDetailKey((k) => k + 1);
      setNotice('Incident updated and audit-logged.');
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !note.trim()) return;
    setNoteBusy(true);
    setActionErr('');
    try {
      await api.addIncidentNote(selected, note.trim());
      setNote('');
      await refreshList();
      setDetailKey((k) => k + 1);
      setNotice('Note added to the incident timeline.');
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setNoteBusy(false);
    }
  }

  async function exportReport() {
    if (!selected) return;
    setActionErr('');
    try {
      const text = await api.exportIncident(selected);
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selected}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Markdown report exported.');
    } catch (e: any) {
      setActionErr(e.message);
    }
  }

  if (err && !incidents.length) {
    return (
      <div className="panel">
        <div className="error-box">{err}</div>
      </div>
    );
  }

  const inc = detail?.incident;
  const status = inc?.status ?? '';
  const transitions = TRANSITIONS[status] ?? [];
  const activeCount = incidents.filter((i) =>
    ['new', 'triaged', 'investigating', 'contained'].includes(i.status),
  ).length;

  return (
    <>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="split incidents-split">
        <section className="panel" style={{ padding: 14 }}>
          <div className="panel-head" style={{ padding: '4px 6px 10px', marginBottom: 4 }}>
            <div>
              <div className="panel-title">Incident queue</div>
              <div className="panel-sub">
                {incidents.length} total · {activeCount} active · correlation groups shared indicators
              </div>
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <IconCase size={20} />
              </span>
              <span className="empty-title">No incidents yet</span>
              <span className="small">
                Alerts sharing an IP or username inside 24h are grouped automatically. Upload a scenario to seed the
                queue.
              </span>
            </div>
          ) : (
            <div className="alert-list">
              {incidents.map((i) => {
                const tone = riskTone(i.risk_score ?? 0);
                return (
                  <button
                    key={i.incident_id}
                    className={`alert-item ${selected === i.incident_id ? 'selected' : ''}`}
                    onClick={() => setSelected(i.incident_id)}
                  >
                    <span className={`dot ${i.severity}`} />
                    <span style={{ minWidth: 0 }}>
                      <span className="alert-item-title" style={{ display: 'block' }}>
                        {i.title}
                      </span>
                      <span className="alert-item-meta">
                        <span className={`status-tag ${i.status}`}>{titleCase(i.status)}</span>
                        <span>{i.alert_count} alert{i.alert_count === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span>{timeAgo(i.updated_at)}</span>
                      </span>
                      <span className="incident-assignee">{userLabel(i.assignee_id)}</span>
                    </span>
                    <span className={`risk-pill ${tone}`}>{i.risk_score}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel incident-detail">
          {!selected || (!detail && !loading) ? (
            <div className="empty">
              <span className="empty-icon">
                <IconCase size={20} />
              </span>
              <span className="empty-title">Select an incident</span>
              <span className="small">
                Risk, linked alerts, evidence, investigation notes, and the activity trail appear here.
              </span>
            </div>
          ) : loading && !detail ? (
            <div>
              <div className="skeleton" style={{ height: 26, width: '55%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 14, width: '35%', marginBottom: 20 }} />
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          ) : (
            <>
              <div className="detail-head">
                <span className={`dot ${inc.severity}`} style={{ marginTop: 8 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="detail-title">{inc.title}</div>
                  <div className="detail-sub">
                    <span className="mono">{inc.incident_id}</span> · updated {timeAgo(inc.updated_at)}
                    {inc.created_by === 'detection-engine' && (
                      <span className="chip" style={{ marginLeft: 8 }}>auto-correlated</span>
                    )}
                  </div>
                </div>
                <div className="detail-head-actions">
                  <span className={`sev ${inc.severity}`}>{inc.severity}</span>
                  <span className={`status-tag ${inc.status}`}>{titleCase(inc.status)}</span>
                  <button className="btn sm" onClick={exportReport}>
                    <IconDownload size={14} /> Export
                  </button>
                </div>
              </div>

              <RiskMeter score={inc.risk_score} />

              <div className="meta-grid">
                <Meta label="Status" value={<span className={`status-tag ${inc.status}`}>{titleCase(inc.status)}</span>} />
                <Meta label="Severity" value={<span className={`sev ${inc.severity}`}>{inc.severity}</span>} />
                <Meta label="Assignee" value={userLabel(inc.assignee_id)} />
                <Meta label="Linked alerts" value={`${inc.alert_count}`} />
              </div>

              <div className="incident-toolbar">
                <label className="inline-field">
                  <span>Assignee</span>
                  <select
                    className="select"
                    value={inc.assignee_id ?? ''}
                    disabled={!canWrite || busy}
                    onChange={(e) => updateIncident({ assignee_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.email} · {u.role}
                      </option>
                    ))}
                  </select>
                </label>

                {canWrite && transitions.length > 0 && (
                  <div className="action-row" style={{ marginLeft: 'auto' }}>
                    {transitions.map((t) => (
                      <button
                        key={t.status}
                        className={`btn sm ${t.status === 'false_positive' ? 'ghost' : ''}`}
                        disabled={busy}
                        onClick={() => updateIncident({ status: t.status }, t.prompt)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                {!canWrite && <span className="chip" style={{ marginLeft: 'auto' }}>read-only role</span>}
              </div>

              {actionErr && <div className="error-box" style={{ marginBottom: 14 }}>{actionErr}</div>}
              {notice && <div className="notice" style={{ marginBottom: 14 }}>{notice}</div>}

              {inc.closed_reason && (
                <div className="reason-box subtle" style={{ marginBottom: 16 }}>
                  <b>Closure reason:</b> {inc.closed_reason}
                </div>
              )}

              <div className="section-label">Indicators</div>
              <div className="chips">
                {(inc.indicators ?? []).length === 0 && <span className="muted small">No indicators recorded.</span>}
                {(inc.indicators ?? []).map((ind: string) => (
                  <span className="chip mono" key={ind}>{ind}</span>
                ))}
              </div>

              <div className="section-label">Linked alerts · {detail.alerts?.length ?? 0}</div>
              <div className="linked-alerts">
                {(detail.alerts ?? []).map((a: any) => (
                  <button className="linked-alert" key={a.alert_id} onClick={() => onOpenAlert(a.alert_id)}>
                    <span className={`dot ${a.severity}`} />
                    <span className="linked-alert-title">{a.title}</span>
                    <span className={`status-tag ${a.status}`}>{titleCase(a.status)}</span>
                    <span className={`risk-pill ${riskTone(a.risk_score ?? 0)}`}>{a.risk_score}</span>
                    <IconArrowRight size={14} />
                  </button>
                ))}
                {!detail.alerts?.length && <p className="muted small">No alerts linked.</p>}
              </div>

              <div className="section-label">Investigation notes</div>
              <div className="note-list">
                {(detail.notes ?? []).length === 0 && (
                  <p className="muted small">No notes yet. Document what you checked and what you ruled out.</p>
                )}
                {(detail.notes ?? []).map((n: any) => (
                  <div className="note-item" key={n.note_id}>
                    <div className="note-meta">
                      <span>{userLabel(n.author_id)}</span>
                      <span>{fmtDateTime(n.created_at)}</span>
                    </div>
                    <div className="note-body">{n.body}</div>
                  </div>
                ))}
              </div>

              {canWrite && (
                <form className="note-form" onSubmit={addNote}>
                  <textarea
                    className="input"
                    placeholder="Add an investigation note — what did you verify, and what did you rule out?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={4000}
                  />
                  <button className="btn primary sm" type="submit" disabled={noteBusy || !note.trim()}>
                    <IconNote size={14} /> {noteBusy ? 'Adding…' : 'Add note'}
                  </button>
                </form>
              )}

              <div className="section-label">Activity timeline</div>
              <div className="timeline">
                {(detail.timeline ?? []).map((t: any) => (
                  <div className="timeline-item" key={t.entry_id}>
                    <span className={`timeline-dot ${timelineDot(t.kind)}`} />
                    <div className="timeline-top">
                      <span className="timeline-type">{TIMELINE_LABEL[t.kind] ?? t.kind}</span>
                      <span className="timeline-time">
                        <IconClock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                        {fmtDateTime(t.created_at)}
                      </span>
                    </div>
                    <div className="timeline-meta">
                      <span>{userLabel(t.actor_id)}</span>
                      <span>{t.message}</span>
                    </div>
                  </div>
                ))}
              </div>

              <details className="evidence-block">
                <summary>
                  Evidence · {evidence.length} event{evidence.length === 1 ? '' : 's'}
                </summary>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  {firstIp && (
                    <button className="btn sm" onClick={() => onViewEvents(firstIp)}>
                      View source events <IconArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="timeline" style={{ marginTop: 12 }}>
                  {evidence.map((e: any) => (
                    <div className="timeline-item" key={e.event_id}>
                      <span
                        className={`timeline-dot ${
                          e.event_type === 'authentication_success'
                            ? 'success'
                            : e.event_type === 'authentication_failed'
                            ? 'failed'
                            : e.event_type === 'authorization_denied'
                            ? 'denied'
                            : ''
                        }`}
                      />
                      <div className="timeline-top">
                        <span className="timeline-type">{e.event_type}</span>
                        <span className={`sev ${e.severity}`}>{e.severity}</span>
                        <span className="timeline-time">{fmtDateTime(e.timestamp)}</span>
                      </div>
                      <div className="timeline-meta">
                        <span className="mono">{e.src_ip || 'no src_ip'}</span>
                        <span>{e.username || 'unknown user'}</span>
                        <span className="mono">{e.event_id}</span>
                      </div>
                    </div>
                  ))}
                  {evidence.length === 0 && <p className="muted small">No linked evidence events.</p>}
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </>
  );
}
