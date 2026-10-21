import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDateTime, riskLabel, riskTone, timeAgo, titleCase } from '../lib/format';
import { IconArrowRight, IconBell, IconCase, IconClock, IconShield } from '../components/Icons';

type Props = {
  refreshKey: number;
  focusId?: string | null;
  canWrite: boolean;
  onViewEvents: (srcIp: string) => void;
  onOpenIncident: (id: string) => void;
};

export default function Alerts({ refreshKey, focusId, canWrite, onViewEvents, onOpenIncident }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(focusId ?? null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api
      .alerts()
      .then((r) => {
        const list = r.alerts ?? [];
        setAlerts(list);
        setSelected((cur) => cur ?? focusId ?? list[0]?.alert_id ?? null);
      })
      .catch((e: any) => setErr(e.message));
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
    setLoadingDetail(true);
    api
      .alertDetail(selected)
      .then((r) => alive && setDetail(r))
      .catch((e: any) => alive && setErr(e.message))
      .finally(() => alive && setLoadingDetail(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  const evidence = useMemo(() => {
    const evs: any[] = detail?.evidence ?? [];
    return [...evs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [detail]);

  const firstIp = evidence.find((e) => e.src_ip)?.src_ip ?? '';

  async function updateStatus(status: string, needsReason = false) {
    if (!detail?.alert) return;
    let reason = '';
    if (needsReason) {
      const input = window.prompt(
        status === 'false_positive'
          ? 'Why is this alert a false positive? (required, audit-logged)'
          : 'Reason for closing this alert? (required, audit-logged)',
      );
      if (input === null) return;
      reason = input.trim();
      if (!reason) {
        setActionErr('A reason is required for this action.');
        return;
      }
    }
    setBusy(true);
    setActionErr('');
    try {
      const updated = await api.updateAlert(detail.alert.alert_id, status, reason);
      setDetail((d: any) => (d ? { ...d, alert: { ...d.alert, ...updated } } : d));
      const r = await api.alerts();
      setAlerts(r.alerts ?? []);
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const status = detail?.alert?.status ?? '';
  const active = status === 'new' || status === 'triaged' || status === 'investigating';

  return (
    <>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="split">
        <section className="panel" style={{ padding: 14 }}>
          <div className="panel-head" style={{ padding: '4px 6px 10px', marginBottom: 4 }}>
            <div>
              <div className="panel-title">Detections</div>
              <div className="panel-sub">
                {alerts.length} alert{alerts.length === 1 ? '' : 's'} · click to inspect
              </div>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <IconBell size={20} />
              </span>
              <span className="empty-title">No alerts yet</span>
              <span className="small">Upload a scenario from Event Explorer to trigger detection.</span>
            </div>
          ) : (
            <div className="alert-list">
              {alerts.map((a) => {
                const tone = riskTone(a.risk_score ?? 0);
                return (
                  <button
                    key={a.alert_id}
                    className={`alert-item ${selected === a.alert_id ? 'selected' : ''}`}
                    onClick={() => setSelected(a.alert_id)}
                  >
                    <span className={`dot ${a.severity}`} />
                    <span style={{ minWidth: 0 }}>
                      <span className="alert-item-title" style={{ display: 'block' }}>
                        {a.title}
                      </span>
                      <span className="alert-item-meta">
                        <span className={`status-tag ${a.status}`}>{titleCase(a.status)}</span>
                        <span className="mono">{a.rule_id}</span>
                        <span>·</span>
                        <span>{timeAgo(a.created_at)}</span>
                      </span>
                    </span>
                    <span className={`risk-pill ${tone}`}>{a.risk_score}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel alert-detail">
          {!selected || (!detail && !loadingDetail) ? (
            <div className="empty">
              <span className="empty-icon">
                <IconShield size={20} />
              </span>
              <span className="empty-title">Select an alert</span>
              <span className="small">The evidence trail, risk reasoning, and rule metadata appear here.</span>
            </div>
          ) : loadingDetail && !detail ? (
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
                <span className={`dot ${detail.alert.severity}`} style={{ marginTop: 8 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="detail-title">{detail.alert.title}</div>
                  <div className="detail-sub">
                    {detail.alert.rule_id} · v{detail.alert.rule_version} · detected {timeAgo(detail.alert.created_at)}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={`sev ${detail.alert.severity}`}>{detail.alert.severity}</span>
                  <span className="chip">status: <b>{detail.alert.status}</b></span>
                  {detail.alert.incident_id && (
                    <button className="btn sm" onClick={() => onOpenIncident(detail.alert.incident_id)}>
                      <IconCase size={14} /> Incident
                    </button>
                  )}
                </div>
              </div>

              <div className="risk-meter">
                <div className="risk-meter-top">
                  <span className="risk-value">{detail.alert.risk_score}</span>
                  <span className="muted small">/ 100</span>
                  <span className="chip" style={{ marginLeft: 'auto' }}>
                    {riskLabel(detail.alert.risk_score)}
                  </span>
                </div>
                <div className="risk-track">
                  <div
                    className={`risk-fill ${riskTone(detail.alert.risk_score)}`}
                    style={{
                      width: `${Math.max(3, detail.alert.risk_score)}%`,
                      background:
                        riskTone(detail.alert.risk_score) === 'critical'
                          ? 'linear-gradient(90deg,#ff5c7c,#d62c50)'
                          : riskTone(detail.alert.risk_score) === 'high'
                          ? 'linear-gradient(90deg,#ffab6b,#e97a22)'
                          : riskTone(detail.alert.risk_score) === 'medium'
                          ? 'linear-gradient(90deg,#ffd76a,#d8a51c)'
                          : 'linear-gradient(90deg,#7fd0ff,#2a8fd0)',
                    }}
                  />
                </div>
                <div className="risk-scale">
                  <span>0 · informational</span>
                  <span>50 · medium</span>
                  <span>100 · critical</span>
                </div>
              </div>

              <div className="detail-actions">
                <span className="section-label" style={{ margin: 0 }}>Triage</span>
                <span className={`status-tag ${status}`}>{titleCase(status)}</span>
                <div className="action-row">
                  {canWrite && (status === 'new' || status === 'triaged') && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('triaged')}>
                      Acknowledge
                    </button>
                  )}
                  {canWrite && active && status !== 'investigating' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('investigating')}>
                      Investigate
                    </button>
                  )}
                  {canWrite && status === 'investigating' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('resolved')}>
                      Mark resolved
                    </button>
                  )}
                  {canWrite && status === 'resolved' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('closed', true)}>
                      Close
                    </button>
                  )}
                  {canWrite && active && (
                    <button className="btn ghost sm" disabled={busy} onClick={() => updateStatus('false_positive', true)}>
                      False positive
                    </button>
                  )}
                  {!canWrite && <span className="chip">read-only role</span>}
                </div>
              </div>

              {actionErr && <div className="error-box" style={{ marginBottom: 14 }}>{actionErr}</div>}
              {detail.alert.status_reason && (
                <div className="reason-box subtle" style={{ marginBottom: 18 }}>
                  <b>{titleCase(detail.alert.status)} reason:</b> {detail.alert.status_reason}
                </div>
              )}

              <div className="reason-box">{detail.alert.reason}</div>

              <div className="meta-grid">
                <Meta label="Rule" value={<span className="mono">{detail.alert.rule_id}</span>} />
                <Meta label="Rule version" value={`v${detail.alert.rule_version}`} />
                <Meta label="Window start" value={<span className="mono">{fmtDateTime(detail.alert.window_start)}</span>} />
                <Meta label="Window end" value={<span className="mono">{fmtDateTime(detail.alert.window_end)}</span>} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="section-label" style={{ margin: 0 }}>
                  Evidence timeline · {evidence.length} event{evidence.length === 1 ? '' : 's'}
                </div>
                {firstIp && (
                  <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onViewEvents(firstIp)}>
                    View related events <IconArrowRight size={14} />
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
                      <span className="timeline-time">
                        <IconClock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                        {fmtDateTime(e.timestamp)}
                      </span>
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
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}
