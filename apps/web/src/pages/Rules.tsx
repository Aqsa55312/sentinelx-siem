import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { IconList, IconSliders } from '../components/Icons';

type Props = { refreshKey: number };

export default function Rules({ refreshKey }: Props) {
  const { t, severityLabel } = useI18n();
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
            <div className="panel-title">{t('rules.title')}</div>
            <div className="panel-sub">{t('rules.sub')}</div>
          </div>
          <div className="panel-actions">
            <span className="chip">{t('rules.count', { count: rules.length })}</span>
            <span className="chip">{t('rules.enabledCount', { count: enabled })}</span>
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
            <span className="empty-title">{t('rules.emptyTitle')}</span>
            <span className="small">{t('rules.emptyText')}</span>
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
                    {severityLabel(r.severity)}
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
                    {r.enabled ? t('rules.enabled') : t('rules.disabled')}
                  </span>
                  {Object.entries(config).map(([k, v]) => (
                    <span className="chip" key={k} title={`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`}>
                      {k}: <b>{Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</b>
                    </span>
                  ))}
                </div>

                {(r.test_cases ?? []).length > 0 && (
                  <details>
                    <summary>{t('rules.testCases', { count: r.test_cases.length })}</summary>
                    <ul className="rule-tests">
                      {(r.test_cases ?? []).map((testCase: string, i: number) => (
                        <li key={i}>{testCase}</li>
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
