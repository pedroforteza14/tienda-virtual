'use client';

import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Magnetic hover: the content leans up to a few pixels toward the pointer.
 *
 * Constraints that keep it from being annoying:
 *  - **the hit area never moves.** Only the inner span translates, so the button
 *    does not slide out from under the cursor — the classic magnetic-button bug
 *    that makes a CTA feel evasive;
 *  - **3 px maximum.** Any more and it reads as a gimmick;
 *  - **fine pointers only.** Checked at the event level rather than by media
 *    query, so a hybrid device behaves correctly whichever input is in use;
 *  - **off entirely under reduced motion.**
 */
export function Magnetic({
  children,
  strength = 3,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();

  if (reduced) return <span className={className}>{children}</span>;

  return (
    <span
      ref={ref}
      className={className}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const element = ref.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        setOffset({
          x: Math.max(-1, Math.min(1, dx)) * strength,
          y: Math.max(-1, Math.min(1, dy)) * strength,
        });
      }}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
    >
      <motion.span
        className="block"
        animate={offset}
        transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.4 }}
      >
        {children}
      </motion.span>
    </span>
  );
}
