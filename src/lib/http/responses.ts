import { newRequestId } from '@/server/observability/logger';

/**
 * Response shaping.
 *
 * One rule, from docs/threat-model.md §4.8: an error response carries a stable
 * machine code, a message safe to show a customer, and a request id — and
 * nothing else. No stack, no SQL, no file path, no environment value, no Zod
 * internals. The detail goes to the log, correlated by that same id, so support
 * can find it without the browser ever having seen it.
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'server_error';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  server_error: 500,
};

/** Customer-facing copy. Deliberately uninformative about internals. */
/**
 * ⚠️ Never use the word "pedido" here.
 *
 * In this storefront a *pedido* is an ORDER: the route is `/pedido/[reference]`,
 * the page is titled "Tu pedido", the account lists "Tus pedidos". Three of
 * these messages used it in its other sense — an HTTP request — so a shopper
 * who tripped a validation error at checkout read "No pudimos procesar el
 * pedido" and concluded their purchase had failed, when nothing had been
 * ordered. The word is not ambiguous to a developer and is badly ambiguous to
 * a customer, and the customer is who reads it.
 */
const DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  bad_request: 'No pudimos procesar la solicitud.',
  validation_failed: 'Revisá los datos ingresados.',
  unauthorized: 'Necesitás iniciar sesión.',
  forbidden: 'No tenés permiso para esta acción.',
  // "El estado cambió" is how the server thinks about it, not the shopper.
  conflict: 'Algo cambió mientras tanto. Volvé a intentar.',
  not_found: 'No encontramos lo que buscás.',
  payload_too_large: 'Enviaste demasiados datos.',
  // "Soportado" is a calque of "supported"; "admitido" is the Spanish.
  unsupported_media_type: 'Formato no admitido.',
  // Says how long, like the login lockout does. "Un momento" is not a duration.
  rate_limited: 'Demasiados intentos. Esperá unos minutos.',
  server_error: 'Algo salió mal de nuestro lado. Ya lo estamos viendo.',
};

export interface ApiError {
  error: { code: ApiErrorCode; message: string; requestId: string };
  /** Per-field messages. Only ever set for `validation_failed`. */
  fields?: Record<string, string>;
}

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { ...NO_STORE, ...init?.headers },
  });
}

export function jsonError(
  code: ApiErrorCode,
  options?: {
    message?: string;
    fields?: Record<string, string>;
    requestId?: string;
    headers?: Record<string, string>;
    /** Override the default status (e.g. a 404 standing in for a 403). */
    status?: number;
  },
): Response {
  const body: ApiError = {
    error: {
      code,
      message: options?.message ?? DEFAULT_MESSAGE[code],
      requestId: options?.requestId ?? newRequestId(),
    },
    ...(options?.fields ? { fields: options.fields } : {}),
  };

  return new Response(JSON.stringify(body), {
    status: options?.status ?? STATUS[code],
    headers: { ...NO_STORE, ...options?.headers },
  });
}

/** Empty success, for deletes. */
export function noContent(headers?: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: { ...NO_STORE, ...headers } });
}
