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
  const detailOpacity = useTransform(scrollYProgress, [0.18, 0.5], [0, 1]);
  const detailY = useTransform(scrollYProgress, [0.18, 0.5], [28, 0]);
  const vignette = useTransform(scrollYProgress, [0, 0.7], [0.85, 0.2]);

  /* Reduced motion: the resolved state, as a static value. */
  const motionProps = reduced
    ? {
        aperture: { scale: 2.2, opacity: 0.35 },
        device: { scale: 1, y: 0, rotateY: 0 },
        title: { y: 0, opacity: 1 },
        detail: { opacity: 1, y: 0 },
        vignette: 0.35,
      }
    : null;

  return (
    <div ref={ref} className="relative h-[175vh]">
      <section
        aria-labelledby="hero-heading"
        className="sticky top-0 flex h-[100svh] flex-col justify-between overflow-hidden"
      >
        <Ledger />

        {/* Vignette: a single radial, the only gradient allowed on a surface. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: motionProps ? motionProps.vignette : vignette,
            background:
              'radial-gradient(120% 90% at 50% 42%, transparent 20%, var(--color-ink-sunken) 100%)',
          }}
        />

        {/* ------------------------------- STAGE ------------------------------ */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <motion.div
            aria-hidden="true"
            className="aperture"
            style={{
              ...(motionProps ? motionProps.aperture : { scale: apertureScale, opacity: apertureOpacity }),
              ['--aperture-size' as string]: 'min(78vw, 42vh)',
            }}
          />

          <motion.div
            className="relative h-[58vh] w-[min(62vw,22rem)]"
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

        {/* ------------------------------ EDITORIAL --------------------------- */}
        <motion.div
          className="u-container relative z-10 pt-[calc(var(--header-h)+clamp(2rem,8vh,5rem))]"
          style={motionProps ? motionProps.title : { y: titleY, opacity: titleOpacity }}
        >
          <p className="u-label mb-5">Owner Store · Argentina</p>

          {/* The hero stack is left-weighted and off-centre, against the
              right-weighted object. Apple centres; we do not. */}
          <h1 id="hero-heading" className="u-display max-w-[11ch] text-[var(--text-step-7)]">
            <span className="block">Owner</span>
            <span className="block text-[var(--text-dim)]">Technology</span>
            <span className="block">
              <span className="u-editorial pr-[0.08em] text-[var(--accent)] normal-case">
                redefined
              </span>
              .
            </span>
          </h1>
        </motion.div>

        {/* ----------------------------- COMMERCIAL --------------------------- */}
        <motion.div
          className="u-container relative z-10 pb-[clamp(1.5rem,5vh,3rem)]"
          style={motionProps ? motionProps.detail : { opacity: detailOpacity, y: detailY }}
        >
          <div className="flex flex-col gap-5 border-t border-[var(--line)] pt-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="u-label">En foco</p>
              <p className="u-display-tight mt-2 text-[var(--text-step-2)]">{product.name}</p>
              <p className="u-mono mt-1.5 text-[var(--text-step--1)] text-[var(--text-dim)]">
                Desde {formatARS(product.fromTransfer)} con transferencia ·{' '}
                <span className="text-[var(--accent)]">
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
