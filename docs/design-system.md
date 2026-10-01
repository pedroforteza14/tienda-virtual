# OWNER — Design System

Tokens are the contract. Components consume tokens; **no component hardcodes a colour, a radius, a
duration or a font size.** Source of truth: `src/styles/tokens.css`, exposed to Tailwind through
`@theme` so `bg-ink`, `text-bone-dim`, `border-graphite` and `font-mono` all resolve to the same
variables the hand-authored CSS uses.

---

## Colour

See `docs/creative-direction.md` §4 for the palette and the rationale. Mechanics:

- Semantic aliases sit on top of raw values: `--surface`, `--surface-raised`, `--text`,
  `--text-dim`, `--text-faint`, `--line`, `--accent`, `--accent-hover`, `--focus`.
- Components use **semantic** names only. `--brass` appears in `tokens.css` and nowhere else.
- The light surface (`/legal`, checkout confirmation) flips the semantic layer, not the components.

### Contrast — measured, not assumed
| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--bone` on `--ink` | **15.9 : 1** | AAA |
| `--bone-dim` on `--ink` | **7.6 : 1** | AAA body, AAA large |
| `--bone-faint` on `--ink` | **3.9 : 1** | Non-text / disabled only — never body copy |
| `--brass` on `--ink` | **6.4 : 1** | AA text, AAA large |
| `--ink` on `--brass` | **5.3 : 1** | AA — the primary CTA |
| `--signal-ok` on `--ink` | **5.1 : 1** | AA |
| `--signal-err` on `--ink` | **4.6 : 1** | AA |

`--bone-faint` is the one token that cannot carry text. It is used for hairline coordinates and
disabled affordances, both of which are duplicated in an accessible way.

---

## Space & grid

A single 4 px base, exposed as `--space-1` (4 px) … `--space-24` (96 px), plus two section
rhythms: `--section-y` (`clamp(5rem, 12vh, 9rem)`) and `--section-y-tight`.

The **Ledger** is 12 columns, `--gutter` (`clamp(1rem, 4vw, 2.5rem)`) outer margin, max content
width `--measure-max` (1480 px). `.ledger` paints the hairlines; `.ledger-marks` paints the
monospace margin coordinates. Both are `aria-hidden` and both disappear below `lg`.

Prose is capped at `--measure-prose` (62ch). Nothing readable is ever wider.

---

## Radius, line, elevation

`--r-xs` 2 px · `--r-sm` 4 px · `--r-md` 8 px · `--r-lg` 14 px · `--r-xl` 22 px · `--r-full` 999px.
Device bodies use their own real-world radii, not these.

Hairlines are `1px` at `--line`. **There are no drop shadows on ink.** Elevation is communicated by
surface lightness (`--surface` → `--surface-raised`) and by a single hairline. Shadows appear only
on the light surface, and only as `--shadow-sheet`.

---

## Components

Every one of these lives in `src/components/ui/`, is typed, forwards refs where a consumer needs
one, and spreads the native element's props so nothing is a dead end.

| Component | Variants | Accessibility contract |
| --- | --- | --- |
| `Button` | `primary` (brass) · `secondary` (bone outline) · `ghost` · `danger`; sizes `sm`/`md`/`lg`; `loading`, `magnetic` | Real `<button>`/`<a>`. `loading` sets `aria-busy` and `disabled`, and keeps its label in the DOM so screen readers do not lose it. Magnetism is pointer-only and off under reduced motion. |
| `Field` | text · email · tel · number · select · textarea | Label always rendered (never placeholder-as-label). `aria-describedby` wires hint + error; `aria-invalid` on failure; errors are `role="status"` so they are announced without stealing focus. |
| `Badge` | `neutral` · `ok` · `low` · `out` · `brass` | Colour is never the only signal — each variant pairs with text. |
| `SpecRail` | — | `<dl>` with `<dt>`/`<dd>`. The number is decorative and `aria-hidden`. |
| `Aperture` | sizes · `progress` | Purely decorative, `aria-hidden`, no focus. |
| `Dialog` | modal sheet | Focus trap, focus restore, `Escape`, labelled by its heading, `aria-modal`, inert background, scroll lock that compensates for the scrollbar so nothing shifts. |
| `Drawer` | right (cart) · top (search) · full (menu) | Same contract as `Dialog`, plus a swipe-to-dismiss affordance on touch. |
| `ProductCard` | `default` · `compact` | One link wrapping the whole card; the hover aperture and the specular sweep are decorative. Price has a `<span class="sr-only">` expansion so "ARS 1.299.000" is not read as digits soup. |
| `ProductRender` | all device families · all colourways | `role="img"` with a real `aria-label`; falls back to `next/image` when photography exists. |
| `PriceBlock` | — | List price, transfer price, instalments, all mono, all with tabular figures so they do not jitter on variant change. |
| `QuantityStepper` | — | Two real buttons plus a real number input; clamps 1…`maxPerOrder` on both. |
| `Toast` | `info` · `ok` · `err` | `aria-live="polite"` region, mounted once at the root. |

### Composition rule
If a surface needs more than **one** border-radius, more than **one** brass element, or a shadow,
it is wrong. Flat, hairline-separated, type-led.

---

## Responsive

| Breakpoint | Token | Posture |
| --- | --- | --- |
| 375–389 | — | Smallest supported. Nothing clips; mono prices stay on one line. |
| 390–767 | base | **Mobile is its own design.** Bottom-anchored nav bar, full-screen sheets, a sticky buy bar on the PDP. The pinned horizontal rail becomes a snap carousel — pinning fights a touch scroller. Ledger off. |
| 768–1023 | `md` | Two-column catalogue, drawer filters, hero at one viewport. |
| 1024–1279 | `lg` | Ledger appears. Mega-menu replaces the sheet. Scroll narrative on. |
| 1280–1439 | `xl` | Full editorial scale. |
| ≥1440 | `2xl` | Content caps at `--measure-max`; margins grow. |

Mobile is not a compressed desktop: `MobileNav`, `MobileBuyBar` and `FilterSheet` are separate
components rendered behind CSS media queries (so there is no JS-driven layout flash), and the
mobile PDP order is price → variants → CTA → story, inverted from desktop.

---

## Accessibility baseline

Non-negotiable, and verified in `tests/e2e/accessibility.spec.ts`:

- One `<h1>` per page; headings never skip a level.
- Landmarks on every page: `banner`, `navigation`, `main`, `contentinfo`.
- A skip link is the first focusable element.
- Focus is **always** visible: `2px` brass outline at `2px` offset, via `:focus-visible`.
- Keyboard reaches every interactive thing; dialogs trap and restore focus; `Escape` closes.
- Search overlay: `↑`/`↓` move through results, `Enter` opens, `Escape` closes, and the result
  count is announced in a live region.
- Touch targets ≥ 44 × 44 px.
- `prefers-reduced-motion: reduce` collapses every transition to ≤ 1 ms and resolves all
  scroll narratives to their end state.
- `prefers-contrast: more` promotes hairlines and drops decorative opacity.
- No information is conveyed by colour, hover, or motion alone.
