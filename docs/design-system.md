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
- The light surface (`/legal`, the order confirmation) flips the semantic layer, not the components.
  Two mechanics make that true, and both were once missing:
  - The `--color-*` aliases Tailwind generates utilities from live in a **`@theme inline`** block. A
    plain `@theme` resolves `var(--surface)` once, on `:root`, and every utility inherits that one
    dark value — so `bg-surface` stayed ink on a page that had asked for bone, while hand-authored
    rules like `.u-label`, which read `var(--text-dim)` directly, took the light value. The surface
    was half-applied for months and looked deliberate.
  - The flip also applies to `body:has([data-surface='light'])`. The header, footer and tab bar are
    siblings of the page wrapper, and custom properties do not flow sideways: without this the
    wordmark was bone on bone — invisible — and the nav measured 2.16 : 1.

### Contrast — measured, not assumed
Computed with the WCAG 2.1 relative-luminance formula, not estimated. The script is in
`tests/unit/tokens.test.ts`, which **fails the build** if a palette edit drops a pair below its
threshold — so this table cannot silently rot.

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--bone` on `--ink` | **16.87 : 1** | AAA |
| `--bone-dim` on `--ink` | **7.78 : 1** | AAA |
| `--bone-dim` on `--ink-raised` | **7.28 : 1** | AAA — drawer and menu copy |
| `--bone-faint` on `--ink` | **4.87 : 1** | AA — lifted from 3.50 : 1, which no test defended |
| `--brass` on `--ink` | **6.28 : 1** | AA text, AAA large |
| `--ink` on `--brass` | **6.28 : 1** | AA — the primary CTA |
| `--signal-ok` on `--ink` | **5.09 : 1** | AA |
| `--signal-low` on `--ink` | **6.58 : 1** | AA |
| `--signal-err` on `--ink` | **5.52 : 1** | AA |

The light surface, measured on all three of its grounds — bone `#f2ede4`, raised `#fbf9f5`, sunken
`#e8e2d6`. These had no test until the surface was repaired, and two of them were wrong:

| Token | On bone | On raised | On sunken | Verdict |
| --- | --- | --- | --- | --- |
| `--text` | **16.87 : 1** | 18.71 : 1 | 15.25 : 1 | AAA |
| `--text-dim` | **6.26 : 1** | 6.94 : 1 | 5.66 : 1 | AA |
| `--text-faint` | **5.12 : 1** | 5.68 : 1 | 4.63 : 1 | AA — was 3.14 : 1 and carried the breadcrumb |
| `--accent` | **5.05 : 1** | 5.60 : 1 | 4.57 : 1 | AA — was 4.25 : 1 under a comment claiming 4.6 : 1 |
| `--accent-hover` | **6.12 : 1** | 6.79 : 1 | 5.53 : 1 | AA |
| `--on-accent` on `--accent` | **5.05 : 1** | — | — | AA — the CTA on paper |

Two notes on how this table shaped the palette rather than just describing it:

- The first error red chosen (`#A8443A`) measured **3.33 : 1** and was rejected. `--signal-err` is
  now `#D06A5A`; the deeper oxide survives as `--signal-err-deep` for borders and fills, where no
  text sits on it.
- `--bone-faint` was the one token that could not carry text, at 3.50 : 1 — and it carried the
  ledger coordinates anyway. It was lifted to `#827e77` (4.87 : 1 on ink, 4.56 : 1 on raised); the
  test that used to assert it stayed *below* 4.5 : 1, defending the bug, was deleted.

---

### Colours and sizes are utilities, never arbitrary values

Both the type scale and the semantic colours are registered in Tailwind's `--text-*` and `--color-*`
namespaces, so markup says `text-h2` and `text-fg-dim` rather than `text-[var(--text-h2)]`.

This is enforced by `tests/unit/tokens.test.ts` and `tests/unit/cn.test.ts`, because the arbitrary
form broke twice in different ways: Tailwind resolved `text-[var(--text-hero)]` as a *colour*, so
every heading rendered at 16px; and `tailwind-merge`, unable to group a custom name, treated a size
and a colour as conflicting and **dropped one of them** on every element that set both. Neither
failure produced an error.

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

Hairlines are `1px` at `--line`. **There are no drop shadows anywhere.** Elevation is communicated
by surface lightness (`--surface` → `--surface-raised`) and by a single hairline. There was a
`--shadow-sheet` reserved for the light surface; nothing ever used it, and the token-governance
test removed it.

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
- Touch targets: **44 × 44 px for controls** (buttons, icon buttons, form controls, nav tabs).
  Inline text links — breadcrumbs, footer lists, links inside a sentence — are held to **24 px**,
  which is WCAG 2.5.8's AA floor and the case its "inline" exception covers; forcing 44 px there
  would wreck a breadcrumb. Both thresholds are asserted in `tests/e2e/visual-qa.spec.ts`, which is
  what caught the wordmark at 31 px and footer links at 16 px.
- `prefers-reduced-motion: reduce` collapses every transition to ≤ 1 ms and resolves all
  scroll narratives to their end state.
- `prefers-contrast: more` promotes hairlines and drops decorative opacity.
- No information is conveyed by colour, hover, or motion alone.
