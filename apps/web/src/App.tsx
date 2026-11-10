import { useEffect, useState } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Events from './pages/Events';
import Alerts from './pages/Alerts';
import Incidents from './pages/Incidents';
import Rules from './pages/Rules';
import Sources from './pages/Sources';
import LanguageSwitch from './components/LanguageSwitch';
import { useI18n, type TranslationKey } from './i18n';
import {
  IconActivity,
  IconBell,
  IconCase,
  IconDatabase,
  IconGrid,
  IconList,
  IconLogout,
  IconRefresh,
  IconShield,
  IconSliders,
} from './components/Icons';

type Tab = 'overview' | 'events' | 'alerts' | 'incidents' | 'rules' | 'sources';

type Session = { token: string; role: string; email: string };

const TABS: { id: Tab; labelKey: TranslationKey; icon: React.ReactNode }[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: <IconGrid size={17} /> },
  { id: 'events', labelKey: 'nav.events', icon: <IconList size={17} /> },
  { id: 'alerts', labelKey: 'nav.alerts', icon: <IconBell size={17} /> },
  { id: 'incidents', labelKey: 'nav.incidents', icon: <IconCase size={17} /> },
  { id: 'rules', labelKey: 'nav.rules', icon: <IconSliders size={17} /> },
  { id: 'sources', labelKey: 'nav.sources', icon: <IconDatabase size={17} /> },
];

const PAGE_META: Record<Tab, { eyebrow: TranslationKey; title: TranslationKey; sub: TranslationKey }> = {
  overview: {
    eyebrow: 'meta.overview.eyebrow',
    title: 'meta.overview.title',
    sub: 'meta.overview.sub',
  },
  events: {
    eyebrow: 'meta.events.eyebrow',
    title: 'meta.events.title',
    sub: 'meta.events.sub',
  },
  alerts: {
    eyebrow: 'meta.alerts.eyebrow',
    title: 'meta.alerts.title',
    sub: 'meta.alerts.sub',
  },
  incidents: {
    eyebrow: 'meta.incidents.eyebrow',
    title: 'meta.incidents.title',
    sub: 'meta.incidents.sub',
  },
  rules: {
    eyebrow: 'meta.rules.eyebrow',
    title: 'meta.rules.title',
    sub: 'meta.rules.sub',
  },
  sources: {
    eyebrow: 'meta.sources.eyebrow',
    title: 'meta.sources.title',
    sub: 'meta.sources.sub',
  },
};

function loadSession(): Session | null {
  const token = localStorage.getItem('sx_token');
  if (!token) return null;
  return {
    token,
    role: localStorage.getItem('sx_role') ?? 'analyst',
    email: localStorage.getItem('sx_email') ?? 'user@sentinelx.local',
  };
}

// Deep links are handy for demos and screenshots: /?tab=incidents.
function tabFromLocation(): Tab {
  const wanted = new URLSearchParams(window.location.search).get('tab') ?? window.location.hash.replace('#', '');
  const found = TABS.find((t) => t.id === wanted);
  return found ? found.id : 'overview';
}

export default function App() {
  const { t, roleLabel } = useI18n();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [tab, setTab] = useState<Tab>(() => tabFromLocation());
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<{ alerts: number; events: number; incidents: number }>({
    alerts: 0,
    events: 0,
    incidents: 0,
  });
  const [alertFocus, setAlertFocus] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('alert'),
  );
  const [incidentFocus, setIncidentFocus] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('incident'),
  );
  const [eventPreset, setEventPreset] = useState<{ src_ip?: string; event_type?: string; key: number } | undefined>();

  useEffect(() => {
    if (!session) return;
    api
      .overview()
      .then((ov) =>
        setCounts({
          alerts: ov.total_alerts ?? 0,
          events: ov.total_events ?? 0,
          incidents: ov.active_incidents ?? 0,
        }),
      )
      .catch(() => undefined);
  }, [session, refreshKey]);

  function onLogin(token: string, role: string, email: string) {
    localStorage.setItem('sx_token', token);
    localStorage.setItem('sx_role', role);
    localStorage.setItem('sx_email', email);
    setSession({ token, role, email });
    setTab('overview');
    setRefreshKey((k) => k + 1);
  }

  function logout() {
    localStorage.removeItem('sx_token');
    localStorage.removeItem('sx_role');
    localStorage.removeItem('sx_email');
    setSession(null);
    setAlertFocus(null);
    setIncidentFocus(null);
    setEventPreset(undefined);
  }

  if (!session) return <Login onLogin={onLogin} />;

  const meta = PAGE_META[tab];
  const initials = session.email.slice(0, 2).toUpperCase();

  function openAlert(id: string) {
    setAlertFocus(id);
    setTab('alerts');
  }

  function goTab(id: Tab) {
    if (id === 'alerts') setAlertFocus(null);
    if (id === 'incidents') setIncidentFocus(null);
    setTab(id);
  }

  function openIncident(id: string) {
    setIncidentFocus(id);
    setTab('incidents');
  }

  function viewEvents(srcIp: string) {
    setEventPreset({ src_ip: srcIp, key: Date.now() });
    setTab('events');
  }

  const canWrite = session.role === 'admin' || session.role === 'analyst';
  const canRespond = canWrite || session.role === 'responder';
  const canApprove = session.role === 'admin' || session.role === 'responder';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <IconShield size={20} />
          </span>
          <div>
            <div className="brand-name">
              Sentinel<span>X</span>
            </div>
            <div className="brand-sub">{t('brand.sub')}</div>
          </div>
        </div>

        <nav className="nav" aria-label={t('nav.main')}>
          <div className="nav-label">{t('nav.workspace')}</div>
          {TABS.map((item, index) => {
            const label = t(item.labelKey);
            return (
              <button
                key={item.id}
                className={`nav-item ${tab === item.id ? 'active' : ''}`}
                onClick={() => goTab(item.id)}
                title={label}
                aria-label={label}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{label}</span>
                <span className="nav-index">{String(index + 1).padStart(2, '0')}</span>
                {item.id === 'alerts' && counts.alerts > 0 && <span className="nav-count">{counts.alerts}</span>}
                {item.id === 'incidents' && counts.incidents > 0 && (
                  <span className="nav-count">{counts.incidents}</span>
                )}
                {item.id === 'events' && counts.events > 0 && <span className="nav-count">{counts.events}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="status-beacon" /> {t('nav.localStatus')}
          </div>
          <div className="user-line">
            <span className="avatar">{initials}</span>
            <div className="user-meta">
              <div className="user-name">{session.email.split('@')[0]}</div>
              <div className="user-role">{roleLabel(session.role)}</div>
            </div>
            <button
              className="btn ghost icon-only"
              onClick={logout}
              title={t('nav.signOut')}
              aria-label={t('nav.signOut')}
            >
              <IconLogout size={16} />
            </button>
          </div>
          <div className="build-stamp">{t('nav.build')}</div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          <div className="workspace-rail" aria-hidden="true">
            <span>SX / SecOps</span>
            <span className="rail-line" />
            <span>{t('nav.railWorkspace')}</span>
            <span>{t('nav.railBuild')}</span>
          </div>

          <header className="topbar">
            <div>
              <div className="page-eyebrow">
                <IconActivity size={13} /> {t(meta.eyebrow)}
              </div>
              <h1 className="page-title">{t(meta.title)}</h1>
              <p className="page-sub">{t(meta.sub)}</p>
            </div>
            <div className="topbar-actions">
              <LanguageSwitch />
              <span className="live-pill">
                <span className="live-dot" /> {t('common.live')}
              </span>
              <button className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
                <IconRefresh size={15} /> {t('common.refresh')}
              </button>
            </div>
          </header>

          {tab === 'overview' && (
            <Overview
              refreshKey={refreshKey}
              onOpenAlert={openAlert}
              onOpenIncident={openIncident}
              onViewAllAlerts={() => {
                setAlertFocus(null);
                setTab('alerts');
              }}
              onViewAllIncidents={() => {
                setIncidentFocus(null);
                setTab('incidents');
              }}
            />
          )}
          {tab === 'events' && <Events refreshKey={refreshKey} preset={eventPreset} />}
          {tab === 'alerts' && (
            <Alerts
              refreshKey={refreshKey}
              focusId={alertFocus}
              canWrite={canWrite}
              onViewEvents={viewEvents}
              onOpenIncident={openIncident}
            />
          )}
          {tab === 'incidents' && (
            <Incidents
              refreshKey={refreshKey}
              focusId={incidentFocus}
              canWrite={canWrite}
              canRespond={canRespond}
              canApprove={canApprove}
              onOpenAlert={openAlert}
              onViewEvents={viewEvents}
            />
          )}
          {tab === 'rules' && <Rules refreshKey={refreshKey} />}
          {tab === 'sources' && <Sources refreshKey={refreshKey} />}
        </div>
      </main>
    </div>
  );
}
