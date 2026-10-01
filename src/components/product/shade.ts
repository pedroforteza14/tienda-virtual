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
 * A stable id suffix for SVG `<defs>`.
 *
 * SVG ids are document-global, so two renders must not accidentally reference
 * each other's gradients. Deriving the id from the inputs means two instances
 * only ever collide when their gradient definitions are *identical*, which is
 * harmless — and it avoids `useId()`, which would force this whole tree to be a
 * client component.
 */
export function defsId(parts: (string | boolean | undefined)[]): string {
  let hash = 0x811c9dc5;
  const key = parts.join('|');
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
