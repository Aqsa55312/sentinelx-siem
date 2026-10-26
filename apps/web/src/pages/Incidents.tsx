import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { riskTone } from '../lib/format';
import { useI18n, type TranslationKey } from '../i18n';
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

type Transition = { status: string; labelKey: TranslationKey; promptKey?: TranslationKey };

const TRANSITIONS: Record<string, Transition[]> = {
  new: [
    { status: 'triaged', labelKey: 'incidents.action.triage' },
    { status: 'investigating', labelKey: 'incidents.action.investigate' },
    {
      status: 'false_positive',
      labelKey: 'incidents.action.falsePositive',
      promptKey: 'incidents.prompt.falsePositive',
    },
  ],
  triaged: [
    { status: 'investigating', labelKey: 'incidents.action.investigate' },
    {
      status: 'false_positive',
      labelKey: 'incidents.action.falsePositive',
      promptKey: 'incidents.prompt.falsePositive',
    },
  ],
  investigating: [
    { status: 'contained', labelKey: 'incidents.action.contain' },
    { status: 'resolved', labelKey: 'incidents.action.resolve' },
    {
      status: 'false_positive',
      labelKey: 'incidents.action.falsePositive',
      promptKey: 'incidents.prompt.falsePositive',
    },
  ],
  contained: [
    { status: 'resolved', labelKey: 'incidents.action.resolve' },
    { status: 'investigating', labelKey: 'incidents.action.reopen' },
    {
      status: 'false_positive',
      labelKey: 'incidents.action.falsePositive',
      promptKey: 'incidents.prompt.falsePositive',
    },
  ],
  resolved: [
    { status: 'closed', labelKey: 'incidents.action.close', promptKey: 'incidents.prompt.closure' },
  ],
  closed: [],
  false_positive: [],
};

const TIMELINE_LABEL: Record<string, TranslationKey> = {
  created: 'incidents.timeline.created',
  alerts_linked: 'incidents.timeline.alertsLinked',
  status_changed: 'incidents.timeline.statusChanged',
  assignment_changed: 'incidents.timeline.assignmentChanged',
  note_added: 'incidents.timeline.noteAdded',
  title_changed: 'incidents.timeline.titleChanged',
  severity_changed: 'incidents.timeline.severityChanged',
};

function timelineDot(kind: string) {
  if (kind === 'status_changed') return 'failed';
  if (kind === 'note_added') return 'success';
  if (kind === 'alerts_linked') return 'denied';
  return '';
}

export default function Incidents({ refreshKey, focusId, canWrite, onOpenAlert, onViewEvents }: Props) {
  const { t, fmtDateTime, timeAgo, statusLabel, severityLabel, eventTypeLabel, roleLabel } = useI18n();
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
  const [ai, setAi] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

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
    if (!id) return t('common.unassigned');
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
        setActionErr(t('common.reasonRequired'));
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
      setNotice(t('incidents.updatedNotice'));
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
      setNotice(t('incidents.noteNotice'));
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setNoteBusy(false);
    }
  }

  async function generateAISummary() {
    if (!selected) return;
    setAiBusy(true);
    setAiErr('');
    setAi(null);
    try {
      const r = await api.aiSummary(selected);
      setAi(r);
      setDetailKey((k) => k + 1);
    } catch (e: any) {
      setAiErr(e.message);
    } finally {
      setAiBusy(false);
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
      setNotice(t('incidents.exportedNotice'));
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
              <div className="panel-title">{t('incidents.queue')}</div>
              <div className="panel-sub">
                {t('incidents.queueSub', { total: incidents.length, active: activeCount })}
              </div>
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <IconCase size={20} />
              </span>
              <span className="empty-title">{t('incidents.noIncidents')}</span>
              <span className="small">{t('incidents.noIncidentsText')}</span>
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
                        <span className={`status-tag ${i.status}`}>{statusLabel(i.status)}</span>
                        <span>{t('common.alertCount', { count: i.alert_count })}</span>
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
              <span className="empty-title">{t('incidents.select')}</span>
              <span className="small">{t('incidents.selectText')}</span>
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
                    <span className="mono">{inc.incident_id}</span> ·{' '}
                    {t('incidents.updatedAt', { time: timeAgo(inc.updated_at) })}
                    {inc.created_by === 'detection-engine' && (
                      <span className="chip" style={{ marginLeft: 8 }}>{t('incidents.autoCorrelated')}</span>
                    )}
                  </div>
                </div>
                <div className="detail-head-actions">
                  <span className={`sev ${inc.severity}`}>{severityLabel(inc.severity)}</span>
                  <span className={`status-tag ${inc.status}`}>{statusLabel(inc.status)}</span>
                  <button className="btn sm" onClick={exportReport}>
                    <IconDownload size={14} /> {t('common.export')}
                  </button>
                </div>
              </div>

              <RiskMeter score={inc.risk_score} />

              <div className="meta-grid">
                <Meta
                  label={t('incidents.status')}
                  value={<span className={`status-tag ${inc.status}`}>{statusLabel(inc.status)}</span>}
                />
                <Meta
                  label={t('incidents.severity')}
                  value={<span className={`sev ${inc.severity}`}>{severityLabel(inc.severity)}</span>}
                />
                <Meta label={t('incidents.assignee')} value={userLabel(inc.assignee_id)} />
                <Meta label={t('incidents.linkedAlerts')} value={`${inc.alert_count}`} />
              </div>

              <div className="incident-toolbar">
                <label className="inline-field">
                  <span>{t('incidents.assignee')}</span>
                  <select
                    className="select"
                    value={inc.assignee_id ?? ''}
                    disabled={!canWrite || busy}
                    onChange={(e) => updateIncident({ assignee_id: e.target.value })}
                  >
                    <option value="">{t('common.unassigned')}</option>
                    {users.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.email} · {roleLabel(u.role)}
                      </option>
                    ))}
                  </select>
                </label>

                {canWrite && transitions.length > 0 && (
                  <div className="action-row" style={{ marginLeft: 'auto' }}>
                    {transitions.map((tr) => (
                      <button
                        key={tr.status}
                        className={`btn sm ${tr.status === 'false_positive' ? 'ghost' : ''}`}
                        disabled={busy}
                        onClick={() => updateIncident({ status: tr.status }, tr.promptKey ? t(tr.promptKey) : undefined)}
                      >
                        {t(tr.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
                {!canWrite && <span className="chip" style={{ marginLeft: 'auto' }}>{t('common.readOnly')}</span>}
              </div>

              {actionErr && <div className="error-box" style={{ marginBottom: 14 }}>{actionErr}</div>}
              {notice && <div className="notice" style={{ marginBottom: 14 }}>{notice}</div>}

              {inc.closed_reason && (
                <div className="reason-box subtle" style={{ marginBottom: 16 }}>
                  <b>{t('incidents.closedReason')}:</b> {inc.closed_reason}
                </div>
              )}

              <div className="section-label">{t('incidents.indicators')}</div>
              <div className="chips">
                {(inc.indicators ?? []).length === 0 && (
                  <span className="muted small">{t('incidents.noIndicators')}</span>
                )}
                {(inc.indicators ?? []).map((ind: string) => (
                  <span className="chip mono" key={ind}>{ind}</span>
                ))}
              </div>

              <div className="section-label">
                {t('incidents.linkedAlertsCount', { count: detail.alerts?.length ?? 0 })}
              </div>
              <div className="linked-alerts">
                {(detail.alerts ?? []).map((a: any) => (
                  <button className="linked-alert" key={a.alert_id} onClick={() => onOpenAlert(a.alert_id)}>
                    <span className={`dot ${a.severity}`} />
                    <span className="linked-alert-title">{a.title}</span>
                    <span className={`status-tag ${a.status}`}>{statusLabel(a.status)}</span>
                    <span className={`risk-pill ${riskTone(a.risk_score ?? 0)}`}>{a.risk_score}</span>
                    <IconArrowRight size={14} />
                  </button>
                ))}
                {!detail.alerts?.length && <p className="muted small">{t('incidents.noAlertsLinked')}</p>}
              </div>

              <div className="section-label">{t('incidents.notes')}</div>
              <div className="note-list">
                {(detail.notes ?? []).length === 0 && (
                  <p className="muted small">{t('incidents.noNotes')}</p>
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
                    placeholder={t('incidents.notePlaceholder')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={4000}
                  />
                  <button className="btn primary sm" type="submit" disabled={noteBusy || !note.trim()}>
                    <IconNote size={14} /> {noteBusy ? t('incidents.adding') : t('incidents.addNote')}
                  </button>
                </form>
              )}

              <div className="section-label">{t('incidents.activity')}</div>
              <div className="timeline">
                {(detail.timeline ?? []).map((entry: any) => {
                  const labelKey = TIMELINE_LABEL[entry.kind];
                  return (
                    <div className="timeline-item" key={entry.entry_id}>
                      <span className={`timeline-dot ${timelineDot(entry.kind)}`} />
                      <div className="timeline-top">
                        <span className="timeline-type">{labelKey ? t(labelKey) : entry.kind}</span>
                        <span className="timeline-time">
                          <IconClock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                          {fmtDateTime(entry.created_at)}
                        </span>
                      </div>
                      <div className="timeline-meta">
                        <span>{userLabel(entry.actor_id)}</span>
                        <span>{entry.message}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <details className="evidence-block">
                <summary>
                  {t('incidents.evidence', {
                    events: t('common.eventCount', { count: evidence.length }),
                  })}
                </summary>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  {firstIp && (
                    <button className="btn sm" onClick={() => onViewEvents(firstIp)}>
                      {t('incidents.viewSourceEvents')} <IconArrowRight size={14} />
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
                        <span className="timeline-type">{eventTypeLabel(e.event_type)}</span>
                        <span className={`sev ${e.severity}`}>{severityLabel(e.severity)}</span>
                        <span className="timeline-time">{fmtDateTime(e.timestamp)}</span>
                      </div>
                      <div className="timeline-meta">
                        <span className="mono">{e.src_ip || t('common.noSrcIp')}</span>
                        <span>{e.username || t('common.unknownUser')}</span>
                        <span className="mono">{e.event_id}</span>
                      </div>
                    </div>
                  ))}
                  {evidence.length === 0 && <p className="muted small">{t('alerts.noEvidence')}</p>}
                </div>
              </details>

              {canWrite && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-head" style={{ padding: '4px 6px 10px', marginBottom: 10 }}>
                    <div className="panel-title">{t('incidents.ai.title')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <button
                      className="btn primary sm"
                      disabled={aiBusy}
                      onClick={generateAISummary}
                    >
                      {aiBusy ? t('incidents.ai.generating') : t('incidents.ai.generate')}
                    </button>
                    <span className="chip">{t('incidents.ai.disclaimer')}</span>
                  </div>
                  {aiErr && <div className="error-box">{aiErr}</div>}
                  {ai && (
                    <>
                      <div style={{ marginBottom: 10 }}>
                        <div className="small muted" style={{ marginBottom: 4 }}>
                          {t('incidents.ai.summary')}
                        </div>
                        <div className="panel" style={{ padding: 10 }}>{ai.summary}</div>
                      </div>
                      <div className="meta-grid" style={{ gap: 10 }}>
                        <Meta label={t('incidents.ai.confidence')} value={`${ai.confidence}`} />
                        <Meta label={t('incidents.ai.model')} value={ai.model ?? '-'} />
                        <Meta label={t('incidents.ai.prompt')} value={ai.prompt_version ?? '-'} />
                      </div>
                      {(ai.next_steps ?? []).length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="small muted" style={{ marginBottom: 4 }}>
                            {t('incidents.ai.nextSteps')}
                          </div>
                          <ul className="small" style={{ margin: '0 0 0 16px', padding: 0 }}>
                            {(ai.next_steps as any[]).map((s: string) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(ai.alternative_hypotheses ?? []).length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="small muted" style={{ marginBottom: 4 }}>
                            {t('incidents.ai.altHypotheses')}
                          </div>
                          <ul className="small" style={{ margin: '0 0 0 16px', padding: 0 }}>
                            {(ai.alternative_hypotheses as any[]).map((s: string) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(ai.unknowns ?? []).length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="small muted" style={{ marginBottom: 4 }}>
                            {t('incidents.ai.unknowns')}
                          </div>
                          <ul className="small" style={{ margin: '0 0 0 16px', padding: 0 }}>
                            {(ai.unknowns as any[]).map((s: string) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div style={{ marginTop: 10, fontStyle: 'italic', color: 'var(--muted)' }}>
                        {t('incidents.ai.limitations')}: {ai.limitations}
                      </div>
                    </>
                  )}
                  {!ai && !aiErr && !aiBusy && (
                    <p className="muted small">{t('incidents.ai.noIncident')}</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
