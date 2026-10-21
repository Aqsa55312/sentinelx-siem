const BASE = '';

function token(): string | null {
  return localStorage.getItem('sx_token');
}

function authHeaders(extra?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (extra && !(extra instanceof Headers) && !Array.isArray(extra)) {
    Object.assign(headers, extra as Record<string, string>);
  }
  return headers;
}

async function req(path: string, init?: RequestInit): Promise<any> {
  const headers = authHeaders(init?.headers);
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { ...init, headers });
  if (r.status === 401) {
    localStorage.removeItem('sx_token');
    throw new Error('Unauthorized — please login again');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as any).error || `HTTP ${r.status}`);
  return body;
}

async function reqText(path: string): Promise<string> {
  const r = await fetch(BASE + path, { headers: authHeaders() });
  if (r.status === 401) {
    localStorage.removeItem('sx_token');
    throw new Error('Unauthorized — please login again');
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(body || `HTTP ${r.status}`);
  }
  return r.text();
}

export const api = {
  login: (email: string, password: string) =>
    req('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  overview: () => req('/api/v1/dashboard/overview'),
  users: () => req('/api/v1/users'),
  events: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('/api/v1/events' + (q ? `?${q}` : ''));
  },
  alerts: () => req('/api/v1/alerts'),
  alertDetail: (id: string) => req(`/api/v1/alerts/${id}`),
  updateAlert: (id: string, status: string, reason = '') =>
    req(`/api/v1/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  incidents: () => req('/api/v1/incidents'),
  incidentDetail: (id: string) => req(`/api/v1/incidents/${id}`),
  createIncident: (alert_ids: string[], title = '', assignee_id = '') =>
    req('/api/v1/incidents', { method: 'POST', body: JSON.stringify({ alert_ids, title, assignee_id }) }),
  updateIncident: (id: string, patch: Record<string, unknown>) =>
    req(`/api/v1/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addIncidentNote: (id: string, body: string) =>
    req(`/api/v1/incidents/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  exportIncident: (id: string) => reqText(`/api/v1/incidents/${id}/export`),
  rules: () => req('/api/v1/rules'),
  sources: () => req('/api/v1/sources'),
  createSource: (name: string, source_type: string, criticality = 50) =>
    req('/api/v1/sources', { method: 'POST', body: JSON.stringify({ name, source_type, criticality }) }),
  upload: async (file: File, source_id: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source_id', source_id);
    const r = await fetch(BASE + '/api/v1/ingest/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as any).error || `HTTP ${r.status}`);
    return body;
  },
};
