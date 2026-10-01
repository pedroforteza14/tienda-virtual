'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatARS } from '@/lib/money';
import { site, whatsappLink } from '@/config/site';
import { cn } from '@/lib/utils/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StockBadge } from '@/components/ui/Badge';
import { PriceBlock } from '@/components/ui/PriceBlock';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Magnetic } from '@/components/motion/Magnetic';
import { ProductRender } from '@/components/product/ProductRender';
import { useCommerce } from '@/features/cart/CommerceProvider';
import type { RenderKind } from '@/types/catalog';

/**
 * ============================================================================
 *  THE CONFIGURATOR
 * ============================================================================
 *
 * Change colour or capacity and the render, the price, the stock, the SKU and the
 * financing all update together, instantly, with no navigation.
 *
 * The security-relevant design decision: **every price was computed on the server
 * and passed in.** This component does no arithmetic — it looks up the variant and
 * displays the figures it was given. It cannot produce a number the server would
 * not charge, and the SKU it sends is re-priced server-side anyway.
 *
 * Two interaction details that matter more than they sound:
 *  - the price **never animates position.** Mono tabular figures swap in place, so
 *    nothing jumps as you click through capacities. The device render cross-fades;
 *    the numbers do not;
 *  - an unavailable combination is not hidden. It is shown, marked, and still
 *    selectable, because silently removing an option leaves people hunting for a
 *    colour they saw a second ago.
 */

export interface ConfiguratorVariant {
  sku: string;
  colorId: string;
  /** Storage or case size. Null for products with neither. */
  tier: string | null;
  stock: number;
  list: number;
  transfer: number;
  instalment: number;
  instalmentCount: number;
}

export interface ConfiguratorProps {
  name: string;
  render: RenderKind;
  colors: { id: string; name: string; hex: string; hexAccent: string; light: boolean }[];
  tiers: string[];
  /** `Capacidad` for storage, `Tamaño` for Watch cases, null when absent. */
  tierLabel: string | null;
  variants: ConfiguratorVariant[];
  highlights: string[];
}

export function ProductConfigurator({
  name,
  render,
  colors,
  tiers,
  tierLabel,
  variants,
  highlights,
}: ConfiguratorProps) {
  const { addToCart } = useCommerce();
  const reduced = useReducedMotion();

  /** Default to the first combination that is actually in stock. */
  const initial = useMemo(() => {
    const available = variants.find((variant) => variant.stock > 0) ?? variants[0];
    return {
      colorId: available?.colorId ?? colors[0]?.id ?? '',
      tier: available?.tier ?? tiers[0] ?? null,
    };
  }, [variants, colors, tiers]);

  const [colorId, setColorId] = useState(initial.colorId);
  const [tier, setTier] = useState<string | null>(initial.tier);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const variant = useMemo(
    () =>
      variants.find(
        (candidate) => candidate.colorId === colorId && candidate.tier === tier,
      ) ?? null,
    [variants, colorId, tier],
  );

  const color = colors.find((candidate) => candidate.id === colorId) ?? colors[0]!;

  /** Stock per option, so each swatch and tier can state its own availability. */
  const colorStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const candidate of variants) {
      if (tier !== null && candidate.tier !== tier) continue;
      map.set(candidate.colorId, (map.get(candidate.colorId) ?? 0) + candidate.stock);
    }
    return map;
  }, [variants, tier]);

  const tierStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const candidate of variants) {
      if (candidate.colorId !== colorId || candidate.tier === null) continue;
      map.set(candidate.tier, (map.get(candidate.tier) ?? 0) + candidate.stock);
    }
    return map;
  }, [variants, colorId]);

  const soldOut = !variant || variant.stock <= 0;

  return (
    <div className="u-container grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      {/* ------------------------------- STAGE ------------------------------- */}
      <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
        <div className="relative grid aspect-square place-items-center overflow-hidden rounded-[var(--radius-xl)] bg-surface-raised">
          <span
            aria-hidden="true"
            className="absolute aspect-square w-[58%] rounded-full border border-[color-mix(in_oklab,var(--accent)_32%,transparent)]"
          />

          {/* Cross-fade on variant change: 120 ms out, 200 ms in, 1 % scale. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={color.id}
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.99 }}
              transition={{ duration: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative grid h-full w-full place-items-center p-8"
            >
              <ProductRender
                kind={render}
                color={color}
                productName={name}
                className="h-full w-auto"
                specular
                priority
              />
            </motion.div>
          </AnimatePresence>

          <p className="u-mono absolute bottom-4 left-5 text-micro text-fg-faint">
            {color.name}
          </p>
          {variant ? (
            <p className="u-mono absolute bottom-4 right-5 text-micro text-fg-faint">
              {variant.sku}
            </p>
          ) : null}
        </div>

        <ul className="mt-5 hidden gap-x-6 gap-y-2 lg:grid">
          {highlights.map((highlight) => (
            <li
              key={highlight}
              className="flex gap-3 text-tiny text-fg-dim"
            >
              <span aria-hidden="true" className="mt-2 size-1 flex-none rounded-full bg-accent" />
              {highlight}
            </li>
          ))}
        </ul>
      </div>

      {/* ----------------------------- CONTROLS ------------------------------ */}
      <div className="flex flex-col gap-8">
        {/* Price first on every viewport: the Instagram visitor is here to find
            out what it costs, and making them scroll for it loses the sale. */}
        <div>
          {variant ? (
            <PriceBlock
              list={variant.list}
              transfer={variant.transfer}
              instalment={variant.instalment}
              instalmentCount={variant.instalmentCount}
              size="lg"
            />
          ) : (
            <p className="u-mono text-lead text-fg-dim">
              Combinación no disponible
            </p>
          )}
          <div className="mt-4">
            <StockBadge stock={variant?.stock ?? 0} />
          </div>
        </div>

        {/* Colour */}
        <fieldset>
          <legend className="u-label mb-3">
            Color — <span className="text-fg">{color.name}</span>
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {colors.map((candidate) => {
              const stock = colorStock.get(candidate.id) ?? 0;
              const selected = candidate.id === colorId;
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    'relative grid size-11 cursor-pointer place-items-center rounded-full border transition-colors',
                    selected
                      ? 'border-accent'
                      : 'border-line hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="color"
                    value={candidate.id}
                    checked={selected}
                    onChange={() => setColorId(candidate.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-7 rounded-full border border-black/20',
                      stock === 0 && 'opacity-40',
                    )}
                    style={{
                      background: `linear-gradient(140deg, ${candidate.hexAccent}, ${candidate.hex})`,
                    }}
                  />
                  {/* The accessible name carries availability, so colour is never
                      the only signal. */}
                  <span className="sr-only">
                    {candidate.name}
                    {stock === 0 ? ' (sin stock)' : ''}
                  </span>
                  {stock === 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 grid place-items-center text-fg-faint"
                    >
                      <span className="h-px w-7 rotate-45 bg-current" />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Storage or size */}
        {tierLabel && tiers.length > 0 ? (
          <fieldset>
            <legend className="u-label mb-3">{tierLabel}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tiers.map((candidate) => {
                const stock = tierStock.get(candidate) ?? 0;
                const selected = candidate === tier;
                const option = variants.find(
                  (entry) => entry.colorId === colorId && entry.tier === candidate,
                );
                return (
                  <label
                    key={candidate}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 transition-colors',
                      selected
                        ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value={candidate}
                      checked={selected}
                      onChange={() => setTier(candidate)}
                      className="sr-only"
                    />
                    <span className="u-mono text-tiny">{candidate}</span>
                    <span className="u-mono text-right text-micro text-fg-dim">
                      {option ? formatARS(option.transfer) : '—'}
                      {stock === 0 ? (
                        <span className="block text-fg-faint">sin stock</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* Quantity + buy */}
        <div className="flex flex-col gap-4 border-t border-line pt-6">
          <div className="flex items-center justify-between gap-4">
            <span className="u-label">Cantidad</span>
            <QuantityStepper
              value={qty}
              max={variant?.stock ?? 1}
              disabled={soldOut}
              label={name}
              onChange={setQty}
            />
          </div>

          {soldOut ? (
            <>
              <Button variant="secondary" size="lg" block disabled>
                Sin stock
              </Button>
              <ButtonLink
                href={whatsappLink(
                  `Hola OWNER, quiero saber cuándo vuelve el ${name} en ${color.name}.`,
                )}
                external
                variant="ghost"
                size="md"
                block
                className="border border-line"
              >
                Avisame cuando llegue
              </ButtonLink>
            </>
          ) : (
            <Magnetic>
              <Button
                size="lg"
                block
                loading={busy}
                onClick={async () => {
                  if (!variant) return;
                  setBusy(true);
                  try {
                    await addToCart(variant.sku, qty);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Agregar al carrito
              </Button>
            </Magnetic>
          )}

          <ButtonLink
            href={whatsappLink(
              `Hola OWNER, me interesa el ${name} ${tier ?? ''} en ${color.name}. ¿Me pasás disponibilidad?`,
            )}
            external
            variant="ghost"
            size="md"
            block
            className="border border-line"
          >
            Consultar por WhatsApp
          </ButtonLink>
        </div>

        {/* Commercial detail. Specific, because specific reads as true. */}
        <dl className="u-mono flex flex-col gap-2.5 border-t border-line pt-6 text-tiny">
          <Fact label="Envío">
            Gratis en compras desde {formatARS(site.commerce.freeShippingThresholdPesos * 100)}. A
            todo el país, asegurado.
          </Fact>
          <Fact label="Retiro">{site.store.pickupNote}</Fact>
          <Fact label="Garantía">
            {site.commerce.warrantyMonths} meses por escrito, con comprobante de compra.
          </Fact>
          <Fact label="Pago">
            {site.commerce.interestFreeInstalments} cuotas sin interés con tarjeta, o{' '}
            {site.commerce.transferDiscountPercent}% off por transferencia.
          </Fact>
        </dl>

        {/* Mobile: the highlights the desktop column shows next to the render. */}
        <ul className="flex flex-col gap-2 lg:hidden">
          {highlights.map((highlight) => (
            <li key={highlight} className="flex gap-3 text-tiny text-fg-dim">
              <span aria-hidden="true" className="mt-2 size-1 flex-none rounded-full bg-accent" />
              {highlight}
            </li>
          ))}
        </ul>
      </div>

      {/* --------------------------- MOBILE BUY BAR ------------------------- */}
      {/* A separate mobile component, not a reflowed desktop one: the phone's job
          is speed to purchase, so price and CTA stay reachable at all times. */}
      {variant && !soldOut ? (
        <div
          className="fixed inset-x-0 bottom-14 z-30 border-t border-line bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] px-4 py-3 backdrop-blur-xl md:hidden"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="u-mono truncate text-tiny font-semibold">
                {formatARS(variant.transfer)}
              </p>
              <p className="u-mono truncate text-[0.5625rem] uppercase tracking-[0.12em] text-fg-faint">
                {color.name}
                {tier ? ` · ${tier}` : ''}
              </p>
            </div>
            <Button
              size="md"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await addToCart(variant.sku, qty);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex-none"
            >
              Agregar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
      <dt className="u-label">{label}</dt>
      <dd className="text-fg-dim">{children}</dd>
    </div>
  );
}
