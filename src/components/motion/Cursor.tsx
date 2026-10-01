'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

/**
 * A 6 px brass dot that lags the pointer and dilates over interactive elements.
 *
 * The rule that matters: **the system cursor stays visible underneath.** Hiding
 * it is a real accessibility failure — people with low vision rely on the OS
 * cursor, which can be enlarged and high-contrast at the system level, and a
 * custom replacement cannot honour any of that. So this is an *addition*, never a
 * substitute.
 *
 * It also does not render at all on touch devices, under reduced motion, or
 * before the first mouse movement — so a phone never pays for it.
 */
export function Cursor() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const [hot, setHot] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // ~80 ms of lag: present enough to feel alive, not enough to feel broken.
  const springX = useSpring(x, { stiffness: 420, damping: 34, mass: 0.35 });
  const springY = useSpring(y, { stiffness: 420, damping: 34, mass: 0.35 });

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    function onMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return;
      x.set(event.clientX);
      y.set(event.clientY);
      setActive(true);

      const target = event.target;
      setHot(
        target instanceof Element &&
          target.closest('a, button, [role="button"], input, select, textarea, label') !== null,
      );
    }

    function onLeave() {
      setActive(false);
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced, x, y]);

  if (reduced || !active) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[90] hidden rounded-full border border-[var(--accent)] mix-blend-screen lg:block"
      style={{ x: springX, y: springY, translateX: '-50%', translateY: '-50%' }}
      animate={{
        width: hot ? 28 : 6,
        height: hot ? 28 : 6,
        opacity: hot ? 0.9 : 0.6,
        backgroundColor: hot ? 'transparent' : 'var(--accent)',
      }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}
