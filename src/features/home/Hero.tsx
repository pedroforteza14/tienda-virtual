'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { formatARS } from '@/lib/money';
import { ButtonLink } from '@/components/ui/Button';
import { ProductRender } from '@/components/product/ProductRender';
import { Ledger } from '@/components/layout/Ledger';
import type { RenderKind } from '@/types/catalog';

/**
 * ============================================================================
 *  THE HERO — the product arrives through the O of OWNER.
 * ============================================================================
 *
 * The signature move. A brass aperture opens across the first viewport of scroll
 * while the device inside settles from oversized to actual size, the vignette
 * lifts, and the commercial detail resolves underneath.
 *
 * Why it does not take the scroll away from you:
 *  - the outer container has a **real height** (175 vh) and the stage is
 *    `position: sticky`. There is no wheel interception, no scroll library and no
 *    snap, so a flick scrolls straight past it like any other page;
 *  - everything is a pure function of a 0→1 progress value, which makes it
 *    perfectly reversible — scroll back up and the object returns through the O;
 *  - only `transform` and `opacity` animate, so no frame does layout work.
 *
 * Under reduced motion it renders the resolved composition with no animation at
 * all: full-size device, all copy present, CTA visible. Nothing here is
 * motion-only.
 */

export interface HeroProduct {
  slug: string;
  name: string;
  render: RenderKind;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  fromTransfer: number;
  instalment: number;
  instalmentCount: number;
}

export function Hero({ product }: { product: HeroProduct }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  /* The aperture opens past the viewport; the device settles to its real size. */
  const apertureScale = useTransform(scrollYProgress, [0, 0.85], [1, 3.1]);
  const apertureOpacity = useTransform(scrollYProgress, [0, 0.55, 0.9], [1, 0.8, 0]);
  const deviceScale = useTransform(scrollYProgress, [0, 0.6], [1.28, 1]);
  const deviceY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  /* A slow rotation on the Y axis, so the object reads as a solid in space. */
  const deviceRotate = useTransform(scrollYProgress, [0, 1], [-7, 4]);
  const titleY = useTransform(scrollYProgress, [0, 0.6], [0, -120]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  /**
   * The commercial strip is visible from the first frame.
   *
   * It used to fade in from 0 across the first half of the scroll, which looked
   * elegant and cost sales: a visitor arriving from an Instagram story saw a
   * beautiful object and no price, no financing and no way to buy until they
   * scrolled. On mobile that is the entire first screen. It now only *rises*
   * slightly — motion that decorates, never motion that withholds. This is also
   * what docs/creative-direction.md §9 commits to: price and financing are never
   * ambiguous for a single frame.
   */
  const detailOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0.9]);
  const detailY = useTransform(scrollYProgress, [0, 0.4], [10, 0]);
  const vignette = useTransform(scrollYProgress, [0, 0.7], [0.7, 0.15]);

  /* Reduced motion: the resolved state, as a static value. */
  const motionProps = reduced
    ? {
        aperture: { scale: 2.2, opacity: 0.35 },
        device: { scale: 1, y: 0, rotateY: 0 },
        title: { y: 0, opacity: 1 },
        detail: { opacity: 1, y: 0 },
        vignette: 0.3,
      }
    : null;

  return (
    <div ref={ref} className="relative h-[175vh]">
      <section
        aria-labelledby="hero-heading"
        className="sticky top-0 flex h-[100svh] flex-col overflow-hidden"
      >
        <Ledger />

        {/* Vignette: a single radial, the only gradient allowed on a surface. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: motionProps ? motionProps.vignette : vignette,
            background:
              'radial-gradient(110% 80% at 68% 45%, transparent 28%, var(--color-ink-sunken) 100%)',
          }}
        />

        {/*
          The composition: a left-weighted editorial stack against a
          right-weighted object, on one grid. Apple centres; we do not.

          The object gets its own column rather than sitting behind the type —
          an earlier version centred it under the headline, where it was simply
          invisible. "Product as hero" has to mean the product is actually
          visible.
        */}
        <div className="u-container relative z-10 grid flex-1 items-center gap-8 pt-[calc(var(--header-h)+1rem)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          {/* ----------------------------- EDITORIAL -------------------------- */}
          <motion.div
            className="order-2 min-w-0 lg:order-1"
            style={motionProps ? motionProps.title : { y: titleY, opacity: titleOpacity }}
          >
            <p className="u-label mb-4">Owner Store · Argentina</p>

            <h1 id="hero-heading" className="u-display text-hero">
              <span className="block">Owner</span>
              <span className="block text-fg-dim">Technology</span>
              <span className="block">
                <span className="u-editorial pr-[0.06em] text-accent normal-case">
                  redefined
                </span>
                <span className="text-accent">.</span>
              </span>
            </h1>
          </motion.div>

          {/* ------------------------------- STAGE ---------------------------- */}
          <div className="relative order-1 grid min-w-0 place-items-center lg:order-2">
            <motion.div
              aria-hidden="true"
              className="aperture absolute"
              style={{
                ...(motionProps
                  ? motionProps.aperture
                  : { scale: apertureScale, opacity: apertureOpacity }),
                ['--aperture-size' as string]: 'min(66vw, 28rem, 38vh)',
              }}
            />

            <motion.div
              className="relative h-[min(38vh,20rem)] w-full sm:h-[min(44vh,24rem)] lg:h-[min(60vh,32rem)]"
              style={
                motionProps
                  ? motionProps.device
                  : { scale: deviceScale, y: deviceY, rotateY: deviceRotate }
              }
            >
              <ProductRender
                kind={product.render}
                color={product.color}
                productName={product.name}
                className="h-full w-full [transform-style:preserve-3d]"
                specular
                priority
              />
            </motion.div>
          </div>
        </div>

        {/* ----------------------------- COMMERCIAL --------------------------- */}
        <motion.div
          className="u-container relative z-10 shrink-0 pb-[clamp(1rem,4vh,2.5rem)]"
          style={motionProps ? motionProps.detail : { opacity: detailOpacity, y: detailY }}
        >
          <div className="flex flex-col gap-5 border-t border-line pt-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="u-label">En foco</p>
              <p className="u-display-tight mt-2 text-h4">{product.name}</p>
              <p className="u-mono mt-1.5 text-tiny text-fg-dim">
                Desde {formatARS(product.fromTransfer)} con transferencia ·{' '}
                <span className="text-accent">
                  {product.instalmentCount} cuotas de {formatARS(product.instalment)}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ButtonLink href={`/producto/${product.slug}`} size="lg">
                Ver el {product.name}
              </ButtonLink>
              <ButtonLink href="/tienda" variant="secondary" size="lg">
                Todo el catálogo
              </ButtonLink>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
