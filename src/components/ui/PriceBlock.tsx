import { describeARS, formatARS, type Centavos } from '@/lib/money';
import { site } from '@/config/site';
import { cn } from '@/lib/utils/cn';

/**
 * Price presentation.
 *
 * Argentine retail quotes two prices for the same thing — a lower one for bank
 * transfer and the list price in interest-free instalments — and hiding either
 * one costs a sale. Both are always visible, with the transfer price leading
 * because it is the number people compare on.
 *
 * All figures are mono with `tabular-nums`: that is why a price does not shift
 * sideways when a configurator option changes. It also makes the digits
 * unambiguous, which matters at seven figures.
 *
 * Screen readers get `describeARS()` — "1.299.000 pesos argentinos" — because
 * "$1.299.000" is read as digit soup by most engines.
 */

export interface PriceBlockProps {
  list: Centavos;
  transfer: Centavos;
  instalment: Centavos;
  instalmentCount: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { main: 'text-[var(--text-step-1)]', sub: 'text-[var(--text-step--2)]' },
  md: { main: 'text-[var(--text-step-2)]', sub: 'text-[var(--text-step--1)]' },
  lg: { main: 'text-[var(--text-step-3)]', sub: 'text-[var(--text-step--1)]' },
} as const;

export function PriceBlock({
  list,
  transfer,
  instalment,
  instalmentCount,
  size = 'md',
  className,
}: PriceBlockProps) {
  const scale = SIZES[size];

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className={cn('u-mono font-semibold leading-none text-[var(--text)]', scale.main)}>
        <span aria-hidden="true">{formatARS(transfer)}</span>
        <span className="sr-only">
          Precio con transferencia: {describeARS(transfer)}
        </span>
      </p>

      <p className={cn('u-label normal-case tracking-[0.1em]', scale.sub)}>
        Precio transferencia · {site.commerce.transferDiscountPercent}% off
      </p>

      <p className={cn('u-mono mt-1 text-[var(--text-dim)]', scale.sub)}>
        <span aria-hidden="true">{formatARS(list)}</span>
        <span className="sr-only">Precio de lista: {describeARS(list)}.</span>{' '}
        <span className="text-[var(--text-faint)]">con tarjeta</span>
      </p>

      <p className={cn('u-mono text-[var(--accent)]', scale.sub)}>
        {instalmentCount} cuotas sin interés de <span aria-hidden="true">{formatARS(instalment)}</span>
        <span className="sr-only">{describeARS(instalment)}</span>
      </p>
    </div>
  );
}

/** Compact "desde" price, for cards. */
export function FromPrice({
  from,
  fromTransfer,
  className,
}: {
  from: Centavos;
  fromTransfer: Centavos;
  className?: string;
}) {
  return (
    <p className={cn('u-mono flex flex-wrap items-baseline gap-x-2', className)}>
      <span className="text-[var(--text-faint)] text-[var(--text-step--2)] uppercase tracking-[0.14em]">
        Desde
      </span>
      <span className="font-semibold text-[var(--text)] text-[var(--text-step-1)]" aria-hidden="true">
        {formatARS(fromTransfer)}
      </span>
      <span className="sr-only">Desde {describeARS(fromTransfer)} con transferencia.</span>
      <span className="text-[var(--text-faint)] text-[var(--text-step--2)]" aria-hidden="true">
        {formatARS(from)} con tarjeta
      </span>
    </p>
  );
}
