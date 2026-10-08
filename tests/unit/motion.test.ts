import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUR, EASE_IN, EASE_INOUT, EASE_OUT } from '@/lib/motion/easing';

/**
 * The two halves of the motion tokens have to agree.
 *
 * `motion` cannot read a CSS custom property, so every curve exists twice — once
 * in `tokens.css` and once as numbers for JavaScript. Nothing linked them, so
 * six components carried `[0.16, 1, 0.3, 1]` written out by hand and a change to
 * the token would have moved the CSS while leaving the JavaScript behind.
 */

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

function curve(name: string): number[] {
  const match = new RegExp(`--${name}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} is not a cubic-bezier in tokens.css`);
  return match[1].split(',').map((n) => Number(n.trim()));
}

function durationMs(name: string): number {
  const match = new RegExp(`--dur-${name}:\\s*(\\d+)ms`).exec(css);
  if (!match?.[1]) throw new Error(`--dur-${name} not found`);
  return Number(match[1]);
}

describe('motion tokens', () => {
  it('matches the CSS curves exactly', () => {
    expect([...EASE_OUT]).toEqual(curve('ease-out-owner'));
    expect([...EASE_IN]).toEqual(curve('ease-in-owner'));
    expect([...EASE_INOUT]).toEqual(curve('ease-inout-owner'));
  });

  it('matches the CSS durations, converted to the seconds motion counts in', () => {
    for (const [name, seconds] of Object.entries(DUR)) {
      expect(Math.round(seconds * 1000), name).toBe(durationMs(name));
    }
  });

  it('is the only place a curve is written out', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        if (full.endsWith('lib/motion/easing.ts')) continue;
        const body = readFileSync(full, 'utf8');
        // Any four-number bézier literal, not just the one we happen to use.
        for (const match of body.matchAll(/\[\s*0?\.\d+\s*,\s*[01](\.\d+)?\s*,\s*0?\.\d+\s*,\s*[01](\.\d+)?\s*\]/g)) {
          offenders.push(`${full.split('/src/')[1]}: ${match[0]}`);
        }
      }
    };
    walk(new URL('../../src', import.meta.url).pathname);

    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });
});
