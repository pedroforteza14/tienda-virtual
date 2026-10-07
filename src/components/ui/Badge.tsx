import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Status pill.
 *
 * Every variant pairs a colour with text, because colour alone is not a signal
 * (docs/design-system.md, accessibility baseline). "In stock" is green *and* says
 * "En stock".
 */

export type BadgeTone = 'neutral' | 'ok' | 'low' | 'out' | 'brass';

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-fg-dim border-line',
  ok: 'text-signal-ok border-[color-mix(in_oklab,var(--color-signal-ok)_45%,transparent)]',
  low: 'text-signal-low border-[color-mix(in_oklab,var(--color-signal-low)_45%,transparent)]',
  out: 'text-fg-faint border-line line-through decoration-1',
  brass: 'text-accent border-[color-mix(in_oklab,var(--accent)_50%,transparent)]',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'u-mono inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2 py-1',
        'text-nano uppercase tracking-[0.14em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Stock state, derived from a number so every surface says the same thing. */
export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="out">Sin stock</Badge>;
  if (stock <= 3) {
    return (
      <Badge tone="low">
        Últimas {stock} {stock === 1 ? 'unidad' : 'unidades'}
      </Badge>
    );
  }
  return <Badge tone="ok">En stock</Badge>;
}
