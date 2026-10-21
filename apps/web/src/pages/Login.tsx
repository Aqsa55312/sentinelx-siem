import { useState } from 'react';
import { api } from '../api';
import { IconActivity, IconCheck, IconShield } from '../components/Icons';

type Props = {
  onLogin: (token: string, role: string, email: string) => void;
};

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@sentinelx.local' },
  { role: 'Analyst', email: 'analyst@sentinelx.local' },
  { role: 'Viewer', email: 'viewer@sentinelx.local' },
];

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@sentinelx.local');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.login(email, password);
      onLogin(r.token, r.role, email);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark">
              <IconShield size={20} />
            </span>
            <div>
              <div className="brand-name">SentinelX</div>
              <div className="brand-sub">Security Operations</div>
            </div>
          </div>

          <div>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>
              <IconActivity size={14} /> Mini-SIEM · AI-assisted
            </div>
            <div className="login-tagline">Detect. Investigate. Respond.</div>
            <p className="login-copy" style={{ marginTop: 10 }}>
              Turn raw security logs into explainable alerts, evidence-backed investigations, and controlled response actions.
            </p>
          </div>

          <div className="login-points">
            {[
              'Rule-based detection with per-alert evidence',
              'Tenant isolation and role-based access control',
              'Auditable actions — every alert traces to source events',
            ].map((t) => (
              <div className="login-point" key={t}>
                <IconCheck size={16} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>Sign in to console</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Use a seeded demo account to explore the workspace.
            </p>
          </div>

          <label className="field">
            <span>Email</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {err && <div className="error-box">{err}</div>}

          <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', padding: '11px 14px' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="login-sep">demo accounts</div>

          <div className="chips">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                type="button"
                key={a.email}
                className="chip"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setEmail(a.email);
                  setPassword('password123');
                }}
              >
                <b>{a.role}</b> · {a.email.split('@')[0]}
              </button>
            ))}
          </div>

          <p className="login-hint">
            Password for all demo accounts: <code>password123</code>. Dev seed only — never reuse in a shared deployment.
          </p>
        </form>
      </div>
    </div>
  );
}
