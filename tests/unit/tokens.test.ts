import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrast, asserted against the real stylesheet.
 *
 * `docs/design-system.md` publishes a table of ratios. A table in a document rots;
 * this test reads the actual values out of `src/styles/tokens.css` and recomputes
 * them, so a palette edit that breaks AA **fails the build** instead of quietly
 * shipping.
 *
 * This caught the first error red (`#A8443A`, 3.33:1) during development.
 */

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`token --${name} not found in tokens.css`);
  return match[1];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const INK = () => token('color-ink');
const RAISED = () => token('color-ink-raised');
const BONE = () => token('color-bone');

describe('palette contrast', () => {
  it('body text on the dark ground reaches AAA', () => {
    expect(ratio(token('color-bone'), INK())).toBeGreaterThanOrEqual(7);
  });

  it('secondary text reaches AA on both dark surfaces', () => {
    expect(ratio(token('color-bone-dim'), INK())).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('color-bone-dim'), RAISED())).toBeGreaterThanOrEqual(4.5);
  });

  it('the brass accent reaches AA as text and as a button background', () => {
    expect(ratio(token('color-brass'), INK())).toBeGreaterThanOrEqual(4.5);
    // The primary CTA is ink on brass, so it has to work in both directions.
    expect(ratio(INK(), token('color-brass'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring is clearly visible against both grounds', () => {
    // 3:1 is the WCAG non-text contrast minimum for a focus indicator.
    expect(ratio(token('color-brass-bright'), INK())).toBeGreaterThanOrEqual(3);
    expect(ratio(token('color-brass-bright'), RAISED())).toBeGreaterThanOrEqual(3);
  });

  it('every status colour reaches AA as text', () => {
    for (const name of ['color-signal-ok', 'color-signal-low', 'color-signal-err']) {
      expect(ratio(token(name), INK()), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the light surface inverts cleanly', () => {
    expect(ratio(INK(), BONE())).toBeGreaterThanOrEqual(7);
  });

  it('the deep oxide is documented as non-text only, and is indeed too dark for text', () => {
    // If someone "fixes" this to pass, they have changed a border token into a
    // text token and should use --color-signal-err instead.
    expect(ratio(token('color-signal-err-deep'), INK())).toBeLessThan(4.5);
  });

  it('the faint token cannot carry text, which is why it is restricted to hairlines', () => {
    expect(ratio(token('color-bone-faint'), INK())).toBeLessThan(4.5);
  });
});

describe('token discipline', () => {
  it('defines every semantic alias a component is allowed to reference', () => {
    for (const alias of [
      '--surface',
      '--surface-raised',
      '--surface-sunken',
      '--text',
      '--text-dim',
      '--text-faint',
      '--accent',
      '--accent-hover',
      '--on-accent',
      '--line',
      '--line-strong',
      '--focus',
    ]) {
      expect(css, alias).toContain(`${alias}:`);
    }
  });

  it('redefines the whole semantic layer for the light surface', () => {
    const lightBlock = css.slice(css.indexOf("[data-surface='light']"));
    for (const alias of ['--surface', '--text', '--accent', '--on-accent', '--line', '--focus']) {
      expect(lightBlock, alias).toContain(`${alias}:`);
    }
  });

  it('defines the full fluid type scale and the motion primitives', () => {
    for (const name of [
      '--text-micro',
      '--text-tiny',
      '--text-body',
      '--text-lead',
      '--text-h4',
      '--text-h3',
      '--text-h2',
      '--text-h1',
      '--text-display',
      '--text-hero',
    ]) {
      expect(css, name).toContain(`${name}:`);
    }
    for (const name of ['--dur-instant', '--dur-fast', '--dur-base', '--dur-slow', '--dur-cinema']) {
      expect(css, name).toContain(name);
    }
    for (const name of ['--ease-out-owner', '--ease-in-owner', '--ease-inout-owner']) {
      expect(css, name).toContain(name);
    }
  });

  it('honours prefers-contrast and declares a light-surface block', () => {
    expect(css).toContain('prefers-contrast: more');
    expect(css).toContain("[data-surface='light']");
  });
});

/**
 * A regression rail for a bug that was invisible in review and obvious in a
 * screenshot.
 *
 * Font sizes were written as `text-[var(--text-hero)]`. Tailwind v4 cannot tell
 * whether an arbitrary `text-[…]` value is a length or a colour, and for an opaque
 * `var()` it resolves to **colour** — so every heading in the application silently
 * rendered at the inherited 16px while the markup looked perfectly correct. The
 * fix is to use the generated utilities (`text-hero`), which are typed.
 */
describe('type scale is applied through utilities, not arbitrary values', () => {
  const SIZE_TOKENS = [
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
  ];

  it('no source file sizes text with an arbitrary var()', async () => {
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
        const source = readFileSync(full, 'utf8');
        for (const token of SIZE_TOKENS) {
          if (source.includes(`text-[var(--text-${token})]`)) {
            offenders.push(`${full} → text-[var(--text-${token})]`);
          }
        }
        // The old scale must not come back either.
        if (source.includes('text-step-')) offenders.push(`${full} → legacy text-step-* token`);
      }
    };
    walk(new URL('../../src', import.meta.url).pathname);

    expect(offenders).toEqual([]);
  });
});

describe('global stylesheet guarantees', () => {
  /**
   * Comments are stripped first. These assertions are about what the stylesheet
   * *declares*, and the comments in `globals.css` quote the very patterns being
   * forbidden ("there is no `outline: none` anywhere") — which is exactly the kind
   * of false positive that teaches people to delete a test.
   */
  const globals = readFileSync(
    new URL('../../src/styles/globals.css', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('never disables a focus outline', () => {
    // The one thing that must never appear in this codebase.
    expect(globals).not.toMatch(/outline:\s*(none|0)/);
  });

  it('honours prefers-reduced-motion at the CSS layer', () => {
    expect(globals).toContain('prefers-reduced-motion: reduce');
    expect(globals).toMatch(/animation-duration:\s*0\.01ms/);
    expect(globals).toMatch(/transition-duration:\s*0\.01ms/);
  });

  it('does not set smooth scrolling on the root — that is how scroll-jacking starts', () => {
    expect(globals).not.toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/s);
  });

  it('defines the signature devices and the skip link', () => {
    for (const selector of ['.aperture', '.ledger', '.spec-rail', '.specular', '.skip-link', '.sr-only']) {
      expect(globals, selector).toContain(selector);
    }
  });
});
