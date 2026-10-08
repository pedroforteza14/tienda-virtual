'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils/cn';
import { DUR, EASE_IN, EASE_OUT } from '@/lib/motion/easing';

/**
 * ============================================================================
 *  OVERLAY — the base for the cart drawer, the search sheet and the mobile menu.
 * ============================================================================
 *
 * Every accessible-dialog obligation, implemented once:
 *
 *  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the
 *    real heading;
 *  - focus moves into the panel on open and **returns to the trigger** on close.
 *    Losing the return point is the single most disorienting dialog bug for a
 *    keyboard user;
 *  - Tab and Shift+Tab are trapped, computed live so a dialog whose content
 *    changes (search results appearing) traps correctly;
 *  - `Escape` closes from anywhere inside;
 *  - the backdrop closes on click but is not a focus target;
 *  - scroll is locked on `<body>` **with scrollbar-width compensation**, so the
 *    page behind does not jump sideways when the drawer opens;
 *  - under reduced motion it appears instead of sliding, with no transition.
 *
 * It is a portal, so an overlay can never be clipped by an ancestor's
 * `overflow` or trapped in a stacking context.
 */

export type OverlaySide = 'right' | 'top' | 'full';

const PANEL_POSITION: Record<OverlaySide, string> = {
  right:
    'inset-y-0 right-0 w-full max-w-[28rem] border-l border-line ' +
    'rounded-l-[var(--radius-lg)] sm:rounded-l-[var(--radius-xl)]',
  top: 'inset-x-0 top-0 max-h-[85dvh] border-b border-line',
  full: 'inset-0',
};

const MOTION: Record<OverlaySide, { from: Record<string, number>; to: Record<string, number> }> = {
  right: { from: { x: 32, opacity: 0 }, to: { x: 0, opacity: 1 } },
  top: { from: { y: -24, opacity: 0 }, to: { y: 0, opacity: 1 } },
  full: { from: { opacity: 0 }, to: { opacity: 1 } },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered visibly unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  side?: OverlaySide;
  children: React.ReactNode;
  /** Extra classes for the panel. */
  className?: string;
  /** Rendered in the header row, next to the close button. */
  headerExtra?: React.ReactNode;
}

export function Overlay({
  open,
  onClose,
  title,
  hideTitle = false,
  side = 'right',
  children,
  className,
  headerExtra,
}: OverlayProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();

  // Portals need a DOM. Rendering nothing on the server avoids a hydration
  // mismatch rather than papering over one.
  useEffect(() => setMounted(true), []);

  /* Scroll lock, with scrollbar compensation. */
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.dataset.scrollLocked = 'true';
    body.style.setProperty('--scrollbar-width', `${scrollbar}px`);
    return () => {
      delete body.dataset.scrollLocked;
      body.style.removeProperty('--scrollbar-width');
    };
  }, [open]);

  /* Focus management: capture the trigger, move focus in, restore on close. */
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    // One frame, so the panel exists and its first control is reachable.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      // `isConnected` guards against restoring focus to an element that the
      // overlay's own action removed from the DOM.
      const target = restoreRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);

  /* Escape, and the Tab trap. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      // Queried on every Tab rather than cached: the content can change while
      // open (search results), and a stale list traps focus in the wrong place.
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
          <motion.div
            // Not a button: a backdrop is not a control, and announcing it as one
            // adds noise. `Escape` and the real close button are the semantic paths.
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : DUR.fast, ease: EASE_IN } }}
            transition={{ duration: reduced ? 0 : 0.24 }}
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-ink-sunken)_82%,transparent)] backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? MOTION[side].to : MOTION[side].from}
            animate={MOTION[side].to}
            exit={
              reduced
                ? MOTION[side].to
                : { ...MOTION[side].from, transition: { duration: DUR.base, ease: EASE_IN } }
            }
            transition={{
              duration: reduced ? 0 : 0.42,
              ease: EASE_OUT,
            }}
            className={cn(
              'absolute flex flex-col bg-surface-raised outline-none',
              PANEL_POSITION[side],
              className,
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2
                id={titleId}
                className={cn('u-label text-fg', hideTitle && 'sr-only')}
              >
                {title}
              </h2>
              <div className="flex items-center gap-2">
                {headerExtra}
                <button
                  type="button"
                  onClick={onClose}
                  className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-fg-dim transition-colors hover:text-fg"
                >
                  <span className="sr-only">Cerrar</span>
                  <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                    <path
                      d="M3 3l10 10M13 3L3 13"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
