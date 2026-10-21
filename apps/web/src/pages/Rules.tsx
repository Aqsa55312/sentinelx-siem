import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconList, IconSliders } from '../components/Icons';

type Props = { refreshKey: number };

export default function Rules({ refreshKey }: Props) {
  const [rules, setRules] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .rules()
      .then((r) => setRules(r.rules ?? []))
      .catch((e: any) => setErr(e.message));
  }, [refreshKey]);

  const enabled = rules.filter((r) => r.enabled).length;

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <span className="kpi-icon">
            <IconSliders size={17} />
          </span>
          <div>
            <div className="panel-title">Detection rule registry</div>
            <div className="panel-sub">
              Read-only in this slice · every rule ships with positive &amp; negative test cases in the API test suite
            </div>
          </div>
          <div className="panel-actions">
            <span className="chip">
              <b>{rules.length}</b> rules
            </span>
            <span className="chip">
              <b>{enabled}</b> enabled
            </span>
          </div>
        </div>
      </div>

      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      {rules.length === 0 && !err ? (
        <div className="panel">
          <div className="empty">
            <span className="empty-icon">
              <IconList size={20} />
            </span>
            <span className="empty-title">No rules loaded</span>
            <span className="small">The registry is served from the API at /api/v1/rules.</span>
          </div>
        </div>
      ) : (
        <div className="rule-grid">
          {rules.map((r: any) => {
            const config = (r.config ?? {}) as Record<string, any>;
            return (
              <article className="panel rule-card" key={r.rule_id}>
                <div className="rule-top">
                  <span className={`dot ${r.enabled ? 'ok' : 'off'}`} />
                  <span className="rule-id">{r.rule_id}</span>
                  <span className={`sev ${r.severity}`} style={{ marginLeft: 'auto' }}>
                    {r.severity}
                  </span>
                </div>

                <div>
                  <div className="rule-name">{r.name}</div>
                  <p className="muted small" style={{ marginTop: 6 }}>
                    {r.description}
                  </p>
                </div>

                <div className="chips">
                  <span className="chip">
                    <b>v{r.version}</b>
                  </span>
                  <span className={`chip`}>
                    <span className={`dot ${r.enabled ? 'ok' : 'off'}`} />
                    {r.enabled ? 'enabled' : 'disabled'}
                  </span>
                  {Object.entries(config).map(([k, v]) => (
                    <span className="chip" key={k} title={`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`}>
                      {k}: <b>{Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</b>
                    </span>
                  ))}
                </div>

                {(r.test_cases ?? []).length > 0 && (
                  <details>
                    <summary>Test cases ({r.test_cases.length})</summary>
                    <ul className="rule-tests">
                      {(r.test_cases ?? []).map((t: string, i: number) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
