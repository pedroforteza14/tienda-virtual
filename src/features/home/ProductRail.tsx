'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { formatARS } from '@/lib/money';
import { ButtonLink } from '@/components/ui/Button';
import { SpecRails } from '@/components/ui/SpecRail';
import { ProductRender } from '@/components/product/ProductRender';
import type { RenderKind, Spec } from '@/types/catalog';

/**
 * ============================================================================
 *  THE SCROLL NARRATIVE — object → detail → specification → hand-off.
 * ============================================================================
 *
 * The brief's §6 example, built: a pinned section whose vertical scroll drives
 * horizontal travel across four panels, ending by handing off to a different
 * product.
 *
 * The rules it obeys (docs/motion-system.md):
 *  - the container has a **real height** and the stage is `sticky`, so the
 *    scroll is never taken: a flick passes straight through;
 *  - progress is a pure 0→1 value, so the whole thing is reversible and
 *    interruptible by construction;
 *  - that height is one viewport plus one scroll step per transition, where a
 *    step is 54vw — about 1.85 px of travel per px of scroll. It was a flat
 *    220vh, which on a 1440×900 window is **4:1**: a wheel notch moved the rail
 *    a third of a panel, the four panels were spent in one screen, and what you
 *    saw was two half-panels clipped by both edges. The panels were never the
 *    problem; settling on one was;
 *  - snap stops at each panel, `proximity` so a flick still passes through;
 *  - this is the only pinned section on the page;
 *  - **on touch it is not pinned at all.** It becomes a real `overflow-x` snap
 *    carousel, because driving horizontal travel from a vertical touch scroll is
 *    hostile. Which layout applies is decided by a **media query**, not by React
 *    state: deciding it after mount grew the section from `auto` to `220vh` right
 *    after hydration, a cumulative layout shift of 0.56 against a 0.1 budget.
 *    JavaScript is now responsible only for the transform;
 *  - under reduced motion it is a plain, readable, scrollable row.
 */

export interface RailPanel {
  id: string;
  eyebrow: string;
  title: string;
  /** One italic serif word inside the title, for the editorial counterpoint. */
  accent?: string;
  body: string;
  render: RenderKind;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  /** Device scale within the panel. The "zoom" panel uses a large value. */
  zoom?: number;
  specs?: Spec[];
  cta?: { href: string; label: string };
  price?: number;
}

export function ProductRail({ panels }: { panels: RailPanel[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pinned, setPinned] = useState(false);

  /**
   * Whether to *drive* the transform. The layout is already correct from CSS, so
   * this flag changes no geometry — only whether `x` is applied and whether the
   * stage clips.
   */
  useEffect(() => {
    if (reduced) return;
    const query = window.matchMedia('(min-width: 64rem) and (pointer: fine)');
    const update = () => setPinned(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [reduced]);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // Travel the full width of the track minus one viewport.
  const x = useTransform(scrollYProgress, [0, 1], ['0%', `-${(panels.length - 1) * 100}%`]);
  // Hoisted out of the JSX: it sits inside a conditional branch down there, and a
  // hook called conditionally is a hook called wrong.
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section
      ref={ref}
      aria-labelledby="rail-heading"
      className="rail relative"
      // The section's height is one viewport plus one scroll step per
      // transition, and only CSS knows how long a step is. Handing it the
      // count keeps the geometry in the stylesheet, where the layout for the
      // other two forms already lives.
      style={{ '--rail-steps': Math.max(panels.length - 1, 1) } as CSSProperties}
    >
      <h2 id="rail-heading" className="sr-only">
        Recorrido de producto
      </h2>

      {/*
        One snap stop per panel, at the scroll offset where that panel is
        centred, so the page settles on a composition instead of between two.
        They are 1px markers rather than anything visible: `scroll-snap-align`
        has to sit on an element at the right position in the scrollport, and
        the panels themselves are inside a sticky stage that never moves.
      */}
      {panels.map((panel, index) => (
        <div
          key={`stop-${panel.id}`}
          aria-hidden="true"
          className="rail-stop"
          style={{ '--i': index } as CSSProperties}
        />
      ))}

      <div className="rail-stage" data-pinned={pinned}>
        <motion.ol
          style={pinned ? { x } : undefined}
          // Layout comes entirely from `.rail-track` — see globals.css for why no
          // utility may set the same properties.
          className="rail-track"
        >
          {panels.map((panel, index) => (
            <li key={panel.id} className="rail-panel">
              <Panel panel={panel} index={index} />
            </li>
          ))}
        </motion.ol>
      </div>

      {/* Progress read-out. Mono, because it is an instrument. */}
      {pinned ? (
        <div className="pointer-events-none sticky bottom-6 z-10 -mt-16">
          <div className="u-container flex items-center gap-3">
            <span className="u-mono text-micro text-fg-faint">01</span>
            <span className="relative h-px flex-1 bg-[var(--line)]">
              <motion.span
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: progressWidth }}
              />
            </span>
            <span className="u-mono text-micro text-fg-faint">
              {String(panels.length).padStart(2, '0')}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Panel({ panel, index }: { panel: RailPanel; index: number }) {
  return (
    <div className="rail-panel-inner">
      {/* Device. On the zoom panel it is deliberately cropped by the stage —
          the Dyson lesson: showing the inside of an object is persuasive. */}
      <div className="rail-panel-visual">
        <span
          aria-hidden="true"
          className="absolute aspect-square w-[70%] rounded-full border border-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
        />
        <div
          className="relative h-full w-full"
          style={{ transform: `scale(${panel.zoom ?? 1})` }}
        >
          <ProductRender
            kind={panel.render}
            color={panel.color}
            productName={panel.title}
            className="h-full w-full"
            specular
          />
        </div>
      </div>

      {/* Copy */}
      <div className="rail-panel-copy">
        <p className="u-label">
          <span className="text-accent">{String(index + 1).padStart(2, '0')}</span> ·{' '}
          {panel.eyebrow}
        </p>

        <h3 className="u-display-tight mt-4 max-w-[18ch] text-h2">
          {panel.accent ? (
            <>
              {panel.title.split(panel.accent)[0]}
              <span className="u-editorial text-accent">{panel.accent}</span>
              {panel.title.split(panel.accent)[1]}
            </>
          ) : (
            panel.title
          )}
        </h3>

        <p className="u-prose mt-4 text-body text-fg-dim">{panel.body}</p>

        {panel.specs ? <SpecRails specs={panel.specs} className="mt-6 max-w-xl" /> : null}

        {panel.price !== undefined ? (
          <p className="u-mono mt-6 text-lead">
            Desde {formatARS(panel.price)}
            <span className="ml-2 text-micro text-fg-faint">
              transferencia
            </span>
          </p>
        ) : null}

        {panel.cta ? (
          <ButtonLink href={panel.cta.href} size="md" className="mt-6">
            {panel.cta.label}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
