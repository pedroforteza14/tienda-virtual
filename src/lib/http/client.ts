import { CSRF_HEADER } from '@/config/constants';
import type { ApiError } from '@/lib/http/responses';

/**
 * Browser-side API client.
 *
 * It exists for one reason: every mutating request must carry the CSRF header,
 * and a hand-written `fetch` somewhere in a component is exactly how one ends up
 * not carrying it. Going through this function makes the correct behaviour the
 * default.
 *
 * The CSRF token is cached in a module variable rather than `localStorage` — it
 * is tied to a session, not to a device, and persisting it would outlive the
 * session it belongs to. On a first visit there is no session cookie yet, so
 * `GET /api/session` issues one and returns the token; thereafter the token is
 * read from the cookie the server already set.
 */

let cachedToken: string | null = null;
let inflight: Promise<string | null> | null = null;

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  // The CSRF cookie is deliberately *not* HttpOnly — a double-submit token has to
  // be readable by our own JS. It is useless to another origin, which cannot read
  // it (same-origin policy) and cannot compute it (no signing key).
  for (const part of document.cookie.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name === '__Host-owner.csrf' || name === 'owner.csrf') {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

async function ensureCsrfToken(): Promise<string | null> {
  cachedToken ??= readCsrfCookie();
  if (cachedToken) return cachedToken;

  // De-duplicate: several components mounting at once must not each bootstrap.
  inflight ??= (async () => {
    try {
      const response = await fetch('/api/session', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { csrfToken?: string };
      cachedToken = body.csrfToken ?? readCsrfCookie();
      return cachedToken;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string>; requestId?: string };

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const mutating = method !== 'GET' && method !== 'HEAD';

  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  if (mutating) {
    const token = await ensureCsrfToken();
    if (token) headers[CSRF_HEADER] = token;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      // `same-origin` not `include`: cookies go to us and nowhere else.
      credentials: 'same-origin',
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, code: 'aborted', message: 'Cancelado.' };
    }
    return { ok: false, code: 'network', message: 'Sin conexión. Reintentá en un momento.' };
  }

  if (response.status === 204) return { ok: true, data: undefined as T };

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as ApiError | null;
    // A rejected CSRF token usually means the session rotated (login, logout, or
    // expiry). Drop the cached token so the next attempt re-bootstraps instead of
    // retrying with a value that can no longer work.
    if (response.status === 403) cachedToken = null;

    return {
      ok: false,
      code: body?.error?.code ?? 'unknown',
      message: body?.error?.message ?? 'Algo salió mal. Reintentá.',
      ...(body?.fields ? { fields: body.fields } : {}),
      ...(body?.error?.requestId ? { requestId: body.error.requestId } : {}),
    };
  }

  return { ok: true, data: payload as T };
}

/** Called after login/logout, which rotate the session and therefore the token. */
export function invalidateCsrfToken(): void {
  cachedToken = null;
}
