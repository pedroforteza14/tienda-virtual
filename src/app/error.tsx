'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Aperture } from '@/components/ui/Aperture';

/**
 * The error boundary.
 *
 * It shows a generic message and, when Next provides one, the error **digest** — a
 * hash, not the message. That is deliberate: the digest lets support correlate the
 * incident with a server log line, while the browser never receives a stack trace,
 * a database error or an internal path. docs/threat-model.md §4.8.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Browser console only, for a developer with devtools open. Nothing is sent
    // anywhere, and `error.message` from a server component is already redacted
    // to a generic string by Next in production.
    console.error('[owner] render error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="u-container grid min-h-[70svh] place-items-center py-[var(--section-y)]">
      <div className="text-center">
        <Aperture size="7rem" className="mx-auto" />
        <p className="u-label mt-10">Algo se rompió</p>
        <h1 className="u-display mt-4 text-h2">
          Volvé a <span className="u-editorial text-accent normal-case">intentar</span>.
        </h1>
        <p className="u-prose mx-auto mt-5 text-body text-fg-dim">
          Tuvimos un problema de nuestro lado. Tu carrito está a salvo.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={reset}>
            Reintentar
          </Button>
          <ButtonLink href="/" variant="secondary" size="lg">
            Ir al inicio
          </ButtonLink>
        </div>

        {error.digest ? (
          <p className="u-mono mt-10 text-micro text-fg-faint">
            Referencia: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
