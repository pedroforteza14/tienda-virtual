import { cn } from '@/lib/utils/cn';
import type { Spec } from '@/types/catalog';

/**
 * Specifications as numbered rules, never as cards.
 *
 * This is the site's second-most-recognisable device after the aperture, and the
 * reason the catalogue never turns into card soup. Semantically a description
 * list, so the label→value relationship survives for a screen reader; the index
 * numeral is decoration and is hidden from the accessibility tree.
 */
export function SpecRails({
  specs,
  className,
  /** 0→1. Drives the rule draw-in; 1 is the resolved state. */
  progress = 1,
}: {
  specs: readonly Spec[];
  className?: string;
  progress?: number;
}) {
  return (
    <dl className={cn('w-full', className)}>
      {specs.map((spec, index) => (
        <div
          key={spec.index}
          className="spec-rail"
          style={
            {
              // Staggered per row, so the rails draw as a sequence rather than
              // all at once. Resolved to 1 under reduced motion by CSS.
              '--rail-progress': Math.max(0, Math.min(1, progress * specs.length - index)),
            } as React.CSSProperties
          }
        >
          <span aria-hidden="true" className="u-mono text-micro text-accent">
            {spec.index}
          </span>
          <dt className="u-label text-fg-dim">{spec.label}</dt>
          <dd className="u-mono text-tiny text-fg md:col-start-3">
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
