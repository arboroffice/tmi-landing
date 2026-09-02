// Typed client for the existing TMI serverless API (/api/*). Reuses the same
// admin bearer token the static site stored, so both can run during migration.
const TOKEN_KEY = 'tmi_admin_tk';

export const auth = {
  token(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token() ?? ''}` },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    auth.clear();
    window.dispatchEvent(new Event('tmi-unauthorized'));
    throw new ApiError('Sign in required', 401);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError((json && json.error) || 'Request failed', res.status);
  return json as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  del: <T = unknown>(path: string) => request<T>(path, 'DELETE'),
};
