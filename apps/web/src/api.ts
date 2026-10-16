const BASE = '';

function token(): string | null {
  return localStorage.getItem('sx_token');
}

async function req(path: string, init?: RequestInit): Promise<any> {
  const headers: Record<string, string> = {};
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init?.headers as any) } });
  if (r.status === 401) {
    localStorage.removeItem('sx_token');
    throw new Error('Unauthorized — please login again');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as any).error || `HTTP ${r.status}`);
  return body;
}

export const api = {
  login: (email: string, password: string) =>
    req('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  overview: () => req('/api/v1/dashboard/overview'),
  events: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('/api/v1/events' + (q ? `?${q}` : ''));
  },
  alerts: () => req('/api/v1/alerts'),
  alertDetail: (id: string) => req(`/api/v1/alerts/${id}`),
  sources: () => req('/api/v1/sources'),
  createSource: (name: string, source_type: string) =>
    req('/api/v1/sources', { method: 'POST', body: JSON.stringify({ name, source_type }) }),
  upload: async (file: File, source_id: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source_id', source_id);
    const t = token();
    const r = await fetch(BASE + '/api/v1/ingest/upload', {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as any).error || `HTTP ${r.status}`);
    return body;
  },
};
