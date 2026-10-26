import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { riskTone, SEVERITIES, titleCase } from '../lib/format';
import { useI18n } from '../i18n';
import { IconActivity, IconAlert, IconArrowRight, IconBell, IconCase, IconDatabase, IconList } from '../components/Icons';

type Props = {
  refreshKey: number;
  onOpenAlert: (id: string) => void;
  onOpenIncident: (id: string) => void;
  onViewAllAlerts: () => void;
  onViewAllIncidents: () => void;
};

const DAYS = 7;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Overview({ refreshKey, onOpenAlert, onOpenIncident, onViewAllAlerts, onViewAllIncidents }: Props) {
  const { t, locale, statusLabel, severityLabel, timeAgo } = useI18n();
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setErr('');
    Promise.all([api.overview(), api.alerts(), api.incidents()])
      .then(([ov, al, inc]) => {
        if (!alive) return;
        setData(ov);
        setAlerts(al.alerts ?? []);
        setIncidents(inc.incidents ?? []);
      })
      .catch((e: any) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const trend = useMemo(() => {
    const days: { key: string; label: string; counts: Record<string, number>; total: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: dayKey(d),
        label: d.toLocaleDateString(locale, { weekday: 'short' }),
        counts: { critical: 0, high: 0, medium: 0, low: 0 },
        total: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const a of alerts) {
      const k = dayKey(new Date(a.created_at));
      const bucket = byKey.get(k);
      if (!bucket) continue;
      const sev = (a.severity ?? 'low') as string;
      bucket.counts[sev] = (bucket.counts[sev] ?? 0) + 1;
      bucket.total += 1;
    }
    return days;
  }, [alerts, locale]);

  const maxTrend = Math.max(1, ...trend.map((d) => d.total));
  const bySeverity = data?.alerts_by_severity ?? {};
  const maxSev = Math.max(1, ...SEVERITIES.map((s) => bySeverity[s] ?? 0));
  const byRule = (data?.alerts_by_rule ?? {}) as Record<string, number>;
  const ruleEntries = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  const maxRule = Math.max(1, ...ruleEntries.map(([, n]) => n));
  const sources: any[] = data?.sources ?? [];
  const healthy = sources.filter((s) => s.status === 'healthy').length;
  const recent = alerts.slice(0, 5);
  const incidentQueue = incidents
    .filter((i) => ['new', 'triaged', 'investigating', 'contained'].includes(i.status))
    .slice(0, 4);

  if (err) {
    return (
      <div className="panel">
        <div className="error-box">{err}</div>
      </div>
    );
  }

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          icon={<IconActivity size={17} />}
          label={t('overview.kpi.events')}
          value={data ? data.total_events : '—'}
          foot={t('overview.kpi.eventsFoot')}
        />
        <Kpi
          icon={<IconBell size={17} />}
          label={t('overview.kpi.alerts')}
          value={data ? data.total_alerts ?? alerts.length : '—'}
          foot={t('overview.kpi.alertsFoot')}
        />
        <Kpi
          icon={<IconAlert size={17} />}
          label={t('overview.kpi.incidents')}
          value={data ? data.active_incidents : '—'}
          foot={data ? t('common.activeAlertCount', { count: data.active_alerts ?? 0 }) : '—'}
        />
        <Kpi
          icon={<IconDatabase size={17} />}
          label={t('overview.kpi.sources')}
          value={data ? sources.length : '—'}
          foot={data ? t('common.healthySources', { healthy, total: sources.length }) : '—'}
        />
      </div>

      <div className="grid-12">
        <section className="panel span-8">
          <div className="panel-head">
            <div>
              <div className="panel-title">{t('overview.alertVolume')}</div>
              <div className="panel-sub">{t('overview.alertVolumeSub', { days: DAYS })}</div>
            </div>
            <div className="panel-actions">
              <span className="chip">{t('common.alertCount', { count: alerts.length })}</span>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="trend-empty">{t('overview.alertVolumeEmpty')}</div>
          ) : (
            <div className="trend">
              {trend.map((d) => (
                <div
                  className="trend-col"
                  key={d.key}
                  title={`${d.key}: ${t('common.alertCount', { count: d.total })}`}
                >
                  <div className="trend-stack">
                    {[...SEVERITIES].reverse().map((sev) => {
                      const c = d.counts[sev] ?? 0;
                      if (!c) return null;
                      return (
                        <div
                          key={sev}
                          className={`trend-bar ${sev}`}
                          style={{ height: `${Math.max(4, (c / maxTrend) * 100)}%` }}
                        />
                      );
                    })}
                  </div>
                  <span className="trend-day">{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel span-4">
          <div className="panel-head">
            <div>
              <div className="panel-title">{t('overview.severitySplit')}</div>
              <div className="panel-sub">{t('overview.severitySplitSub')}</div>
            </div>
          </div>
          <div className="bars">
            {SEVERITIES.map((sev) => {
              const n = bySeverity[sev] ?? 0;
              return (
                <div className="bar-row" key={sev}>
                  <span className="bar-name">{severityLabel(sev)}</span>
                  <span className="bar-track">
                    <span className={`bar-fill ${sev}`} style={{ width: `${(n / maxSev) * 100}%` }} />
                  </span>
                  <span className="bar-count">{n}</span>
                </div>
              );
            })}
          </div>
          <div className="section-label" style={{ marginBottom: 0 }}>
            {t('overview.riskModel')}
          </div>
          <p className="muted tiny" style={{ marginTop: 6 }}>
            {t('overview.riskModelText')}
          </p>
        </section>

        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <div className="panel-title">{t('overview.recent')}</div>
              <div className="panel-sub">{t('overview.recentSub')}</div>
            </div>
            <div className="panel-actions">
              <button className="btn ghost sm" onClick={onViewAllAlerts}>
                {t('common.viewAll')}
              </button>
            </div>
          </div>

          {recent.length === 0 ? (
            <EmptyState title={t('overview.noAlerts')} text={t('overview.noAlertsText')} />
          ) : (
            <div className="feed">
              {recent.map((a) => {
                const tone = riskTone(a.risk_score ?? 0);
                return (
                  <button className="feed-item" key={a.alert_id} onClick={() => onOpenAlert(a.alert_id)}>
                    <span className={`dot ${a.severity}`} style={{ marginTop: 6 }} />
                    <span className="feed-main">
                      <span className="feed-title">{a.title}</span>
                      <span className="feed-meta">
                        <span className={`sev ${a.severity}`}>{severityLabel(a.severity)}</span>
                        <span className="mono">{a.rule_id}</span>
                        <span>·</span>
                        <span>{timeAgo(a.created_at)}</span>
                      </span>
                    </span>
                    <span className="feed-right">
                      <span className={`risk-pill ${tone}`}>
                        {t('common.risk')} {a.risk_score}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel span-5">
          <div className="panel-head">
            <div>
              <div className="panel-title">{t('overview.topRules')}</div>
              <div className="panel-sub">{t('overview.topRulesSub')}</div>
            </div>
          </div>

          {ruleEntries.length === 0 ? (
            <EmptyState title={t('overview.noRuleActivity')} text={t('overview.noRuleActivityText')} />
          ) : (
            <div className="bars">
              {ruleEntries.map(([rule, n]) => (
                <div className="bar-row" key={rule}>
                  <span className="bar-name mono" style={{ fontSize: 11 }}>
                    {rule.replace('rule-', '')}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill accent" style={{ width: `${(n / maxRule) * 100}%` }} />
                  </span>
                  <span className="bar-count">{n}</span>
                </div>
              ))}
            </div>
          )}

          <div className="section-label">{t('nav.sources')}</div>
          {sources.length === 0 ? (
            <p className="muted small">{t('overview.noSources')}</p>
          ) : (
            sources.slice(0, 5).map((s) => (
              <div className="source-row" key={s.source_id}>
                <span className={`dot ${s.status === 'healthy' ? 'ok' : 'off'}`} />
                <div>
                  <div className="source-name">{s.name}</div>
                  <div className="muted tiny mono">{s.source_id}</div>
                </div>
                <span className="chip source-type">{titleCase(s.source_type)}</span>
              </div>
            ))
          )}
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <div>
              <div className="panel-title">{t('overview.incidentQueue')}</div>
              <div className="panel-sub">{t('overview.incidentQueueSub')}</div>
            </div>
            <div className="panel-actions">
              <span className="chip">{t('overview.totalCount', { count: incidents.length })}</span>
              <button className="btn ghost sm" onClick={onViewAllIncidents}>
                {t('common.viewAll')}
              </button>
            </div>
          </div>

          {incidentQueue.length === 0 ? (
            <EmptyState title={t('overview.noIncidents')} text={t('overview.noIncidentsText')} />
          ) : (
            <div className="incident-queue">
              {incidentQueue.map((i) => (
                <button className="queue-row" key={i.incident_id} onClick={() => onOpenIncident(i.incident_id)}>
                  <span className={`dot ${i.severity}`} style={{ marginTop: 6 }} />
                  <span className="queue-main">
                    <span className="queue-title">{i.title}</span>
                    <span className="queue-meta">
                      <span className={`status-tag ${i.status}`}>{statusLabel(i.status)}</span>
                      <span>{t('common.alertCount', { count: i.alert_count })}</span>
                      <span>·</span>
                      <span>{timeAgo(i.updated_at)}</span>
                    </span>
                  </span>
                  <span className="queue-side">
                    <span className={`risk-pill ${riskTone(i.risk_score ?? 0)}`}>
                      {t('common.risk')} {i.risk_score}
                    </span>
                    <IconArrowRight size={15} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon">{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <IconList size={20} />
      </span>
      <span className="empty-title">{title}</span>
      <span className="small">{text}</span>
    </div>
  );
}
