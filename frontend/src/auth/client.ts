// ----------------------------------------------------------------------------
// The single fetch wrapper for talking to the Auth microservice. NeuralHire
// reaches the Auth API at the SAME origin (Vite proxies /auth + /mfa to it), so
// the browser shares the Auth service's httpOnly cookies automatically. This
// mirrors the Auth web app's own client:
//   1. credentials: "include"  -> send the auth cookies.
//   2. X-CSRF-Token header      -> read from the csrf_token cookie and echo it
//      back (the double-submit CSRF defense the Auth API enforces).
//   3. transparent refresh      -> on a 401, try /auth/refresh once, then retry.
// ----------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(name + '='))
    ?.split('=')[1];
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  _retried?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (method !== 'GET') {
    const csrf = readCookie('csrf_token');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options._retried && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) return rawRequest<T>(path, { ...options, _retried: true });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? 'error',
      data?.message ?? 'Request failed',
      data?.details,
    );
  }
  return data as T;
}

// Exchange the refresh-token cookie for a fresh access token. Exported so the
// main app can also recover from an expired access token mid-session.
export async function tryRefresh(): Promise<boolean> {
  try {
    const csrf = readCookie('csrf_token');
    const res = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => rawRequest<T>(path),
  post: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'POST', body }),
};
