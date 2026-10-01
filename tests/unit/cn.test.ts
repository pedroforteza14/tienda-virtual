import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

/**
 * A regression rail for a bug that was silent, widespread, and only visible in a
 * screenshot.
 *
 * `tailwind-merge` resolves conflicts by class *group*. It cannot infer a group
 * for a custom name, so `text-h3` (a size) and `text-accent` (a colour) looked
 * like the same utility and it discarded one of them — on every element in the
 * application that set both. Nothing failed; the type was just the wrong size.
 *
 * `cn` now declares both scales. These tests make sure that stays true.
 */
describe('cn — class group resolution', () => {
  it('keeps a font size and a colour together', () => {
    for (const [size, color] of [
      ['text-tiny', 'text-fg-dim'],
      ['text-h3', 'text-accent'],
      ['text-hero', 'text-fg'],
      ['text-micro', 'text-signal-err'],
    ] as const) {
      expect(cn(size, color), `${size} + ${color}`).toContain(size);
      expect(cn(size, color), `${size} + ${color}`).toContain(color);
      // Order must not matter.
      expect(cn(color, size)).toContain(size);
      expect(cn(color, size)).toContain(color);
    }
  });

  it('still resolves two sizes last-wins', () => {
    expect(cn('text-tiny', 'text-h3')).toBe('text-h3');
    expect(cn('text-hero text-body')).toBe('text-body');
  });

  it('still resolves two colours last-wins', () => {
    expect(cn('text-fg', 'text-accent')).toBe('text-accent');
    expect(cn('text-signal-ok text-signal-err')).toBe('text-signal-err');
  });

  it('resolves ordinary conflicts, which is why the library is here at all', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8');
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent');
    expect(cn('border-line', 'border-line-strong')).toBe('border-line-strong');
  });

  it('keeps non-conflicting utilities and honours conditionals', () => {
    expect(cn('flex items-center', 'gap-2')).toBe('flex items-center gap-2');
    expect(cn('flex', false && 'hidden', undefined, 'gap-2')).toBe('flex gap-2');
  });

  it('does not treat a variant-prefixed utility as conflicting with the bare one', () => {
    expect(cn('text-fg', 'hover:text-accent')).toBe('text-fg hover:text-accent');
    expect(cn('text-tiny', 'md:text-h3')).toBe('text-tiny md:text-h3');
  });
});
