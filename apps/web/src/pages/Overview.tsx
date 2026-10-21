import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { riskTone, SEVERITIES, timeAgo, titleCase } from '../lib/format';
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
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
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
  }, [alerts]);

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
          label="Total events"
          value={data ? data.total_events : '—'}
          foot="Normalized and searchable"
          glow="rgba(91,147,255,.18)"
        />
        <Kpi
          icon={<IconBell size={17} />}
          label="Total alerts"
          value={data ? data.total_alerts ?? alerts.length : '—'}
          foot="Rule detections, all severities"
          glow="rgba(251,146,60,.16)"
        />
        <Kpi
          icon={<IconAlert size={17} />}
          label="Active incidents"
          value={data ? data.active_incidents : '—'}
          foot={data ? `${data.active_alerts ?? 0} active alerts` : '—'}
          glow="rgba(251,77,109,.16)"
        />
        <Kpi
          icon={<IconDatabase size={17} />}
          label="Log sources"
          value={data ? sources.length : '—'}
          foot={data ? `${healthy}/${sources.length} healthy` : '—'}
          glow="rgba(52,211,153,.15)"
        />
      </div>

      <div className="grid-12">
        <section className="panel span-8">
          <div className="panel-head">
            <div>
              <div className="panel-title">Alert volume</div>
              <div className="panel-sub">Detections per day, stacked by severity (last {DAYS} days)</div>
            </div>
            <div className="panel-actions">
              <span className="chip">
                <b>{alerts.length}</b> alerts
              </span>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="trend-empty">No detections yet. Upload a scenario from Event Explorer.</div>
          ) : (
            <div className="trend">
              {trend.map((d) => (
                <div className="trend-col" key={d.key} title={`${d.key}: ${d.total} alerts`}>
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
              <div className="panel-title">Severity split</div>
              <div className="panel-sub">All stored alerts</div>
            </div>
          </div>
          <div className="bars">
            {SEVERITIES.map((sev) => {
              const n = bySeverity[sev] ?? 0;
              return (
                <div className="bar-row" key={sev}>
                  <span className="bar-name">{sev}</span>
                  <span className="bar-track">
                    <span className={`bar-fill ${sev}`} style={{ width: `${(n / maxSev) * 100}%` }} />
                  </span>
                  <span className="bar-count">{n}</span>
                </div>
              );
            })}
          </div>
          <div className="section-label" style={{ marginBottom: 0 }}>
            Risk model
          </div>
          <p className="muted tiny" style={{ marginTop: 6 }}>
            R = min(100, 0.4S + 0.3C + 0.2A + 0.1B). Asset criticality A comes from the source registry (default 50).
            Prototype weights — not a probability of compromise.
          </p>
        </section>

        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <div className="panel-title">Recent detections</div>
              <div className="panel-sub">Newest first — click to open evidence</div>
            </div>
            <div className="panel-actions">
              <button className="btn ghost sm" onClick={onViewAllAlerts}>
                View all
              </button>
            </div>
          </div>

          {recent.length === 0 ? (
            <EmptyState title="No alerts yet" text="Run a simulator fixture to generate detections." />
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
                        <span className={`sev ${a.severity}`}>{a.severity}</span>
                        <span className="mono">{a.rule_id}</span>
                        <span>·</span>
                        <span>{timeAgo(a.created_at)}</span>
                      </span>
                    </span>
                    <span className="feed-right">
                      <span className={`risk-pill ${tone}`}>risk {a.risk_score}</span>
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
              <div className="panel-title">Top detection rules</div>
              <div className="panel-sub">Alerts produced per rule</div>
            </div>
          </div>

          {ruleEntries.length === 0 ? (
            <EmptyState title="No rule activity" text="Rule hits will appear here." />
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

          <div className="section-label">Log sources</div>
          {sources.length === 0 ? (
            <p className="muted small">No sources registered.</p>
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
              <div className="panel-title">Incident queue</div>
              <div className="panel-sub">Correlated cases ordered by last activity</div>
            </div>
            <div className="panel-actions">
              <span className="chip">
                <b>{incidents.length}</b> total
              </span>
              <button className="btn ghost sm" onClick={onViewAllIncidents}>
                View all
              </button>
            </div>
          </div>

          {incidentQueue.length === 0 ? (
            <EmptyState
              title="No active incidents"
              text="Alerts sharing an IP or username inside 24h are grouped automatically after ingestion."
            />
          ) : (
            <div className="incident-queue">
              {incidentQueue.map((i) => (
                <button className="queue-row" key={i.incident_id} onClick={() => onOpenIncident(i.incident_id)}>
                  <span className={`dot ${i.severity}`} style={{ marginTop: 6 }} />
                  <span className="queue-main">
                    <span className="queue-title">{i.title}</span>
                    <span className="queue-meta">
                      <span className={`status-tag ${i.status}`}>{titleCase(i.status)}</span>
                      <span>{i.alert_count} alert{i.alert_count === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{timeAgo(i.updated_at)}</span>
                    </span>
                  </span>
                  <span className="queue-side">
                    <span className={`risk-pill ${riskTone(i.risk_score ?? 0)}`}>risk {i.risk_score}</span>
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
  glow,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot: string;
  glow: string;
}) {
  return (
    <div className="kpi" style={{ '--glow': glow } as React.CSSProperties}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-label">{label}</span>
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
