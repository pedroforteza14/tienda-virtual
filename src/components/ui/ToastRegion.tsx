'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCommerce } from '@/features/cart/CommerceProvider';
import { cn } from '@/lib/utils/cn';

const TONES = {
  info: 'border-line-strong text-fg',
  ok: 'border-[color-mix(in_oklab,var(--color-signal-ok)_55%,transparent)] text-signal-ok',
  err: 'border-[color-mix(in_oklab,var(--color-signal-err)_55%,transparent)] text-signal-err',
} as const;

/**
 * The single live region for transient messages.
 *
 * `aria-live="polite"` on a container that is **always mounted** — a live region
 * added to the DOM at the same time as its content is frequently missed by screen
 * readers, so the region exists from first paint and only its children change.
 *
 * Mounted once at the root, which is also why there is no stacking-order bug:
 * there is only ever one of these.
 */
export function ToastRegion() {
  const { toasts, dismissToast } = useCommerce();
  const reduced = useReducedMotion();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.output
            key={item.id}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-auto flex max-w-[min(32rem,100%)] items-start gap-3 rounded-[var(--radius-sm)]',
              'border bg-surface-raised px-4 py-3 text-tiny',
              TONES[item.tone],
            )}
          >
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="u-mono -my-1 -mr-1 px-2 py-1 text-micro text-fg-faint transition-colors hover:text-fg"
            >
              <span className="sr-only">Descartar aviso</span>
              <span aria-hidden="true">×</span>
            </button>
          </motion.output>
        ))}
      </AnimatePresence>
    </div>
  );
}
