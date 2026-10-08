/**
 * The easing curves, in the one form JavaScript can use.
 *
 * `motion` takes a cubic-bézier as four numbers and cannot read a CSS custom
 * property, so the curves existed twice: `--ease-out-owner` in `tokens.css` and
 * the literal `[0.16, 1, 0.3, 1]` written out in six components. Two copies of
 * a design decision with no link between them is exactly the drift a token
 * system exists to prevent — tune the token and the JavaScript keeps the old
 * curve, silently, on the surfaces that animate most.
 *
 * This module is the JavaScript half of that token, and
 * `tests/unit/motion.test.ts` keeps the two halves honest by parsing the
 * stylesheet and comparing. The raw literal is banned from components there too.
 */

/** Entering: fast out, long settle. The default for anything arriving. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Leaving: slow start, quick exit.
 *
 * `docs/motion-system.md` has specified this for "everything leaving" from the
 * beginning and nothing used it: every `exit` in the application animated on
 * the entrance curve, which makes a dismissal linger when it should get out of
 * the way. A documented rule that no code follows is not a rule.
 */
export const EASE_IN = [0.7, 0, 0.84, 0] as const;

/** Travelling between two on-screen states. */
export const EASE_INOUT = [0.76, 0, 0.24, 1] as const;

/** Durations in seconds, matching `--dur-*`. `motion` counts in seconds. */
export const DUR = {
  instant: 0.09,
  fast: 0.18,
  base: 0.32,
  slow: 0.56,
  cinema: 0.9,
} as const;
