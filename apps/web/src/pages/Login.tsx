import { useState } from 'react';
import { api } from '../api';
import LoginBackdrop from '../components/LoginBackdrop';
import LanguageSwitch from '../components/LanguageSwitch';
import { useI18n } from '../i18n';
import { IconActivity, IconShield } from '../components/Icons';

type Props = {
  onLogin: (token: string, role: string, email: string) => void;
};

const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'admin@sentinelx.local' },
  { role: 'analyst', email: 'analyst@sentinelx.local' },
  { role: 'viewer', email: 'viewer@sentinelx.local' },
];

export default function Login({ onLogin }: Props) {
  const { t, roleLabel } = useI18n();
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
                <div className="brand-sub">{t('brand.sub')}</div>
              </div>
            </div>
            <div className="login-top-actions">
              <LanguageSwitch compact />
              <span className="login-index">{t('login.index')}</span>
            </div>
          </div>

          <div className="login-hero">
            <div className="page-eyebrow">
              <IconActivity size={12} /> {t('login.eyebrow')}
            </div>
            <h1 className="login-tagline">
              {t('login.tagline1')}
              <br />
              <em>{t('login.tagline2')}</em>
            </h1>
            <p className="login-copy">{t('login.copy')}</p>
          </div>

          <div className="login-points">
            {[t('login.point1'), t('login.point2'), t('login.point3')].map((point, index) => (
              <div className="login-point" key={point}>
                <span className="point-index">{String(index + 1).padStart(2, '0')}</span>
                <span>{point}</span>
              </div>
            ))}
          </div>

          <div className="login-meta">
            <span>{t('login.localBuild')}</span>
            <span>{t('login.tenantIsolated')}</span>
          </div>
        </section>

        <form className="login-form" onSubmit={submit}>
          <div className="login-form-head">
            <div className="page-eyebrow">{t('login.consoleAccess')}</div>
            <h2>{t('login.title')}</h2>
            <p className="muted small">{t('login.sub')}</p>
          </div>

          <label className="field">
            <span>{t('login.email')}</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>

          <label className="field">
            <span>{t('login.password')}</span>
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
            <span>{busy ? t('login.submitting') : t('login.submit')}</span>
            <span aria-hidden="true">→</span>
          </button>

          <div className="login-demo">
            <div className="login-sep">{t('login.demoAccounts')}</div>
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
                    <b>{roleLabel(a.role)}</b>
                    <small>{a.email}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="login-hint">
            {t('login.hintLabel')} <code>password123</code>. {t('login.hintNote')}
          </p>
        </form>
      </div>
    </div>
  );
}
