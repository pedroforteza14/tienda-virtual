'use client';

import { MAX_QTY_PER_LINE } from '@/config/constants';
import { cn } from '@/lib/utils/cn';

/**
 * Quantity control.
 *
 * Two real buttons plus a real number input, so it works with a keyboard, with a
 * screen reader, and with a phone keypad. The clamp is applied here *and* on the
 * server — this is a convenience, not a control (docs/threat-model.md §4.1).
 */
export function QuantityStepper({
  value,
  max,
  onChange,
  disabled = false,
  label,
  className,
}: {
  value: number;
  /** Available stock. The effective ceiling is `min(max, MAX_QTY_PER_LINE)`. */
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Names the product, so "menos" is not ambiguous with five of them on screen. */
  label: string;
  className?: string;
}) {
  const ceiling = Math.max(1, Math.min(max, MAX_QTY_PER_LINE));
  const clamp = (next: number) => Math.max(1, Math.min(ceiling, next));

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--line-strong)]',
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= 1}
        aria-label={`Quitar una unidad de ${label}`}
        className="grid size-11 place-items-center text-[var(--text-dim)] transition-colors hover:text-[var(--text)] disabled:opacity-40 disabled:hover:text-[var(--text-dim)]"
      >
        <span aria-hidden="true">−</span>
      </button>

      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={ceiling}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={`Cantidad de ${label}`}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        className="u-mono w-10 border-0 bg-transparent text-center text-[var(--text-step--1)] text-[var(--text)] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= ceiling}
        aria-label={`Agregar una unidad de ${label}`}
        className="grid size-11 place-items-center text-[var(--text-dim)] transition-colors hover:text-[var(--text)] disabled:opacity-40 disabled:hover:text-[var(--text-dim)]"
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
