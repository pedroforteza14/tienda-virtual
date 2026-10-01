import { env } from '@/config/env';

/**
 * Cookie naming and attributes in one place.
 *
 * The `__Host-` prefix is a real control: a browser accepts such a cookie only if
 * it is `Secure`, `Path=/` and has **no** `Domain`, which makes it impossible for
 * a sibling subdomain — or an attacker who obtains one — to overwrite our session
 * cookie.
 *
 * Both the prefix and `Secure` are keyed on **whether the origin is https**, not
 * on `NODE_ENV`. That distinction matters: `NODE_ENV=production` describes the
 * build, not the transport, and a production build served over `http://127.0.0.1`
 * (a smoke test, or the e2e suite) would otherwise be issued cookies the browser
 * may refuse — leaving the session silently broken in exactly the run meant to
 * verify it.
 */

const BASE_NAMES = {
  session: 'owner.sid',
  cart: 'owner.cart',
  csrf: 'owner.csrf',
} as const;

export type CookieKind = keyof typeof BASE_NAMES;

export function cookieName(kind: CookieKind): string {
  const base = BASE_NAMES[kind];
  return env().isSecureOrigin ? `__Host-${base}` : base;
}

export interface CookieAttributes {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

export function cookieAttributes(
  kind: CookieKind,
  maxAge: number,
): CookieAttributes {
  return {
    // The CSRF cookie is the one value client JS must read, for the
    // double-submit header. Everything else is HttpOnly.
    httpOnly: kind !== 'csrf',
    secure: env().isSecureOrigin,
    // `lax` keeps the session usable on a top-level navigation from Instagram,
    // which is where our traffic comes from. `strict` would log those visitors
    // out of their own cart on arrival. CSRF is handled separately and in depth
    // — see docs/threat-model.md §4.9.
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
