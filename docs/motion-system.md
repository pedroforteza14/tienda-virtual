# OWNER — Motion System

Motion here does three jobs and no others: **explain space** (where a thing came from), **confirm
state** (something happened), and **direct attention** (what matters next). Anything that does none
of those gets deleted.

---

## Primitives

| Token | Value | Use |
| --- | --- | --- |
| `--dur-instant` | 90 ms | Press, toggle. |
| `--dur-fast` | 180 ms | Hover, focus, colour. |
| `--dur-base` | 320 ms | Reveals, variant cross-fades. |
| `--dur-slow` | 560 ms | Drawers, overlays, page transitions. |
| `--dur-cinema` | 900 ms | Hero resolve. Once per visit. |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Default: fast out, long settle. Everything entering. |
| `--ease-in` | `cubic-bezier(.7,0,.84,0)` | Everything leaving. |
| `--ease-inout` | `cubic-bezier(.76,0,.24,1)` | Travel between two states. |
| `--ease-spring` | spring(260, 26) | Magnetic cursor, stepper, drawer handle. Via `motion` only. |

**Distance is inverse to duration.** A 4 px hover lift is 180 ms; a full-height drawer is 560 ms.
Nothing travels more than ~120 px without also scaling.

---

## The four signature moves

1. **Aperture open** (`/` hero) — the brass ring scales `0.2 → 2.4` across the first viewport of
   scroll while the device inside scales `1.35 → 1` and the vignette lifts. Scroll-linked, so it is
   perfectly reversible: scroll up and the object returns through the O.
2. **Mask reveal** — `clip-path: inset()` driven from a diagonal, with the brass hairline riding
   the mask edge. Used for section ingress and the cutaway. Never on text that matters (a stalled
   mask would hide content — text uses opacity + 12 px rise instead).
3. **Spec rail draw** — the rule scales `scaleX(0) → 1` from the left over 480 ms with a 40 ms
   stagger per row, mono label fading in behind it. This is the site's rhythm signature.
4. **Specular sweep** — a soft linear gradient crosses a device render on hover and while it is
   scroll-pinned, so the object reads as a lit physical thing. 2 % opacity on ink.

---

## Scroll choreography

Implementation rules, in priority order:

1. **Never take the scroll.** Native scrolling only. No `scroll-behavior: smooth` on the root, no
   Lenis/Locomotive, no wheel interception, no scroll-snap on a long page. A pinned section is
   `position: sticky` inside a container with a real height, so a flick skips it instantly.
2. **Scroll drives progress, not time.** Every pinned section is a pure function of a 0→1
   progress value, which makes it reversible and interruptible by construction.
3. **Progress comes from `useScroll`** (`motion`), composited through `transform`/`opacity` only.
   No scroll handler ever reads layout, so there is no forced reflow.
4. **Pinned sections are ≤ 250 vh** and there are **at most two** on a page. Beyond that it stops
   being narrative and starts being a hostage situation.
5. **Below `lg`, pinning is replaced** by a `scroll-snap-type: x mandatory` carousel with real
   overflow — pinning a vertical scroller to drive horizontal travel is hostile on touch.
6. **Nothing below the fold animates until it is within 15 % of the viewport**, via
   `whileInView` with `once: true`. Re-animating on every pass is noise.

### The one experimental section
`ProductRail` (`src/features/home/ProductRail.tsx`) pins for 220 vh and translates a 4-device rail
horizontally: iPhone → zoom to the camera plateau → cutaway with spec rails → hand-off to Mac.
That is the brief's §6 example, built. It degrades to a snap carousel on touch and to a static
grid under reduced motion.

---

## Microinteractions

- **Magnetic buttons** — the label translates up to 3 px toward the pointer, with a spring. Pointer
  devices only (`(hover: hover) and (pointer: fine)`), disabled under reduced motion, and the
  element's own hit area never moves.
- **Navigation underline** — a brass rule scales from the centre, 180 ms. On the active item it is
  already drawn.
- **Product card** — the aperture dilates 8 %, the device lifts 6 px and rotates `1.5deg` on the
  Y axis, and the secondary image cross-fades. Information is revealed by opacity, not by layout,
  so nothing reflows.
- **Cursor** — a 6 px brass dot that lags the pointer by ~80 ms and grows to 28 px over
  interactive elements. Desktop and fine-pointer only. It never replaces the system cursor, which
  stays visible underneath — a hidden system cursor is an accessibility failure.
- **Press** — `scale(0.985)` for 90 ms. On everything pressable, no exceptions.
- **Variant change** — the old render cross-fades out over 120 ms while the new one fades in over
  200 ms with a 1 % scale. The price *never* animates position; mono tabular figures swap in place.

---

## Reduced motion

`prefers-reduced-motion: reduce` is honoured in three layers, because any one alone leaks:

1. **CSS** — a global rule forces `animation-duration`/`transition-duration` to `0.01ms` and
   disables `scroll-behavior`.
2. **React** — `useReducedMotion()` gates every `motion` component, and scroll-progress values are
   pinned to their resolved end state.
3. **Design** — each narrative section has a defined static composition that is *complete*: all
   text present, all specs readable, the product at its final scale. Nothing is motion-only.

The cursor, the magnetic effect, the specular sweep and the parallax do not render at all under
reduced motion.

---

## Performance guardrails

- Animate `transform` and `opacity` only. `clip-path` is permitted on composited layers; it is
  measured, and it is never applied to a scrolling container.
- `will-change` is applied on interaction start and removed on end — never left in a stylesheet.
- At most **three** elements animate concurrently in a viewport.
- `motion` is imported per-route (`optimizePackageImports`), never from a shared client shell. The
  catalogue, checkout and legal routes ship **no** animation JS. Measured first-load JS from
  `next build`: legal ~106 kB, catalogue 125 kB, checkout 137 kB, discovery 167 kB, home 168 kB,
  product ~170 kB — against a 103 kB framework baseline. Only the three routes with a real narrative
  pay for motion. This is a budget, not an observation: a magnetic hover on the catalogue's
  quick-add button cost 38 kB there and was removed rather than rationalised. `docs/design-review.md`
  §5 is honest that 168 kB on the home page is the price of the narrative, not a good number.
- Budget: no scroll-linked frame may exceed **8 ms** on a mid-range Android. If a move cannot hold
  that, it is cut rather than throttled.
