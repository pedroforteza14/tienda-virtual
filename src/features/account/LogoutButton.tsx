'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, invalidateCsrfToken } from '@/lib/http/client';
import { Button } from '@/components/ui/Button';

/**
 * Logout.
 *
 * `POST`, not a link: a logout triggered by a GET is a CSRF primitive (an
 * `<img src="/logout">` on any page would sign people out), and it would also be
 * prefetched by the browser.
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      className="border border-[var(--line)]"
      onClick={async () => {
        setBusy(true);
        await apiFetch('/api/auth/logout', { method: 'POST' });
        // A fresh guest session was issued, so the old token is gone.
        invalidateCsrfToken();
        setBusy(false);
        router.refresh();
      }}
    >
      Cerrar sesión
    </Button>
  );
}
