# OWNER STORE — Creative Direction

> **TECHNOLOGY, REDEFINED.**
> An Argentine house that sells Apple hardware, built as a gallery rather than a shop.

---

## 0. Research note, stated honestly

The brief asked for an analysis of `instagram.com/ownerstoreok`. **That host is blocked by this
environment's network egress policy**, and a web search returned nothing about the brand. So this
direction is *not* derived from the real account's visual language. It is derived from:

- the commercial reality of a premium Apple reseller in Argentina (below), which is well documented,
- the reference set named in the brief, analysed structurally rather than copied,
- an original position staked out deliberately against Apple's own house style.

**What to do with that:** when the real account is reachable, the direction is a fit, not a rewrite.
The token layer (`src/styles/tokens.css`) and the data layer (`src/data/`) are the only two places
brand decisions live. Changing the palette, the type pairing and the product photography is a
change to roughly 80 lines of CSS and one data file — not a redesign of the app.

---

## 1. What the references actually teach (analysis, not mood board)

| Reference | The transferable lesson | What we deliberately **don't** take |
| --- | --- | --- |
| **Apple** | One idea per viewport. The product is lit, not decorated. Copy is short and declarative. | The visual language itself: cool greys, SF-style geometric sans, centred text on white, blue CTA. Taking those *is* the copy. |
| **Nothing** | A single, systematic graphic device repeated until it becomes the logo. Transparency as honesty. | Dot-matrix type and the lo-fi techno-industrial pose — it reads as a gadget subculture, not luxury. |
| **Teenage Engineering** | Technical drawing as beauty: numbered parts, monospace annotation, visible measurement. | Primary-colour playfulness. We want precision without toy. |
| **Bang & Olufsen** | Material warmth. Brass, bone, stone. Objects photographed like furniture. | Its stillness — B&O barely moves. We need motion to carry a scroll narrative. |
| **Dyson** | The cutaway. Showing the inside is the most persuasive thing you can do to an object. | Engineering-blue infographic chrome. |
| **Gentle Monster** | Editorial surrealism — product in a constructed world, not on seamless white. | Its abstraction. We must still convert. |
| **Nike** | Vertical type as architecture. Confidence in enormous display scale. | Sport energy, diagonal speed lines. |
| **Samsung** | Honest configurator UX: variant, price, stock, finance, all visible at once. | Its generic card-grid density. |
| **Awwwards / CSSDA / FWA** | The grammar of scroll choreography: pin, reveal, scale, hand-off. | The failure mode of that grammar — scroll-jacking, 8 MB hero videos, a site that wins a medal and sells nothing. |

### The single sentence this produces

> **A technical drawing that grew warm.**
> Instrument-panel precision — hairline grids, monospace annotation, numbered parts — rendered in
> bone, ink and brass instead of the usual cold grey, so it reads as a jeweller's bench rather than
> a spec sheet.

---

## 2. The anti-Apple test

The brief's hardest rule: *if it starts to look like Apple.com with a different logo, stop.*
Operationalised as six checks. Any **No** is a bug, not a taste difference.

| # | Check | How we satisfy it |
| --- | --- | --- |
| 1 | Is the ground colour unmistakably not Apple's? | `#0B0B0C` ink and `#F2EDE4` **warm bone** — a paper white with a yellow bias. Apple's light surfaces are cool (`#F5F5F7`, blue-biased). Side by side the difference is immediate. |
| 2 | Is the type voice different? | **Archivo** (grotesque with a *width* axis, set extremely tight and stretched) + **Instrument Serif italic** for editorial counterpoint + **JetBrains Mono** for every number. Apple has no serif, no mono, and no width axis. |
| 3 | Is the accent not Apple blue? | **Brass `#B58A4A`** at 6.28 : 1 on ink. Warm, metallic, singular. Used for exactly three things: the aperture ring, the primary CTA, and focus. |
| 4 | Is there a graphic device Apple would never use? | The **Ledger** — a visible hairline column grid with monospace coordinate markers in the margin, and **Spec Rails** — numbered `01 / DISPLAY` rules. That is draughtsmanship, which Apple hides. |
| 5 | Is the composition off-centre? | Apple centres almost everything. Our hero is a left-weighted editorial stack against a right-weighted object, on an asymmetric 12-column ledger. |
| 6 | Recognisable with the logo removed? | Yes — by the brass aperture, the bone-on-ink warmth, the margin coordinates, and mono prices. |

---

## 3. Identity

### Name lockup
`OWNER` set in Archivo at width 112, tracking −0.04em, with the **O** doubling as the aperture
device. The word is never italicised, never coloured, never placed on brass.

### The aperture — the signature

A brass hairline circle. It is the one device that appears on every page and carries the brand:

- **Home hero** — opens from 0 to beyond the viewport as you scroll, revealing the device inside it.
  The product arrives *through* the O of OWNER.
- **Product cards** — a small aperture behind the device; it dilates on hover.
- **Discovery** — each answer is an aperture that fills as you choose.
- **Loading / pending** — the ring draws itself.

Rules: brass hairline only (never filled, never gradient), stroke stays optically 1px at every
scale, and **one aperture per viewport, ever**. Two apertures on screen is the device eating itself.

### The Ledger
A 12-column hairline grid at `rgb(from var(--ink) r g b / 0.08)`, with monospace coordinate markers
(`01`…`12`) in the outer margin. Visible but quiet — it should register as texture first and
structure second. Hidden below `lg`, where it would become noise.

### Spec Rails
Specifications are never cards. They are numbered rules, left-aligned, mono label and bone value:

```
01 / PANTALLA ───────────────── Super Retina XDR · 6,3"
02 / CHIP ──────────────────── A19 Pro
```

Each rail draws its rule left-to-right as it enters. This is how *all* technical content is
presented, site-wide. It is the second-most-recognisable thing after the aperture.

---

## 4. Palette

Warmth is the whole argument. Every neutral is pulled toward yellow; nothing is pulled toward blue.

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#0B0B0C` | Primary ground. Near-black with a hair of warmth. |
| `--ink-raised` | `#141415` | Raised surface: drawer, menu, sheet. |
| `--ink-sunken` | `#070708` | Sunken wells, hero vignette. |
| `--bone` | `#F2EDE4` | Primary type on ink, and the light ground. **Warm.** |
| `--bone-dim` | `#A8A29A` | Secondary type. |
| `--bone-faint` | `#6B6760` | Tertiary / disabled. |
| `--brass` | `#B58A4A` | THE accent. Aperture, primary CTA, focus ring. |
| `--brass-bright` | `#D9AE6A` | Brass hover / highlight only. |
| `--graphite` | `#1C1C1E` | Hairlines and dividers on ink. |
| `--signal-ok` | `#5E8C6A` | In stock. Muted sage, never a bright green. |
| `--signal-low` | `#C9873F` | Low stock. |
| `--signal-err` | `#D06A5A` | Errors. Warm oxide, never pure `#f00`. (`#A8443A` was the first pick; it measured 3.33 : 1 and failed AA.) |

Discipline: **brass is 2–4 % of any viewport.** It is a metal, not a colour field. Gradients are
allowed only as the hero vignette and the specular sweep on a device render — never on a button,
never on a card, never behind text.

### Forbidden, per the brief
Cyberpunk neon; generic glassmorphism; stacked gradients; gamer chrome; blur as decoration; card
soup; animation without a reason. The enforcement mechanism is §55 self-critique and the design
review in `docs/design-review.md`.

---

## 5. Type system

| Role | Family | Why |
| --- | --- | --- |
| Display | **Archivo** variable (`wght` 100–900, `wdth` 62–125) | The width axis is the differentiator. Headlines are set at `wdth` 105–112 and `-0.045em`, which no Apple page can do. |
| Editorial | **Instrument Serif**, italic | One italic serif word per section — `redefined.`, `deseo.` — as counterpoint. High contrast, slightly literary. Used *sparingly*: at most one per viewport. |
| Numeric / technical | **JetBrains Mono** | **Every price, SKU, spec value, counter and coordinate.** Prices in mono is the strongest single conversion-and-identity decision here: it reads as an instrument readout, is unambiguous about digits, and tabular figures stop prices jittering as variants change. |
| Body / UI | **Archivo**, `wdth` 100 | One family doing two jobs keeps the download small. |

All three are self-hosted through `next/font/google` at build time: no runtime request to
`fonts.googleapis.com`, which also means our CSP needs no third-party font origin. Latin subset
only, `display: swap`, and the display face preloaded.

Scale is fluid, `clamp()`-based, and defined once in `tokens.css` as
`--text-micro` … `--text-hero`. These are **named, not numbered**, and they live in Tailwind's
`--text-*` namespace so they compile to real utilities (`text-hero`, `text-h2`).

That is a correctness requirement, not a style preference. Written as
`text-[var(--text-hero)]`, Tailwind v4 cannot tell a length from a colour and resolves it as a
*colour* — every heading in the application silently rendered at the inherited 16px while the markup
looked right. `tests/unit/tokens.test.ts` now bans the arbitrary form outright.

The hero tops out at `6.5rem`, down from an initial `11rem`: at 176px the word "TECHNOLOGY" spanned
the whole viewport, broke mid-word, and buried the product behind it — loud, not premium, and the
opposite of product-as-hero.

### Voice: bilingual on purpose
Display and conceptual copy in **English**; everything functional, commercial and legal in
**rioplatense Spanish** (`vos`, `comprás`, `Precio transferencia`, `12 cuotas sin interés`).
This is not indecision — it is how premium Argentine retail actually speaks, and the register
shift marks the boundary between the gallery and the shop.

---

## 6. Experience architecture

The brief's arc — ENTRA → DESCUBRE → EXPLORA → INTERACTÚA → ENCUENTRA → CONFIGURA → COMPRA —
mapped to real routes:

| Stage | Where | The job it does |
| --- | --- | --- |
| ENTRA | `/` hero | Stop the scroll. Establish that this is not a phone shop. |
| DESCUBRE | `/` aperture reveal | The object arrives through the O. First desire. |
| EXPLORA | `/` pinned horizontal rail | Hand-off between devices without leaving the page. |
| INTERACTÚA | `/` cutaway + spec rails | Dyson's lesson: show the inside. |
| ENCUENTRA | `/descubri`, `/tienda`, search overlay | Three doors for three intents. |
| CONFIGURA | `/producto/[slug]` | Variant → price → stock → finance, instantly. |
| COMPRA | Cart drawer → `/checkout` | Four steps, server-priced, mobile-first. |

**Scroll is transformation, not pagination** — but the user never loses control. Native scroll
only; no hijack, no smooth-scroll library, no scroll-linked audio, nothing that makes a trackpad
feel wrong. Every pinned section has a real, finite height and can be flung past.

### The Instagram arrival path
The highest-value visitor lands on a product from an Instagram story on a 390 px phone, ready to
buy. For them the experience is inverted: on mobile the hero is one viewport, and the PDP puts
price, variant picker, financing and CTA above the fold *before* any storytelling. Narrative is
desktop's privilege; mobile's privilege is speed. See `docs/design-system.md` §Responsive.

---

## 7. Motion thesis

Motion earns its place by explaining space or state, never by announcing itself. Full system in
`docs/motion-system.md`. The two rules that override everything:

1. **`prefers-reduced-motion` is not a degradation — it is a supported design.** Every scroll
   narrative resolves to its final, readable state; no information is ever motion-only.
2. **Transform and opacity only.** Anything that animates layout is a bug.

---

## 8. Why there is no WebGL here

The brief permits 3D and explicitly forbids 3D-for-cool. We don't ship it, and this is the reasoning:

- A credible 3D iPhone needs a licensed, accurate, well-lit GLTF asset. We have none, and an
  approximated one looks like a knock-off — which damages a trust-led brand far more than a flat
  image ever could.
- React Three Fiber + drei + a compressed model is ~550 kB of JS before a pixel renders, on a
  market where mid-range Android over 4G is the median device. That is the entire performance
  budget spent on one effect.
- What 3D would buy us — a sense of a physical object, rotation, moving light — we get from CSS 3D
  transforms and SVG specular sweeps at roughly 4 kB, composited on the GPU.

So: **`ProductRender`** draws each device as an original, procedurally-lit SVG (`src/components/product/`).
Hand-drawn vector geometry, a specular highlight that tracks scroll and pointer, true perspective
via `rotate3d`. It is our own artwork — no copyright exposure, no network weight, sharp at any
density, and it recolours instantly when a variant changes, which a photograph cannot.

The architecture keeps the door open: every product carries an optional `photography` field, and
`ProductRender` prefers a real `next/image` asset when one exists. Dropping in real photography is
a data change. If a hero 3D configurator is ever commissioned, it belongs behind a
`next/dynamic` boundary on the PDP only — never in the shared bundle.

---

## 9. Done means

- A visitor describes it as *"a technical drawing that grew warm"*, or at least not as *"like Apple"*.
- A buyer arriving from Instagram on a phone reaches **add-to-cart in under 15 seconds**.
- Price, stock and financing are never ambiguous for a single frame.
- Everything above holds with JavaScript throttled, motion reduced, and a keyboard only.
