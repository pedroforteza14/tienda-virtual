/**
 * Deterministic colour arithmetic for the device renders.
 *
 * Kept in plain JS rather than CSS `color-mix()` so that the computed values can
 * go straight into SVG gradient stops and be identical on the server and the
 * client — a hydration mismatch inside a gradient is a visible flash.
 */

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parse(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `amount` in [-1, 1]: positive lightens toward white, negative darkens. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  if (amount >= 0) {
    return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
  }
  const factor = 1 + amount;
  return toHex([r * factor, g * factor, b * factor]);
}

/**
 * Sanitise a React `useId()` value into something usable as an SVG id.
 *
 * `useId()` returns values like `«r3»` or `:r3:`, and those characters are not
 * valid inside a `url(#…)` reference. Stripping to `[A-Za-z0-9]` keeps the
 * uniqueness and makes the result referenceable.
 */
export function defsId(reactId: string): string {
  return `o${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
}
