import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { riskTone } from '../lib/format';
import { useI18n } from '../i18n';
import { IconArrowRight, IconBell, IconCase, IconClock, IconShield } from '../components/Icons';
import Meta from '../components/Meta';
import RiskMeter from '../components/RiskMeter';

type Props = {
  refreshKey: number;
  focusId?: string | null;
  canWrite: boolean;
  onViewEvents: (srcIp: string) => void;
  onOpenIncident: (id: string) => void;
};

export default function Alerts({ refreshKey, focusId, canWrite, onViewEvents, onOpenIncident }: Props) {
  const { t, fmtDateTime, timeAgo, statusLabel, severityLabel, eventTypeLabel } = useI18n();
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
        status === 'false_positive' ? t('alerts.falsePositivePrompt') : t('alerts.closePrompt'),
      );
      if (input === null) return;
      reason = input.trim();
      if (!reason) {
        setActionErr(t('common.reasonRequired'));
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
              <div className="panel-title">{t('alerts.detections')}</div>
              <div className="panel-sub">
                {t('alerts.detectionsSub', { alerts: t('common.alertCount', { count: alerts.length }) })}
              </div>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <IconBell size={20} />
              </span>
              <span className="empty-title">{t('alerts.noAlerts')}</span>
              <span className="small">{t('alerts.noAlertsText')}</span>
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
                        <span className={`status-tag ${a.status}`}>{statusLabel(a.status)}</span>
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
              <span className="empty-title">{t('alerts.select')}</span>
              <span className="small">{t('alerts.selectText')}</span>
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
                    {detail.alert.rule_id} · v{detail.alert.rule_version} ·{' '}
                    {t('alerts.detectedAt', { time: timeAgo(detail.alert.created_at) })}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={`sev ${detail.alert.severity}`}>{severityLabel(detail.alert.severity)}</span>
                  <span className="chip">
                    {t('common.status')}: <b>{statusLabel(detail.alert.status)}</b>
                  </span>
                  {detail.alert.incident_id && (
                    <button className="btn sm" onClick={() => onOpenIncident(detail.alert.incident_id)}>
                      <IconCase size={14} /> {t('alerts.incident')}
                    </button>
                  )}
                </div>
              </div>

              <RiskMeter score={detail.alert.risk_score} />

              <div className="detail-actions">
                <span className="section-label" style={{ margin: 0 }}>{t('alerts.triage')}</span>
                <span className={`status-tag ${status}`}>{statusLabel(status)}</span>
                <div className="action-row">
                  {canWrite && (status === 'new' || status === 'triaged') && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('triaged')}>
                      {t('alerts.acknowledge')}
                    </button>
                  )}
                  {canWrite && active && status !== 'investigating' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('investigating')}>
                      {t('alerts.investigate')}
                    </button>
                  )}
                  {canWrite && status === 'investigating' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('resolved')}>
                      {t('alerts.markResolved')}
                    </button>
                  )}
                  {canWrite && status === 'resolved' && (
                    <button className="btn sm" disabled={busy} onClick={() => updateStatus('closed', true)}>
                      {t('alerts.close')}
                    </button>
                  )}
                  {canWrite && active && (
                    <button className="btn ghost sm" disabled={busy} onClick={() => updateStatus('false_positive', true)}>
                      {t('alerts.falsePositive')}
                    </button>
                  )}
                  {!canWrite && <span className="chip">{t('common.readOnly')}</span>}
                </div>
              </div>

              {actionErr && <div className="error-box" style={{ marginBottom: 14 }}>{actionErr}</div>}
              {detail.alert.status_reason && (
                <div className="reason-box subtle" style={{ marginBottom: 18 }}>
                  <b>{t('alerts.statusReason', { status: statusLabel(detail.alert.status) })}</b>{' '}
                  {detail.alert.status_reason}
                </div>
              )}

              <div className="reason-box">{detail.alert.reason}</div>

              <div className="meta-grid">
                <Meta label={t('alerts.rule')} value={<span className="mono">{detail.alert.rule_id}</span>} />
                <Meta label={t('alerts.ruleVersion')} value={`v${detail.alert.rule_version}`} />
                <Meta
                  label={t('alerts.windowStart')}
                  value={<span className="mono">{fmtDateTime(detail.alert.window_start)}</span>}
                />
                <Meta
                  label={t('alerts.windowEnd')}
                  value={<span className="mono">{fmtDateTime(detail.alert.window_end)}</span>}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="section-label" style={{ margin: 0 }}>
                  {t('alerts.evidenceTimeline', { events: t('common.eventCount', { count: evidence.length }) })}
                </div>
                {firstIp && (
                  <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onViewEvents(firstIp)}>
                    {t('alerts.viewRelated')} <IconArrowRight size={14} />
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
                      <span className="timeline-time">
                        <IconClock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                        {fmtDateTime(e.timestamp)}
                      </span>
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
            </>
          )}
        </section>
      </div>
    </>
  );
}
