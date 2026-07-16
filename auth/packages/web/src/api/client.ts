// ----------------------------------------------------------------------------
// The single fetch wrapper every API call goes through. It handles the three
// things our hybrid-cookie setup needs:
//   1. credentials: "include"  -> the browser sends our httpOnly cookies.
//   2. X-CSRF-Token header      -> read from the csrf_token cookie and echoed
//      back, proving the request came from our own app.
//   3. transparent token refresh -> on a 401, try /auth/refresh once, then
//      retry the original request.
// ----------------------------------------------------------------------------

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // internal: prevents an infinite refresh loop
  _retried?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Attach the CSRF token on state-changing requests.
  if (method !== "GET") {
    const csrf = readCookie("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // On an expired access token, refresh once and replay the request.
  if (res.status === 401 && !options._retried && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return rawRequest<T>(path, { ...options, _retried: true });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? "error",
      data?.message ?? "Request failed",
      data?.details,
    );
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const csrf = readCookie("csrf_token");
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: csrf ? { "X-CSRF-Token": csrf } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => rawRequest<T>(path),
  post: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: "POST", body }),
};
