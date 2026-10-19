import { useEffect, useState } from 'react';
import { api } from './api';

type Tab = 'overview' | 'events' | 'alerts' | 'rules' | 'sources';

export default function App() {
  const [tok, setTok] = useState<string | null>(localStorage.getItem('sx_token'));
  const [tab, setTab] = useState<Tab>('overview');
  const [email, setEmail] = useState('admin@sentinelx.local');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState('');

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const r = await api.login(email, password);
      localStorage.setItem('sx_token', r.token);
      setTok(r.token);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!tok) {
    return (
      <div className="wrap center">
        <div className="card login">
          <h1>SentinelX</h1>
          <p className="muted">Mini-SIEM · AI-assisted investigation (slice 1)</p>
          <form onSubmit={doLogin}>
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {err && <div className="error">{err}</div>}
            <button type="submit">Login</button>
          </form>
          <p className="muted small">Dev seed: admin@sentinelx.local / password123</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="topbar">
        <strong>SentinelX</strong>
        <nav>
          {(['overview', 'events', 'alerts', 'rules', 'sources'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <button
          className="ghost"
          onClick={() => {
            localStorage.removeItem('sx_token');
            setTok(null);
          }}
        >
          Logout
        </button>
      </header>
      {tab === 'overview' && <Overview />}
      {tab === 'events' && <Events />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'rules' && <Rules />}
      {tab === 'sources' && <Sources />}
    </div>
  );
}

function Overview() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.overview().then(setData).catch((e: any) => setErr(e.message));
  }, []);
  if (err) return <div className="error">{err}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="grid">
      <div className="card">
        <h3>Total events</h3>
        <div className="big">{data.total_events ?? 0}</div>
      </div>
      <div className="card">
        <h3>Alerts by severity</h3>
        <pre>{JSON.stringify(data.alerts_by_severity ?? {}, null, 2)}</pre>
      </div>
      <div className="card">
        <h3>Ingestion</h3>
        <pre>{JSON.stringify({ ingested: data.ingested, rejected: data.rejected }, null, 2)}</pre>
      </div>
      <div className="card">
        <h3>Sources</h3>
        <pre>{JSON.stringify(data.sources ?? [], null, 2)}</pre>
      </div>
      <div className="card">
        <h3>Top detection rules</h3>
        <pre>{JSON.stringify(data.alerts_by_rule ?? {}, null, 2)}</pre>
      </div>
      <div className="card">
        <h3>Active alerts</h3>
        <div className="big">{data.active_incidents ?? 0}</div>
        <p className="muted small">new + triaged + investigating</p>
      </div>
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [ip, setIp] = useState('');
  const [etype, setEtype] = useState('');
  const [username, setUsername] = useState('');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const limit = 10;

  async function load(off = offset) {
    setErr('');
    try {
      const params: Record<string, string> = { limit: String(limit), offset: String(off) };
      if (ip) params.src_ip = ip;
      if (etype) params.event_type = etype;
      if (username) params.username = username;
      const r = await api.events(params);
      setEvents(r.events ?? []);
      setTotal(r.total ?? 0);
      setOffset(off);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadMsg('');
    try {
      const r = await api.upload(f, 'source-demo-01');
      setUploadMsg(`Uploaded ${f.name}: ${r.accepted} accepted, ${r.rejected_parse + r.rejected_schema} rejected, ${r.alerts_fired} alerts`);
      load(0);
    } catch (err: any) {
      setUploadMsg('Upload failed: ' + err.message);
    }
    e.target.value = '';
  }

  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <div className="card">
      <h3>Event Explorer</h3>
      <div className="row">
        <input placeholder="src_ip, e.g. 192.0.2.10" value={ip} onChange={(e) => setIp(e.target.value)} />
        <input placeholder="event_type" value={etype} onChange={(e) => setEtype(e.target.value)} />
        <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button onClick={() => load(0)}>Search</button>
      </div>
      <div className="row">
        <label className="muted small">Upload .jsonl/.json (max 10MB)
          <input type="file" accept=".jsonl,.json" onChange={onUpload} />
        </label>
      </div>
      {uploadMsg && <p className="muted small">{uploadMsg}</p>}
      {err && <div className="error">{err}</div>}
      <table>
        <thead>
          <tr>
            <th>timestamp</th>
            <th>type</th>
            <th>src_ip</th>
            <th>user</th>
            <th>message</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e: any) => (
            <tr key={e.event_id}>
              <td className="mono">{e.timestamp}</td>
              <td>{e.event_type}</td>
              <td className="mono">{e.src_ip}</td>
              <td>{e.username}</td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={offset === 0} onClick={() => load(offset - limit)}>Prev</button>
        <span className="muted small">page {page}/{pages} · total {total}</span>
        <button disabled={offset + limit >= total} onClick={() => load(offset + limit)}>Next</button>
      </div>
      {events.length === 0 && <p className="muted">No events. Ingest a fixture or upload a file first.</p>}
    </div>
  );
}

function Rules() {
  const [rules, setRules] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.rules().then((r) => setRules(r.rules ?? [])).catch((e: any) => setErr(e.message));
  }, []);
  return (
    <div className="card">
      <h3>Detection Rules</h3>
      <p className="muted small">Read-only registry. Every rule has positive and negative test cases in `apps/api/*_test.go`.</p>
      {err && <div className="error">{err}</div>}
      {rules.map((r: any) => (
        <div key={r.rule_id} className="card" style={{ background: '#0e1830' }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <strong>{r.name}</strong>
            <span className={`sev ${r.severity}`}>{r.severity}</span>
            <span className="muted mono">v{r.version} · {r.enabled ? 'enabled' : 'disabled'}</span>
          </div>
          <p className="muted small">{r.description}</p>
          <pre>{JSON.stringify(r.config, null, 2)}</pre>
          <h4>Tests</h4>
          <ul className="small">
            {(r.test_cases ?? []).map((t: string, i: number) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Sources() {
  const [sources, setSources] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [stype, setStype] = useState('simulator');
  const [err, setErr] = useState('');
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
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.createSource(name, stype);
      setName('');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }
  return (
    <div className="card">
      <h3>Log Sources</h3>
      {err && <div className="error">{err}</div>}
      <table>
        <thead>
          <tr><th>id</th><th>name</th><th>type</th><th>status</th></tr>
        </thead>
        <tbody>
          {sources.map((s: any) => (
            <tr key={s.source_id}>
              <td className="mono">{s.source_id}</td>
              <td>{s.name}</td>
              <td>{s.source_type}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={create} className="row" style={{ marginTop: 12 }}>
        <input placeholder="new source name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="type" value={stype} onChange={(e) => setStype(e.target.value)} />
        <button type="submit">Add source</button>
      </form>
      <p className="muted small">Types: simulator, auth, web, api, host, cloud. Requires analyst/admin role.</p>
    </div>
  );
}

function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.alerts().then((r) => setAlerts(r.alerts ?? [])).catch((e: any) => setErr(e.message));
  }, []);
  async function open(id: string) {
    try {
      const r = await api.alertDetail(id);
      setSel(r);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  return (
    <div className="grid2">
      <div className="card">
        <h3>Alerts</h3>
        {err && <div className="error">{err}</div>}
        {alerts.map((a: any) => (
          <div key={a.alert_id} className="alertrow" onClick={() => open(a.alert_id)}>
            <span className={`sev ${a.severity}`}>{a.severity}</span>
            <span>{a.title}</span>
            <span className="mono muted">risk {a.risk_score}</span>
          </div>
        ))}
        {alerts.length === 0 && <p className="muted">No alerts yet.</p>}
      </div>
      <div className="card">
        <h3>Alert detail + evidence</h3>
        {!sel && <p className="muted">Select an alert.</p>}
        {sel && (
          <>
            <p><strong>{sel.alert.title}</strong></p>
            <p className="muted small">{sel.alert.reason}</p>
            <p className="mono small">rule {sel.alert.rule_id} v{sel.alert.rule_version}</p>
            <h4>Evidence ({sel.evidence?.length ?? 0})</h4>
            <table>
              <thead>
                <tr><th>timestamp</th><th>event</th><th>src_ip</th></tr>
              </thead>
              <tbody>
                {(sel.evidence ?? []).map((e: any) => (
                  <tr key={e.event_id}>
                    <td className="mono">{e.timestamp}</td>
                    <td>{e.event_type}</td>
                    <td className="mono">{e.src_ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
