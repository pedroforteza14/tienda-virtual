'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils/cn';

/**
 * Section ingress: opacity plus a short rise.
 *
 * Opacity-and-rise rather than a `clip-path` mask, for text that matters: if a
 * mask animation stalls (a backgrounded tab, a dropped frame budget), masked text
 * is *invisible*, while text mid-fade is merely faint. Masks are reserved for
 * imagery, where that failure mode is cosmetic.
 *
 * `once: true` — re-animating on every scroll pass is noise, not polish.
 * `amount: 0.15` — fires when 15 % is visible, so a tall section does not wait
 * until it is half-way up the viewport.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 14,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  if (reduced) {
    // Not "animate faster" — render the resolved state, with no animation at all.
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.56, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}

/** Staggered children. The parent gates, the children inherit the delay. */
export function RevealGroup({
  children,
  className,
  stagger = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.1 }}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </Component>
  );
}
