import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Our type scale and semantic colour scale, declared to `tailwind-merge`.
 *
 * Without this, `tailwind-merge` cannot tell `text-h3` (a size) from `text-accent`
 * (a colour) — both are just `text-<unknown>` — so it treats them as conflicting
 * and **drops one**. `cn('text-tiny text-fg-dim')` returned `'text-fg-dim'`, losing
 * the font size, silently, on every element that set both.
 *
 * Declaring the groups makes a size and a colour coexist while two sizes (or two
 * colours) still resolve last-wins, which is the whole point of the library.
 * `tests/unit/cn.test.ts` locks this down.
 */
const FONT_SIZES = [
  'micro',
  'tiny',
  'body',
  'lead',
  'h1',
  'h2',
  'h3',
  'h4',
  'display',
  'hero',
] as const;

const SEMANTIC_COLORS = [
  'fg',
  'fg-dim',
  'fg-faint',
  'accent',
  'accent-hover',
  'on-accent',
  'surface',
  'surface-raised',
  'surface-sunken',
  'line',
  'line-strong',
  'focus',
  'signal-ok',
  'signal-low',
  'signal-err',
  'signal-err-deep',
] as const;

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
      'text-color': [{ text: [...SEMANTIC_COLORS] }],
    },
  },
});

/**
 * Conditional classes with conflict resolution.
 *
 * `clsx` handles the conditionals; the configured `tailwind-merge` makes the last
 * genuinely-conflicting utility win. Without it, `cn('px-4', props.className)`
 * silently ignores a caller's `px-8` depending on CSS source order — a real bug
 * that presents as a styling mystery.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
