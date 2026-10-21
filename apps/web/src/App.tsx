import { useEffect, useState } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Events from './pages/Events';
import Alerts from './pages/Alerts';
import Incidents from './pages/Incidents';
import Rules from './pages/Rules';
import Sources from './pages/Sources';
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

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <IconGrid size={17} /> },
  { id: 'events', label: 'Event Explorer', icon: <IconList size={17} /> },
  { id: 'alerts', label: 'Alerts', icon: <IconBell size={17} /> },
  { id: 'incidents', label: 'Incidents', icon: <IconCase size={17} /> },
  { id: 'rules', label: 'Detection Rules', icon: <IconSliders size={17} /> },
  { id: 'sources', label: 'Log Sources', icon: <IconDatabase size={17} /> },
];

const PAGE_META: Record<Tab, { eyebrow: string; title: string; sub: string }> = {
  overview: {
    eyebrow: 'Security posture',
    title: 'Overview',
    sub: 'Live view of ingestion, detections, and source health across your workspace.',
  },
  events: {
    eyebrow: 'Telemetry',
    title: 'Event Explorer',
    sub: 'Search normalized events, pivot on indicators, and upload log batches for detection.',
  },
  alerts: {
    eyebrow: 'Detection',
    title: 'Alerts',
    sub: 'Every detection carries its rule version, risk reasoning, and the events that triggered it.',
  },
  incidents: {
    eyebrow: 'Response',
    title: 'Incidents',
    sub: 'Correlated detections, investigation notes, and an audit-logged status workflow from triage to closure.',
  },
  rules: {
    eyebrow: 'Detection engineering',
    title: 'Detection Rules',
    sub: 'Rule registry with thresholds, windows, and verified positive/negative test cases.',
  },
  sources: {
    eyebrow: 'Ingestion',
    title: 'Log Sources',
    sub: 'Track where telemetry comes from and keep ingestion health visible.',
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
            <div className="brand-sub">Operations desk</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main navigation">
          <div className="nav-label">Workspace</div>
          {TABS.map((t, index) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => goTab(t.id)}
              title={t.label}
              aria-label={t.label}
            >
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-text">{t.label}</span>
              <span className="nav-index">{String(index + 1).padStart(2, '0')}</span>
              {t.id === 'alerts' && counts.alerts > 0 && <span className="nav-count">{counts.alerts}</span>}
              {t.id === 'incidents' && counts.incidents > 0 && <span className="nav-count">{counts.incidents}</span>}
              {t.id === 'events' && counts.events > 0 && <span className="nav-count">{counts.events}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="status-beacon" /> local / in-memory
          </div>
          <div className="user-line">
            <span className="avatar">{initials}</span>
            <div className="user-meta">
              <div className="user-name">{session.email.split('@')[0]}</div>
              <div className="user-role">{session.role}</div>
            </div>
            <button className="btn ghost icon-only" onClick={logout} title="Sign out" aria-label="Sign out">
              <IconLogout size={16} />
            </button>
          </div>
          <div className="build-stamp">sentinelx / build 0.4.2</div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          <div className="workspace-rail" aria-hidden="true">
            <span>SX / SecOps</span>
            <span className="rail-line" />
            <span>workspace: local</span>
            <span>build 0.4.2</span>
          </div>

          <header className="topbar">
            <div>
              <div className="page-eyebrow">
                <IconActivity size={13} /> {meta.eyebrow}
              </div>
              <h1 className="page-title">{meta.title}</h1>
              <p className="page-sub">{meta.sub}</p>
            </div>
            <div className="topbar-actions">
              <span className="live-pill">
                <span className="live-dot" /> Live
              </span>
              <button className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
                <IconRefresh size={15} /> Refresh
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
