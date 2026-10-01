import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

/**
 * The button.
 *
 * Presentational and hook-free on purpose, so it renders inside Server
 * Components without dragging a client boundary along. The magnetic
 * microinteraction lives in `<Magnetic>` and wraps this, which keeps the
 * expensive part opt-in.
 *
 * Accessibility contract:
 *  - always a real `<button>` or `<a>`; never a `<div onClick>`;
 *  - `loading` sets `aria-busy` and disables, and keeps the label in the DOM so
 *    a screen reader does not lose its place;
 *  - the press state is `scale(.985)`, which no assistive tech has to care about.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.12em] ' +
  'whitespace-nowrap rounded-[var(--radius-sm)] select-none ' +
  'transition-[background-color,color,border-color,transform,opacity] duration-[var(--dur-fast)] ' +
  'ease-[var(--ease-out-owner)] active:scale-[0.985] ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';

const VARIANTS: Record<ButtonVariant, string> = {
  // Brass. 6.28:1 against ink both ways.
  primary:
    'on-accent bg-accent text-on-accent hover:bg-accent-hover ' +
    'border border-transparent',
  secondary:
    'border border-line-strong text-fg hover:border-accent ' +
    'hover:text-accent-hover bg-transparent',
  ghost: 'text-fg-dim hover:text-fg bg-transparent border border-transparent',
  danger:
    'border border-[color-mix(in_oklab,var(--color-signal-err)_60%,transparent)] ' +
    'text-signal-err hover:bg-[color-mix(in_oklab,var(--color-signal-err)_12%,transparent)]',
};

const SIZES: Record<ButtonSize, string> = {
  // 44px minimum touch target on every size, per docs/design-system.md.
  sm: 'min-h-11 px-4 text-micro',
  md: 'min-h-12 px-6 text-tiny',
  lg: 'min-h-14 px-8 text-tiny',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to the container. The default on mobile for primary actions. */
  block?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      <span className={cn(loading && 'opacity-60')}>{children}</span>
    </button>
  );
});

/** The aperture, drawing itself — the brand's loading state. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-3 inline-block size-3.5 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
  /** Set for links that leave the site. Adds `rel` and an accessible hint. */
  external?: boolean;
  'aria-label'?: string;
  prefetch?: boolean;
}

/** Same visual language, correct semantics: navigation is a link, not a button. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  external = false,
  prefetch,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className);

  if (external) {
    return (
      <a
        href={href}
        className={classes}
        // `noopener` is the security-relevant half: without it the opened page
        // can navigate ours through `window.opener`.
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    );
  }

  return (
    <Link href={href} className={classes} prefetch={prefetch} {...rest}>
      {children}
    </Link>
  );
}
