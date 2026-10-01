import { cn } from '@/lib/utils/cn';

/**
 * The OWNER lockup: a brass aperture ring, then the word.
 *
 * The ring *is* the brand (docs/creative-direction.md §3) — it is the same device
 * that opens on the home hero to reveal the product. Keeping it in the wordmark is
 * what makes the connection legible.
 *
 * Set in Archivo at width 112 with tight tracking. Never italic, never coloured,
 * never placed on brass.
 */
export function Wordmark({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-block flex-none rounded-full border border-accent',
          small ? 'size-2' : 'size-2.5',
        )}
      />
      <span
        className={cn(
          'u-display leading-none',
          small ? 'text-[0.875rem]' : 'text-[1.0625rem]',
        )}
        style={{ fontStretch: '112%', letterSpacing: '-0.03em' }}
      >
        OWNER
      </span>
    </span>
  );
}
