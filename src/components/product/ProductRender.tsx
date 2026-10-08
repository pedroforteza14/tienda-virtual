'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { defsId, shade } from '@/components/product/shade';
import type { Colorway, Photo, RenderKind } from '@/types/catalog';

/**
 * ============================================================================
 *  PRODUCT RENDER — original procedural artwork, not 3D and not stock photos.
 * ============================================================================
 *
 * The reasoning is in docs/creative-direction.md §8. Briefly:
 *
 *  - We have no licensed product photography and no accurate GLTF models. An
 *    approximated 3D iPhone reads as a knock-off, which is worse for a trust-led
 *    reseller than a flat image could ever be.
 *  - React Three Fiber plus a model is roughly half a megabyte of JavaScript
 *    before anything renders, on a market whose median device is a mid-range
 *    Android over 4G.
 *  - What 3D would buy — a physical object, moving light, perspective — is
 *    available from vector geometry, a gradient and a CSS transform at ~4 kB.
 *
 * So each device is hand-drawn as an SVG, lit with computed gradients, and
 * recoloured from the variant's colourway. It is our own artwork (no copyright
 * exposure), sharp at any density, zero network weight, and — unlike a
 * photograph — it recolours *instantly* when a configurator option changes,
 * which is the single best thing about this approach commercially.
 *
 * ESCAPE HATCH: when a product carries real `photography`, that is used instead.
 * Dropping in a real shoot is a data change, not a code change.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A CLIENT COMPONENT (it has no state and no handlers)
 * ---------------------------------------------------------------------------
 * Purely to get `useId()`, and that is not fussiness.
 *
 * The gradients live in `<defs>` and are referenced as `url(#id)`. SVG resolves
 * those **document-wide, first match wins**. An earlier version derived the id
 * from a hash of (kind + colour), reasoning that a collision was harmless because
 * two instances with the same inputs define identical gradients.
 *
 * That reasoning was wrong, and only a render showed it. The mega-menu renders
 * the same device in the same colourway and sits behind `display: none` — so it
 * held the *first* `#body-…` in the document, and every visible instance resolved
 * its fill to a paint server inside a non-rendered tree. The result: the hero
 * device drew its camera dots and nothing else, looking exactly like artwork that
 * had failed to load.
 *
 * `useId()` gives a per-instance id that is stable across SSR and hydration, which
 * a counter or a random value would not be. The component still server-renders, so
 * the SVG is in the initial HTML and LCP is unaffected; the cost is a few kB of
 * component code on routes that show products.
 */

/** The PDP hero: nearly full width on a phone, a column on a desktop. */
const HERO_SIZES = '(max-width: 48rem) 90vw, (max-width: 80rem) 45vw, 36rem';

export interface ProductRenderProps {
  kind: RenderKind;
  color: Pick<Colorway, 'hex' | 'hexAccent' | 'name'> & { light?: boolean };
  /** Product name, for the accessible label. */
  productName: string;
  photography?: Photo | undefined;
  className?: string;
  /**
   * The `sizes` attribute for a photograph.
   *
   * Defaulted for the hero, because that is the call site where getting it
   * wrong is most expensive. It is a prop because a single hard-coded value is
   * worse than none: with the hero's string on an 80px cart thumbnail, the
   * browser picks the 1920px candidate for a box the size of a postage stamp
   * and the drawer costs more to open than the page did to load. Every
   * thumbnail below passes its own.
   */
  sizes?: string;
  /**
   * Build the object in from its parts, when it is first looked at.
   *
   * Not on mount: a catalogue shows four cards above the fold and eight below
   * it, and on mount the eight assembled themselves off-screen and were
   * finished long before anyone scrolled down. The animation was not merely
   * missed, it was spent. It now waits for the drawing to enter the viewport,
   * once per element — `once`, because re-running on every scroll pass is
   * noise rather than polish.
   *
   * It applies to the drawing only; a photograph has no parts.
   */
  assemble?: boolean;
  /**
   * `'hero'` is the full sequence; `'card'` is the tighter one a listing needs.
   * `index` staggers one card against the next, so a row resolves across rather
   * than flashing as a block.
   */
  assembleVariant?: 'hero' | 'card';
  assembleIndex?: number;
  /** Adds the scroll/hover specular sweep layer. Off for small thumbnails. */
  specular?: boolean;
  priority?: boolean;
}

/**
 * True once the element has been looked at.
 *
 * Starts true so the server-rendered markup carries the class: if JavaScript
 * never arrives, the object still assembles at load, which is the behaviour
 * worth keeping on a slow connection. On mount, an element that is NOT yet in
 * the viewport has the class taken away and given back when it scrolls into
 * view — a swap nobody can see, because by definition it happens off-screen.
 *
 * `rootMargin` fires it slightly before the edge so the sequence has started by
 * the time the object is properly in frame, rather than beginning under the
 * reader's chin.
 */
function useSeen(enabled: boolean): [boolean, React.RefObject<SVGSVGElement | null>] {
  const ref = useRef<SVGSVGElement | null>(null);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const rect = node.getBoundingClientRect();
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyVisible) return; // Above the fold: it is already playing. Leave it.

    setSeen(false);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return [seen, ref];
}

export function ProductRender({
  kind,
  color,
  productName,
  photography,
  className,
  sizes = HERO_SIZES,
  specular = false,
  priority = false,
  assemble = false,
  assembleVariant = 'hero',
  assembleIndex = 0,
}: ProductRenderProps) {
  // Called unconditionally and before any early return: hooks are not optional.
  const id = defsId(useId());
  const [seen, svgRef] = useSeen(assemble);

  if (photography) {
    return (
      <div className={cn('relative grid place-items-center', className)}>
        <Image
          src={photography.src}
          alt={photography.alt}
          width={photography.width}
          height={photography.height}
          sizes={sizes}
          priority={priority}
          className="h-full w-full object-contain"
        />
        {specular ? <span className="specular" aria-hidden="true" /> : null}
      </div>
    );
  }

  return (
    /**
     * `grid place-items-center` plus a height-driven SVG.
     *
     * The obvious `h-full w-full` on the `<svg>` does not work: a percentage
     * height only resolves against a definite parent height, and when it does not
     * the SVG silently falls back to its viewBox aspect ratio. On the home hero
     * that rendered the device 1680px tall inside a 696px box — the body was drawn
     * so far off-screen that only the dynamic island was visible, and the page
     * looked like the artwork had failed to load.
     *
     * Sizing by height with `w-auto` makes the proportion come from the geometry
     * in every case, and `max-w-full` caps the landscape devices (laptop, iMac) so
     * they letterbox instead of overflowing.
     */
    <div className={cn('relative grid place-items-center', className)}>
      <svg
        ref={svgRef}
        viewBox={VIEWBOX[kind]}
        role="img"
        aria-label={`${productName} en ${color.name}`}
        className="h-full max-h-full w-auto max-w-full"
        // The drawing is geometry, so it scales without ever resampling.
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs id={id} color={color} />
        {/* The parts are wrapped so the stagger applies to the shapes and not to
            `<defs>`, which has no geometry and would spend a step of the
            sequence rendering nothing. */}
        <g
          className={
            assemble && seen
              ? cn('assemble', assembleVariant === 'card' && 'assemble-card')
              : undefined
          }
          style={
            assemble && assembleVariant === 'card'
              ? // Capped at six: past that the stagger adds nothing and only
                // delays a product nobody is waiting on.
                ({ ['--card-index' as string]: String(Math.min(assembleIndex, 6)) } as React.CSSProperties)
              : undefined
          }
        >
          {DRAWINGS[kind]({ id })}
        </g>
      </svg>
      {specular ? <span className="specular" aria-hidden="true" /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lighting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One light, upper-left, as in product photography. Light bodies flip the
 * internal shading so a white device does not look like it is lit from inside.
 */
function Defs({ id, color }: { id: string; color: ProductRenderProps['color'] }) {
  const light = color.light ?? false;
  const topLift = light ? 0.1 : 0.22;
  const bottomDrop = light ? -0.16 : -0.3;

  return (
    <defs>
      <linearGradient id={`body-${id}`} x1="0" y1="0" x2="0.65" y2="1">
        <stop offset="0" stopColor={shade(color.hex, topLift)} />
        <stop offset="0.42" stopColor={color.hex} />
        <stop offset="1" stopColor={shade(color.hex, bottomDrop)} />
      </linearGradient>

      {/* The rail/edge: a brighter band that reads as a machined chamfer. */}
      <linearGradient id={`rail-${id}`} x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0" stopColor={shade(color.hexAccent, 0.3)} />
        <stop offset="0.5" stopColor={color.hexAccent} />
        <stop offset="1" stopColor={shade(color.hexAccent, -0.2)} />
      </linearGradient>

      {/* Screens are never pure black — a sheet of glass always picks up the room. */}
      <linearGradient id={`screen-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#1a1a1c" />
        <stop offset="0.45" stopColor="#0d0d0f" />
        <stop offset="1" stopColor="#141416" />
      </linearGradient>

      {/* A single soft highlight sweeping the glass. */}
      <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
        <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.02" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>

      {/* Contact shadow, so the object sits on something. */}
      <radialGradient id={`ground-${id}`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#000000" stopOpacity="0.5" />
        <stop offset="1" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawings                                                                    */
/* -------------------------------------------------------------------------- */

const VIEWBOX: Record<RenderKind, string> = {
  phone: '0 0 300 620',
  'phone-pro': '0 0 300 620',
  laptop: '0 0 620 420',
  desktop: '0 0 620 500',
  compact: '0 0 460 320',
  tablet: '0 0 440 580',
  watch: '0 0 300 440',
  earbuds: '0 0 420 380',
  case: '0 0 300 620',
  puck: '0 0 420 340',
  stylus: '0 0 180 600',
  headphones: '0 0 420 460',
  display: '0 0 620 500',
  speaker: '0 0 320 400',
  keyboard: '0 0 620 300',
};

interface DrawProps {
  id: string;
}

/** Shared: the elliptical contact shadow under every object. */
function Ground({ id, cx, cy, rx, ry }: DrawProps & { cx: number; cy: number; rx: number; ry: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#ground-${id})`} />;
}

function phone({ id, pro }: DrawProps & { pro?: boolean }) {
  const frame = pro ? 7 : 6;
  return (
    <>
      <Ground id={id} cx={150} cy={578} rx={118} ry={20} />

      {/* Body, with the right edge visible so thickness reads. */}
      <rect x="40" y="18" width="222" height="548" rx="42" fill={`url(#rail-${id})`} />
      <rect x="40" y="18" width="214" height="548" rx="42" fill={`url(#body-${id})`} />

      {/* Glass */}
      <rect
        x={40 + frame}
        y={18 + frame}
        width={214 - frame * 2}
        height={548 - frame * 2}
        rx={42 - frame}
        fill={`url(#screen-${id})`}
      />
      <rect
        x={40 + frame}
        y={18 + frame}
        width={214 - frame * 2}
        height={548 - frame * 2}
        rx={42 - frame}
        fill={`url(#glass-${id})`}
      />

      {/* Dynamic island */}
      <rect x="117" y="36" width="60" height="17" rx="8.5" fill="#000" opacity="0.92" />
      <circle cx="168" cy="44.5" r="3.4" fill="#0f1418" />

      {/* Side controls */}
      <rect x="36" y="150" width="4" height="34" rx="2" fill={`url(#rail-${id})`} />
      <rect x="36" y="200" width="4" height="56" rx="2" fill={`url(#rail-${id})`} />
      <rect x="254" y="186" width="4" height="72" rx="2" fill={`url(#rail-${id})`} />

      {/* The Pro's camera plateau, just visible around the right edge — the one
          cue that separates the Pro silhouette at a glance. Tucked against the
          body: an earlier version sat half outside it and read as a stray tab. */}
      {pro ? (
        <g opacity="0.92">
          <rect x="243" y="48" width="16" height="74" rx="8" fill={`url(#rail-${id})`} />
          <circle cx="251" cy="64" r="5.5" fill="#101114" />
          <circle cx="251" cy="85" r="5.5" fill="#101114" />
          <circle cx="251" cy="106" r="5.5" fill="#101114" />
        </g>
      ) : null}

      {/* Top-left chamfer catch-light. */}
      <path
        d="M58 24 Q44 30 42 54"
        stroke="#ffffff"
        strokeOpacity="0.2"
        strokeWidth="1.2"
        fill="none"
      />
    </>
  );
}

function phoneCase({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={150} cy={578} rx={116} ry={19} />
      {/* A case is the phone silhouette, softened and hollow. */}
      <rect x="38" y="16" width="224" height="552" rx="46" fill={`url(#body-${id})`} />
      <rect
        x="52"
        y="30"
        width="196"
        height="524"
        rx="36"
        fill="#000"
        opacity="0.3"
      />
      <rect x="52" y="30" width="196" height="524" rx="36" fill={`url(#glass-${id})`} />
      {/* Camera cut-out */}
      <rect x="70" y="48" width="104" height="104" rx="30" fill="#0c0c0e" opacity="0.85" />
      <circle cx="98" cy="76" r="15" fill="#15161a" />
      <circle cx="146" cy="76" r="15" fill="#15161a" />
      <circle cx="98" cy="124" r="15" fill="#15161a" />
      {/* MagSafe ring — the detail that says what this is. */}
      <circle
        cx="150"
        cy="300"
        r="52"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.12"
        strokeWidth="10"
      />
      <path d="M58 26 Q42 34 40 60" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" fill="none" />
    </>
  );
}

function laptop({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={310} cy={392} rx={250} ry={22} />

      {/* Lid */}
      <rect x="92" y="24" width="436" height="286" rx="14" fill={`url(#body-${id})`} />
      <rect x="104" y="36" width="412" height="258" rx="7" fill={`url(#screen-${id})`} />
      <rect x="104" y="36" width="412" height="258" rx="7" fill={`url(#glass-${id})`} />
      {/* Notch */}
      <rect x="288" y="36" width="44" height="11" rx="5.5" fill="#000" opacity="0.9" />

      {/* Hinge */}
      <rect x="92" y="306" width="436" height="6" rx="3" fill={`url(#rail-${id})`} opacity="0.8" />

      {/* Base — a trapezoid so the wedge reads in one glance. */}
      <path d="M62 314 H558 L584 356 Q584 366 572 366 H48 Q36 366 36 356 Z" fill={`url(#body-${id})`} />
      {/* Keyboard well */}
      <path d="M118 320 H502 L512 342 H108 Z" fill="#000" opacity="0.22" />
      {/* Trackpad */}
      <rect x="258" y="346" width="104" height="5" rx="2.5" fill="#000" opacity="0.18" />
      {/* Front lip */}
      <path d="M36 356 H584" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1" />
      <path d="M100 30 Q92 34 92 48" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

function desktop({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={310} cy={470} rx={190} ry={20} />

      {/* Panel */}
      <rect x="60" y="24" width="500" height="334" rx="16" fill={`url(#body-${id})`} />
      <rect x="74" y="38" width="472" height="282" rx="6" fill={`url(#screen-${id})`} />
      <rect x="74" y="38" width="472" height="282" rx="6" fill={`url(#glass-${id})`} />
      {/* Chin, where the colour actually lives on an iMac. */}
      <rect x="60" y="320" width="500" height="38" rx="0" fill={`url(#body-${id})`} />
      <circle cx="310" cy="340" r="3" fill="#000" opacity="0.25" />

      {/* Stand */}
      <path d="M262 358 H358 L352 426 H268 Z" fill={`url(#rail-${id})`} />
      <rect x="208" y="426" width="204" height="12" rx="6" fill={`url(#rail-${id})`} />
      <path d="M70 30 Q60 36 60 52" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

function compact({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={230} cy={288} rx={160} ry={18} />
      {/* A square slab, seen slightly from above: top face plus front face. */}
      <path d="M84 96 L230 60 L376 96 L230 134 Z" fill={`url(#rail-${id})`} />
      <path d="M84 96 V232 Q84 248 100 248 H360 Q376 248 376 232 V96 L230 134 Z" fill={`url(#body-${id})`} />
      {/* Front ports — the thing people actually care about on this machine. */}
      <circle cx="140" cy="210" r="9" fill="#000" opacity="0.4" />
      <circle cx="172" cy="210" r="9" fill="#000" opacity="0.4" />
      <rect x="196" y="205" width="22" height="10" rx="5" fill="#000" opacity="0.35" />
      {/* Status light */}
      <circle cx="356" cy="210" r="3" fill="#c9873f" opacity="0.8" />
      <path d="M86 100 L230 64" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

function tablet({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={220} cy={548} rx={176} ry={20} />
      <rect x="40" y="20" width="364" height="508" rx="26" fill={`url(#rail-${id})`} />
      <rect x="40" y="20" width="356" height="508" rx="26" fill={`url(#body-${id})`} />
      <rect x="52" y="32" width="332" height="484" rx="16" fill={`url(#screen-${id})`} />
      <rect x="52" y="32" width="332" height="484" rx="16" fill={`url(#glass-${id})`} />
      {/* Landscape front camera, as on the current iPads. */}
      <circle cx="218" cy="26" r="3.2" fill="#0f1418" />
      {/* Pencil attach point */}
      <rect x="180" y="16" width="76" height="4" rx="2" fill="#ffffff" opacity="0.1" />
      {/* Rear camera, just visible past the edge */}
      <rect x="388" y="40" width="18" height="34" rx="9" fill={`url(#rail-${id})`} />
      <circle cx="397" cy="57" r="6" fill="#101114" />
      <path d="M56 26 Q42 32 42 52" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

function watch({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={150} cy={414} rx={92} ry={16} />
      {/* Straps behind the case */}
      <path d="M104 18 H196 L188 108 H112 Z" fill={`url(#rail-${id})`} opacity="0.55" />
      <path d="M112 322 H188 L196 418 H104 Z" fill={`url(#rail-${id})`} opacity="0.55" />

      {/* Case — a squircle, which is what makes it read as a Watch and not a box. */}
      <rect x="62" y="92" width="176" height="238" rx="56" fill={`url(#rail-${id})`} />
      <rect x="62" y="92" width="170" height="238" rx="56" fill={`url(#body-${id})`} />
      <rect x="76" y="106" width="142" height="210" rx="44" fill={`url(#screen-${id})`} />
      <rect x="76" y="106" width="142" height="210" rx="44" fill={`url(#glass-${id})`} />

      {/* Crown and side button */}
      <rect x="230" y="150" width="12" height="30" rx="6" fill={`url(#rail-${id})`} />
      <circle cx="236" cy="165" r="4" fill="#000" opacity="0.25" />
      <rect x="232" y="196" width="7" height="40" rx="3.5" fill={`url(#rail-${id})`} />

      {/* A hint of a complication, so the face is not an empty rectangle. */}
      <text
        x="147"
        y="196"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="38"
        fill="#f2ede4"
        fillOpacity="0.5"
        letterSpacing="-2"
      >
        09:41
      </text>
      <rect x="110" y="228" width="74" height="2" rx="1" fill="#b58a4a" fillOpacity="0.5" />
      <path d="M80 112 Q66 120 66 140" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

function earbuds({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={210} cy={352} rx={150} ry={16} />
      {/* Case */}
      <rect x="40" y="150" width="186" height="178" rx="42" fill={`url(#body-${id})`} />
      <rect x="40" y="150" width="186" height="178" rx="42" fill={`url(#glass-${id})`} />
      <path d="M48 216 H218" stroke="#000" strokeOpacity="0.16" strokeWidth="2" />
      <circle cx="133" cy="300" r="4" fill="#000" opacity="0.2" />

      {/* Two buds, mirrored */}
      {[0, 1].map((index) => {
        const x = 258 + index * 74;
        return (
          <g key={index}>
            <ellipse cx={x} cy={118} rx={30} ry={34} fill={`url(#body-${id})`} />
            <ellipse cx={x} cy={118} rx={30} ry={34} fill={`url(#glass-${id})`} />
            {/* Silicone tip */}
            <ellipse cx={x - 14} cy={100} rx={13} ry={11} fill="#d8d4cc" opacity="0.75" />
            {/* Stem */}
            <rect x={x - 9} y={146} width={18} height={96} rx={9} fill={`url(#body-${id})`} />
            <rect x={x - 9} y={146} width={18} height={96} rx={9} fill={`url(#glass-${id})`} />
            {/* Pressure sensor flat */}
            <rect x={x - 7} y={186} width={14} height={28} rx={7} fill="#000" opacity="0.1" />
          </g>
        );
      })}
    </>
  );
}

function puck({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={190} cy={288} rx={120} ry={16} />
      {/* Disc, seen from slightly above. */}
      <ellipse cx="190" cy="176" rx="118" ry="96" fill={`url(#rail-${id})`} />
      <ellipse cx="190" cy="168" rx="118" ry="96" fill={`url(#body-${id})`} />
      <ellipse cx="190" cy="168" rx="118" ry="96" fill={`url(#glass-${id})`} />
      {/* Coil ring */}
      <ellipse cx="190" cy="168" rx="74" ry="60" fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="8" />
      <ellipse cx="190" cy="168" rx="30" ry="24" fill="#000" opacity="0.07" />
      {/* Braided cable */}
      <path
        d="M298 196 Q372 232 352 300 Q338 334 300 330"
        stroke={`url(#rail-${id})`}
        strokeWidth="13"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M298 196 Q372 232 352 300 Q338 334 300 330"
        stroke="#000"
        strokeOpacity="0.12"
        strokeWidth="4"
        strokeDasharray="3 5"
        fill="none"
      />
    </>
  );
}

function stylus({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={90} cy={580} rx={44} ry={12} />
      {/* Barrel with one flat side, which is what a Pencil actually looks like. */}
      <path d="M62 60 Q62 40 90 40 Q118 40 118 60 V520 H62 Z" fill={`url(#body-${id})`} />
      <path d="M62 60 Q62 40 90 40 Q118 40 118 60 V520 H62 Z" fill={`url(#glass-${id})`} />
      {/* Tip */}
      <path d="M62 520 H118 L96 566 H84 Z" fill={`url(#rail-${id})`} />
      <path d="M84 566 H96 L92 578 H88 Z" fill="#3a3a3c" />
      {/* Flat edge, where it magnetises to the iPad */}
      <rect x="62" y="60" width="4" height="460" fill="#000" opacity="0.1" />
      {/* Squeeze zone */}
      <rect x="66" y="150" width="48" height="56" rx="6" fill="#000" opacity="0.06" />
      <path d="M70 52 Q66 56 66 70" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

/**
 * Over-ear headphones, three-quarter on.
 *
 * Drawn as one visible earcup with the headband arcing away behind it, rather
 * than the symmetrical front view every stock illustration uses: the symmetric
 * version reads as a flat pictogram, and the whole point of these renders is
 * that an object has a side the light does not reach.
 */
function headphones({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={210} cy={424} rx={140} ry={16} />

      {/* Headband canopy — the mesh spans between two rails. */}
      <path
        d="M96 232 Q96 70 210 70 Q324 70 324 232"
        stroke={`url(#rail-${id})`}
        strokeWidth="16"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M110 224 Q110 92 210 92 Q310 92 310 224"
        stroke={`url(#body-${id})`}
        strokeWidth="26"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M110 224 Q110 92 210 92 Q310 92 310 224"
        stroke="#000"
        strokeOpacity="0.12"
        strokeWidth="26"
        strokeDasharray="2 6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Telescoping stems */}
      <rect x="100" y="214" width="14" height="52" rx="7" fill={`url(#rail-${id})`} />
      <rect x="306" y="214" width="14" height="52" rx="7" fill={`url(#rail-${id})`} />

      {/* Far earcup, mostly hidden */}
      <rect x="288" y="252" width="56" height="112" rx="28" fill={`url(#rail-${id})`} opacity="0.85" />

      {/* Near earcup */}
      <rect x="74" y="248" width="130" height="124" rx="40" fill={`url(#body-${id})`} />
      <rect x="74" y="248" width="130" height="124" rx="40" fill={`url(#glass-${id})`} />
      {/* Cushion, seen edge-on */}
      <rect x="196" y="268" width="22" height="84" rx="11" fill="#000" opacity="0.14" />
      {/* Digital Crown */}
      <rect x="150" y="238" width="30" height="12" rx="6" fill={`url(#rail-${id})`} />
      <path d="M152 240 H178" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M86 256 Q74 262 74 282" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

/** A standalone display: all screen, thin bezel, a stand that reads as metal. */
function display({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={310} cy={472} rx={200} ry={20} />

      <rect x="36" y="24" width="548" height="330" rx="14" fill={`url(#body-${id})`} />
      <rect x="48" y="36" width="524" height="296" rx="4" fill={`url(#screen-${id})`} />
      <rect x="48" y="36" width="524" height="296" rx="4" fill={`url(#glass-${id})`} />
      {/* Camera */}
      <circle cx="310" cy="30" r="2.5" fill="#000" opacity="0.5" />

      {/* Stand: a tilting arm on a weighted foot. */}
      <path d="M286 354 H334 L330 408 H290 Z" fill={`url(#rail-${id})`} />
      <path d="M232 408 H388 Q398 408 398 416 V424 Q398 432 388 432 H232 Q222 432 222 424 V416 Q222 408 232 408 Z" fill={`url(#rail-${id})`} />
      <path d="M46 30 Q36 36 36 52" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

/** A fabric-wrapped speaker: a rounded cylinder with a lit top surface. */
function speaker({ id }: DrawProps) {
  return (
    <>
      <Ground id={id} cx={160} cy={354} rx={100} ry={14} />

      {/* Body */}
      <path d="M44 150 Q44 54 160 54 Q276 54 276 150 V268 Q276 340 160 340 Q44 340 44 268 Z" fill={`url(#body-${id})`} />
      <path d="M44 150 Q44 54 160 54 Q276 54 276 150 V268 Q276 340 160 340 Q44 340 44 268 Z" fill={`url(#glass-${id})`} />
      {/* Mesh, as a horizontal weave rather than a dot grid — cheaper and reads better small. */}
      {Array.from({ length: 11 }, (_, row) => (
        <path
          key={row}
          d={`M58 ${104 + row * 20} Q160 ${112 + row * 20} 262 ${104 + row * 20}`}
          stroke="#000"
          strokeOpacity="0.08"
          strokeWidth="3"
          fill="none"
        />
      ))}
      {/* Backlit top control surface */}
      <ellipse cx="160" cy="76" rx="92" ry="30" fill="#000" opacity="0.18" />
      <ellipse cx="160" cy="74" rx="78" ry="24" fill={`url(#screen-${id})`} />
      <path d="M134 74 H148 M172 74 H186" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 128 Q48 140 48 164" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" fill="none" />
    </>
  );
}

/** A low-profile keyboard, seen from slightly above. */
function keyboard({ id }: DrawProps) {
  const keys: React.ReactElement[] = [];
  const rows = [16, 15, 14, 13, 8];
  rows.forEach((count, row) => {
    const y = 96 + row * 34;
    for (let col = 0; col < count; col += 1) {
      // The bottom row is a wide spacebar flanked by modifiers.
      const wide = row === 4 && col === 4;
      const x = 64 + col * 32 + (row === 4 && col > 4 ? 128 : 0);
      keys.push(
        <rect
          key={`${row}-${col}`}
          x={x}
          y={y}
          width={wide ? 150 : 26}
          height={24}
          rx={5}
          fill="#000"
          opacity="0.14"
        />,
      );
    }
  });

  return (
    <>
      <Ground id={id} cx={310} cy={268} rx={250} ry={14} />
      {/* Deck, with a visible back edge so it is not a flat rectangle. */}
      <path d="M46 72 L574 72 L590 236 Q590 250 574 250 H46 Q30 250 30 236 Z" fill={`url(#body-${id})`} />
      <path d="M46 72 L574 72 L578 86 H42 Z" fill={`url(#rail-${id})`} />
      <path d="M46 72 L574 72 L590 236 Q590 250 574 250 H46 Q30 250 30 236 Z" fill={`url(#glass-${id})`} />
      {keys}
      {/* Touch ID */}
      <rect x="546" y="96" width="26" height="24" rx="12" fill="#000" opacity="0.22" />
      <path d="M44 78 Q32 88 32 104" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
    </>
  );
}

const DRAWINGS: Record<RenderKind, (props: DrawProps) => React.ReactElement> = {
  phone: (props) => phone(props),
  'phone-pro': (props) => phone({ ...props, pro: true }),
  laptop,
  desktop,
  compact,
  tablet,
  watch,
  earbuds,
  case: phoneCase,
  puck,
  stylus,
  headphones,
  display,
  speaker,
  keyboard,
};
