import { useState } from 'react';
import { api } from '../api';
import LoginBackdrop from '../components/LoginBackdrop';
import { IconActivity, IconShield } from '../components/Icons';

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
        <section className="login-brand">
          <LoginBackdrop />

          <div className="login-brand-top">
            <div className="brand">
              <span className="brand-mark">
                <IconShield size={19} />
              </span>
              <div>
                <div className="brand-name">
                  Sentinel<span>X</span>
                </div>
                <div className="brand-sub">Operations desk</div>
              </div>
            </div>
            <span className="login-index">SX / 001</span>
          </div>

          <div className="login-hero">
            <div className="page-eyebrow">
              <IconActivity size={12} /> Mini-SIEM / rule-based detection
            </div>
            <h1 className="login-tagline">
              See the signal.
              <br />
              <em>Trace the evidence.</em>
            </h1>
            <p className="login-copy">
              Turn raw security logs into explainable alerts, evidence-backed investigations, and controlled response
              actions.
            </p>
          </div>

          <div className="login-points">
            {[
              'Rule-based detection with per-alert evidence',
              'Tenant isolation and role-based access control',
              'Auditable actions — every alert traces to source events',
            ].map((t, index) => (
              <div className="login-point" key={t}>
                <span className="point-index">{String(index + 1).padStart(2, '0')}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          <div className="login-meta">
            <span>local build · v0.4.2</span>
            <span>tenant-isolated</span>
          </div>
        </section>

        <form className="login-form" onSubmit={submit}>
          <div className="login-form-head">
            <div className="page-eyebrow">Console access</div>
            <h2>Sign in</h2>
            <p className="muted small">Use a seeded demo account to explore the workspace.</p>
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

          <button className="btn primary login-submit" type="submit" disabled={busy}>
            <span>{busy ? 'Signing in…' : 'Sign in'}</span>
            <span aria-hidden="true">→</span>
          </button>

          <div className="login-demo">
            <div className="login-sep">demo accounts</div>
            <div className="login-accounts">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  type="button"
                  key={a.email}
                  className="demo-account"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword('password123');
                  }}
                >
                  <span>
                    <b>{a.role}</b>
                    <small>{a.email}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="login-hint">
            Password for all demo accounts: <code>password123</code>. Dev seed only — never reuse in a shared deployment.
          </p>
        </form>
      </div>
    </div>
  );
}
