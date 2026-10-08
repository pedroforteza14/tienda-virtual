import type { z } from 'zod';
import { MAX_JSON_BODY_BYTES, type RateLimitBucket } from '@/config/constants';
import { jsonError, jsonOk } from '@/lib/http/responses';
import { toFieldErrors } from '@/lib/validation/schemas';
import { logger, newRequestId } from '@/server/observability/logger';
import {
  clientKey,
  logRateLimited,
  rateLimit,
  rateLimitHeaders,
} from '@/server/security/rate-limit';
import {
  checkBodySize,
  checkContentType,
  checkCsrf,
  checkOrigin,
  isMutating,
  logRejection,
} from '@/server/security/request';
import {
  getAuthSession,
  sessionIdFromRequest,
  type AuthSession,
  type Role,
} from '@/server/security/session';

/**
 * The one request pipeline every API route goes through.
 *
 * Centralising it is the point. Per-route security is security that gets
 * forgotten on the route added next quarter — here, a new handler cannot be
 * written *without* rate limiting, origin validation, CSRF, a body cap and
 * schema validation, because those are the wrapper's job, not the handler's.
 *
 * Order is deliberate — cheapest and most protective first:
 *
 *   1. rate limit        (before any parsing; this is the DoS gate)
 *   2. origin / referer  (CSRF layer 2 — header-only, no body read)
 *   3. content-type      (CSRF layer 3 — kills the simple-request path)
 *   4. body size         (before buffering)
 *   5. CSRF double-submit (CSRF layer 4)
 *   6. auth / role       (before the handler can touch anything)
 *   7. schema parse      (the input boundary)
 *   8. handler
 *
 * Anything thrown by the handler becomes a generic 500 with a correlation id.
 */

export interface GuardContext<T> {
  request: Request;
  /** Parsed, validated input. `undefined` when the route declares no schema. */
  data: T;
  /** Always present for a browser request — middleware issues it. */
  sessionId: string | null;
  auth: AuthSession | null;
  requestId: string;
  url: URL;
}

export interface GuardOptions<S extends z.ZodTypeAny | undefined> {
  bucket: RateLimitBucket;
  schema?: S;
  /** Require an authenticated session. */
  requireAuth?: boolean;
  /** Require a specific role. Implies `requireAuth`. */
  role?: Role;
  /** Override the default body cap. */
  maxBytes?: number;
  /** Read input from the query string instead of the body (for GET routes). */
  source?: 'body' | 'query';
}

type Parsed<S> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

export function guarded<S extends z.ZodTypeAny | undefined = undefined>(
  options: GuardOptions<S>,
  handler: (context: GuardContext<Parsed<S>>) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async function route(request: Request): Promise<Response> {
    const requestId = newRequestId();
    const url = new URL(request.url);
    const path = url.pathname;
    const sessionId = sessionIdFromRequest(request);

    /* 1 — rate limit --------------------------------------------------------- */
    const limit = await rateLimit(options.bucket, clientKey(request, sessionId));
    const limitHeaders = rateLimitHeaders(limit);
    if (!limit.allowed) {
      logRateLimited(options.bucket, clientKey(request, sessionId), requestId);
      return jsonError('rate_limited', { requestId, headers: limitHeaders });
    }

    const mutating = isMutating(request.method);

    /* 2 — origin ------------------------------------------------------------- */
    const origin = checkOrigin(request);
    if (!origin.ok) {
      logRejection('origin', origin.reason, { requestId, path });
      return jsonError('forbidden', { requestId, headers: limitHeaders });
    }

    /* 3 — content type ------------------------------------------------------- */
    if (mutating && options.source !== 'query' && !checkContentType(request)) {
      return jsonError('unsupported_media_type', { requestId, headers: limitHeaders });
    }

    /* 4 — body size ---------------------------------------------------------- */
    const maxBytes = options.maxBytes ?? MAX_JSON_BODY_BYTES;
    if (mutating) {
      const size = checkBodySize(request, maxBytes);
      if (!size.ok) {
        logger.security('body.too.large', { requestId, path, declared: size.declared });
        return jsonError('payload_too_large', { requestId, headers: limitHeaders });
      }
    }

    /* 5 — CSRF --------------------------------------------------------------- */
    const csrf = checkCsrf(request, sessionId);
    if (!csrf.ok) {
      logRejection('csrf', csrf.reason, { requestId, path });
      return jsonError('forbidden', { requestId, headers: limitHeaders });
    }

    /* 6 — authentication and authorization ----------------------------------- */
    const auth = await getAuthSession(sessionId);
    if ((options.requireAuth || options.role) && !auth) {
      return jsonError('unauthorized', { requestId, headers: limitHeaders });
    }
    if (options.role && auth && auth.role !== options.role) {
      // Authorization is checked against the server-side session record, never
      // against anything the client sent. docs/threat-model.md §4.4.
      logger.security('authz.denied', {
        requestId,
        path,
        required: options.role,
        actual: auth.role,
        userId: auth.userId,
      });
      // 404 rather than 403: a 403 confirms the route exists and is privileged.
      return jsonError('not_found', { requestId, headers: limitHeaders });
    }

    /* 7 — input -------------------------------------------------------------- */
    let data: unknown;
    if (options.schema) {
      let raw: unknown;

      if (options.source === 'query') {
        raw = Object.fromEntries(url.searchParams.entries());
      } else {
        const text = await readBoundedText(request, maxBytes);
        if (text === null) {
          logger.security('body.too.large', { requestId, path });
          return jsonError('payload_too_large', { requestId, headers: limitHeaders });
        }
        if (text.length === 0) {
          raw = {};
        } else {
          try {
            raw = JSON.parse(text);
          } catch {
            return jsonError('bad_request', {
              requestId,
              message: 'No pudimos leer los datos enviados.',
              headers: limitHeaders,
            });
          }
        }
      }

      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) {
        // Full issue list to the log; only flat field messages to the client.
        logger.security('input.rejected', {
          requestId,
          path,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
          })),
        });
        return jsonError('validation_failed', {
          requestId,
          fields: toFieldErrors(parsed.error),
          headers: limitHeaders,
        });
      }
      data = parsed.data;
    }

    /* 8 — handler ------------------------------------------------------------ */
    try {
      const response = await handler({
        request,
        data: data as Parsed<S>,
        sessionId,
        auth,
        requestId,
        url,
      });
      for (const [key, value] of Object.entries(limitHeaders)) {
        if (!response.headers.has(key)) response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      // The only place an unexpected error is turned into a response. The detail
      // stays here; the client gets a code and the id.
      logger.error('route.unhandled', { requestId, path, method: request.method, error });
      return jsonError('server_error', { requestId, headers: limitHeaders });
    }
  };
}

/**
 * Read a body with a hard byte ceiling, independent of `Content-Length`.
 *
 * A client can lie about `Content-Length`, so the declared-size check is not
 * enough on its own: this streams and aborts the moment the real byte count
 * exceeds the cap, so an unbounded body is never fully buffered.
 */
async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

/** Re-export so routes import a single module. */
export { jsonOk, jsonError };
