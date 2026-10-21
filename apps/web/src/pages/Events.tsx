import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDateTime, timeAgo, titleCase } from '../lib/format';
import { IconChevronDown, IconFile, IconSearch, IconUpload } from '../components/Icons';

type Preset = { src_ip?: string; event_type?: string; key: number };
type Props = { refreshKey: number; preset?: Preset };

const PAGE = 12;
const EVENT_TYPES = [
  'authentication_failed',
  'authentication_success',
  'authorization_denied',
  'admin_action',
  'web_request',
  'high_risk_event',
  'generic',
];

export default function Events({ refreshKey, preset }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [srcIp, setSrcIp] = useState('');
  const [etype, setEtype] = useState('');
  const [username, setUsername] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(off = 0, override?: { srcIp?: string; etype?: string }) {
    setErr('');
    setBusy(true);
    try {
      const params: Record<string, string> = { limit: String(PAGE), offset: String(off) };
      const ip = override?.srcIp ?? srcIp;
      const typ = override?.etype ?? etype;
      if (ip) params.src_ip = ip;
      if (typ) params.event_type = typ;
      if (username) params.username = username;
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();
      const r = await api.events(params);
      setEvents(r.events ?? []);
      setTotal(r.total ?? 0);
      setOffset(off);
      setExpanded(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, preset?.key]);

  useEffect(() => {
    if (!preset) return;
    if (preset.src_ip !== undefined) setSrcIp(preset.src_ip);
    if (preset.event_type !== undefined) setEtype(preset.event_type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.key]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setNotice('');
    setErr('');
    setUploading(f.name);
    try {
      const r = await api.upload(f, 'source-demo-01');
      const rejected = (r.rejected_parse ?? 0) + (r.rejected_schema ?? 0);
      setNotice(
        `${f.name}: ${r.accepted} accepted, ${rejected} rejected, ${r.alerts_fired} alert${r.alerts_fired === 1 ? '' : 's'} fired`,
      );
      await load(0);
    } catch (e: any) {
      setErr('Upload failed: ' + e.message);
    } finally {
      setUploading('');
    }
    e.target.value = '';
  }

  function reset() {
    setSrcIp('');
    setEtype('');
    setUsername('');
    setFrom('');
    setTo('');
    load(0, { srcIp: '', etype: '' });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <div className="panel-title">Search events</div>
            <div className="panel-sub">Filter by source IP, event type, account, or time range (UTC input, local display)</div>
          </div>
          <div className="panel-actions">
            <label className="upload" style={{ padding: '7px 11px' }}>
              <span className="upload-icon" style={{ width: 26, height: 26, borderRadius: 8 }}>
                <IconUpload size={14} />
              </span>
              <span>
                <span className="upload-title">{uploading ? 'Uploading…' : 'Upload log file'}</span>
                <span className="upload-sub">.jsonl / .json · max 10MB</span>
              </span>
              <input type="file" accept=".jsonl,.json" onChange={onUpload} disabled={!!uploading} />
            </label>
          </div>
        </div>

        <div className="filters">
          <label className="field">
            <span>Source IP</span>
            <input className="input" placeholder="192.0.2.10" value={srcIp} onChange={(e) => setSrcIp(e.target.value)} />
          </label>
          <label className="field">
            <span>Event type</span>
            <select className="select" value={etype} onChange={(e) => setEtype(e.target.value)}>
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Username</span>
            <input className="input" placeholder="demo-user" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>From</span>
            <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={() => load(0)}>
              <IconSearch size={15} /> Search
            </button>
            <button className="btn" onClick={reset}>
              Reset
            </button>
          </div>
        </div>

        {notice && <div className="notice">{notice}</div>}
        {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
      </div>

      <div className="panel flush">
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div className="panel-title">Event stream</div>
            <div className="panel-sub">
              {total} matching event{total === 1 ? '' : 's'} · page {page}/{pages}
            </div>
          </div>
          <span className="chip" style={{ marginLeft: 'auto' }}>
            newest first
          </span>
        </div>

        {busy && events.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="skeleton skeleton-row" key={i} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <IconFile size={20} />
            </span>
            <span className="empty-title">No events match these filters</span>
            <span className="small">Clear the filters or upload a JSONL fixture from the toolbar.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Timestamp</th>
                  <th style={{ width: 180 }}>Event type</th>
                  <th style={{ width: 130 }}>Source IP</th>
                  <th style={{ width: 120 }}>User</th>
                  <th>Message</th>
                  <th style={{ width: 92 }}>Severity</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {events.map((e: any) => {
                  const open = expanded === e.event_id;
                  return (
                    <Fragment key={e.event_id}>
                      <tr onClick={() => setExpanded(open ? null : e.event_id)} style={{ cursor: 'pointer' }}>
                        <td className="mono nowrap" title={fmtDateTime(e.timestamp)}>
                          {timeAgo(e.timestamp)}
                        </td>
                        <td>
                          <span className="type-tag">{e.event_type}</span>
                        </td>
                        <td className="mono">{e.src_ip || '—'}</td>
                        <td>{e.username || '—'}</td>
                        <td className="truncate" style={{ maxWidth: 360 }} title={e.message}>
                          {e.message || '—'}
                        </td>
                        <td>
                          <span className={`sev ${e.severity}`}>{e.severity}</span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                          <IconChevronDown size={14} style={open ? { transform: 'rotate(180deg)' } : undefined} />
                        </td>
                      </tr>
                      {open && (
                        <tr key={e.event_id + '-detail'}>
                          <td colSpan={7} style={{ background: 'rgba(6,11,20,.55)', padding: 0 }}>
                            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
                              <div>
                                <div className="section-label" style={{ margin: '0 0 8px' }}>
                                  Event detail
                                </div>
                                <div className="meta-grid" style={{ gridTemplateColumns: '1fr 1fr', margin: 0 }}>
                                  <Meta label="Event ID" value={<span className="mono">{e.event_id}</span>} />
                                  <Meta label="Source" value={e.source_id || '—'} />
                                  <Meta label="Timestamp (local)" value={fmtDateTime(e.timestamp)} />
                                  <Meta label="Type" value={titleCase(e.event_type)} />
                                </div>
                              </div>
                              <div>
                                <div className="section-label" style={{ margin: '0 0 8px' }}>
                                  Attributes
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    background: 'rgba(0,0,0,.35)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 10,
                                    padding: 12,
                                    fontFamily: 'var(--mono)',
                                    fontSize: 11.5,
                                    overflow: 'auto',
                                    maxHeight: 160,
                                  }}
                                >
                                  {JSON.stringify(e.attributes ?? {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 20px 16px' }}>
          <div className="pager">
            <button className="btn sm" disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>
              Previous
            </button>
            <button className="btn sm" disabled={offset + PAGE >= total} onClick={() => load(offset + PAGE)}>
              Next
            </button>
            <span className="pager-info">
              Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}
