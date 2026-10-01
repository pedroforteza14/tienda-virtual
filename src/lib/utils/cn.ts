import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional classes with conflict resolution.
 *
 * `clsx` handles the conditionals; `twMerge` makes the *last* conflicting utility
 * win. Without it, `cn('px-4', props.className)` silently ignores a caller's
 * `px-8` depending on CSS source order — a real bug that looks like a styling
 * mystery.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
