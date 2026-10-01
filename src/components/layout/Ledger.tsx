import { cn } from '@/lib/utils/cn';

/**
 * The Ledger — a visible 12-column hairline grid with monospace coordinates in
 * the margin, so the page reads as a technical drawing.
 *
 * Purely decorative: `aria-hidden`, no focus, no semantics. Hidden below `lg` by
 * CSS, where it would register as noise rather than texture.
 */
export function Ledger({ className, marks = true }: { className?: string; marks?: boolean }) {
  return (
    <div aria-hidden="true" className={cn('ledger', className)}>
      {marks ? (
        <div className="u-container relative h-full">
          {['01', '04', '07', '10', '12'].map((mark, index) => (
            <span
              key={mark}
              className="ledger-mark"
              style={{ left: `calc(${(index * 11) / 4}% + ${index * 2}rem)` }}
            >
              {mark}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
