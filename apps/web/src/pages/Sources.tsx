import { useEffect, useState } from 'react';
import { api } from '../api';
import { titleCase } from '../lib/format';
import { useI18n } from '../i18n';
import { IconDatabase, IconPlus } from '../components/Icons';

type Props = { refreshKey: number };

const SOURCE_TYPES = ['simulator', 'auth', 'web', 'api', 'host', 'cloud'];

export default function Sources({ refreshKey }: Props) {
  const { t, fmtDateTime, sourceStatusLabel } = useI18n();
  const [sources, setSources] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [stype, setStype] = useState('simulator');
  const [criticality, setCriticality] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const r = await api.sources();
      setSources(r.sources ?? []);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setNotice('');
    setBusy(true);
    try {
      await api.createSource(name, stype, criticality);
      setNotice(t('sources.registered', { name }));
      setName('');
      setCriticality(50);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const healthy = sources.filter((s) => s.status === 'healthy').length;

  return (
    <div className="grid-12">
      <section className="panel span-8">
        <div className="panel-head">
          <span className="kpi-icon">
            <IconDatabase size={17} />
          </span>
          <div>
            <div className="panel-title">{t('sources.title')}</div>
            <div className="panel-sub">
              {t('sources.sub', {
                sources: t('common.sourceCount', { count: sources.length }),
                healthy,
              })}
            </div>
          </div>
        </div>

        {err && <div className="error-box" style={{ marginBottom: 10 }}>{err}</div>}
        {notice && <div className="notice" style={{ marginBottom: 10 }}>{notice}</div>}

        {sources.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <IconDatabase size={20} />
            </span>
            <span className="empty-title">{t('sources.emptyTitle')}</span>
            <span className="small">{t('sources.emptyText')}</span>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('sources.source')}</th>
                  <th>{t('sources.id')}</th>
                  <th>{t('sources.type')}</th>
                  <th>{t('sources.status')}</th>
                  <th>{t('sources.criticality')}</th>
                  <th>{t('sources.created')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s: any) => (
                  <tr key={s.source_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`dot ${s.status === 'healthy' ? 'ok' : 'off'}`} />
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                      </div>
                    </td>
                    <td className="mono">{s.source_id}</td>
                    <td>
                      <span className="chip">{titleCase(s.source_type)}</span>
                    </td>
                    <td>
                      <span className={`sev ${s.status === 'healthy' ? 'low' : 'info'}`}>
                        {sourceStatusLabel(s.status)}
                      </span>
                    </td>
                    <td>
                      <div className="crit-cell">
                        <span className="crit-track">
                          <span
                            className={`crit-fill ${(s.criticality ?? 50) >= 80 ? 'critical' : (s.criticality ?? 50) >= 60 ? 'high' : 'medium'}`}
                            style={{ width: `${Math.max(3, s.criticality ?? 50)}%` }}
                          />
                        </span>
                        <span className="mono">{s.criticality ?? 50}</span>
                      </div>
                    </td>
                    <td className="muted small nowrap">{s.created_at ? fmtDateTime(s.created_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel span-4">
        <div className="panel-head">
          <div>
            <div className="panel-title">{t('sources.register')}</div>
            <div className="panel-sub">{t('sources.registerSub')}</div>
          </div>
        </div>

        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span>{t('sources.name')}</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sources.namePlaceholder')}
              required
            />
          </label>

          <label className="field">
            <span>{t('sources.type')}</span>
            <select className="select" value={stype} onChange={(e) => setStype(e.target.value)}>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t('sources.criticalityLabel', { value: criticality })}</span>
            <input
              className="input"
              type="range"
              min={0}
              max={100}
              step={5}
              value={criticality}
              onChange={(e) => setCriticality(Number(e.target.value))}
            />
            <span className="muted tiny">{t('sources.criticalityHelp')}</span>
          </label>

          <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
            <IconPlus size={15} />
            {busy ? t('sources.adding') : t('sources.add')}
          </button>
        </form>

        <div className="section-label">{t('sources.notes')}</div>
        <p className="muted tiny" style={{ lineHeight: 1.7 }}>
          {t('sources.notesTextA')} <span className="mono">source-demo-01</span> {t('sources.notesTextB')}
        </p>
      </section>
    </div>
  );
}
