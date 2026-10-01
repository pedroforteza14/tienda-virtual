'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatARS } from '@/lib/money';
import { site } from '@/config/site';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Overlay } from '@/components/ui/Overlay';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { ProductRender } from '@/components/product/ProductRender';
import { useCommerce } from '@/features/cart/CommerceProvider';
import { PRICES_ARE_MOCK } from '@/data/catalog';
import type { RenderKind } from '@/types/catalog';

/**
 * Cart drawer.
 *
 * Every figure shown here comes from the server's priced cart. This component does
 * no arithmetic at all — not even a subtotal — which is what makes it impossible
 * for the drawer to display a number the server would not charge.
 *
 * "Completá tu setup" suggests genuinely complementary items (a case for the phone
 * in the cart, headphones for the laptop). It is explicitly **not** manipulative:
 * no countdown, no fake scarcity, no "17 people are viewing this", and the real
 * stock figure is shown as-is.
 */
export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, setQty, removeLine, applyPromo, pending } = useCommerce();
  const [promoInput, setPromoInput] = useState('');

  const empty = cart.lines.length === 0;

  return (
    <Overlay
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      title={`Carrito${cart.itemCount > 0 ? ` · ${cart.itemCount}` : ''}`}
      side="right"
    >
      {empty ? (
        <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
          <span
            aria-hidden="true"
            className="size-20 rounded-full border border-[color-mix(in_oklab,var(--accent)_40%,transparent)]"
          />
          <p className="u-display-tight text-h4">Todavía no elegiste nada</p>
          <p className="u-prose text-tiny text-fg-dim">
            Arrancá por el catálogo, o contanos qué necesitás y te lo recomendamos.
          </p>
          <div className="mt-2 flex flex-col gap-2 self-stretch">
            <ButtonLink href="/tienda" size="md" block>
              Ver catálogo
            </ButtonLink>
            <ButtonLink href="/descubri" variant="secondary" size="md" block>
              Encontrá tu equipo
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {cart.lines.map((line) => (
              <li key={line.sku} className="flex gap-4 px-5 py-4">
                <Link
                  href={`/producto/${line.productSlug}`}
                  onClick={() => setCartOpen(false)}
                  className="relative grid size-20 flex-none place-items-center rounded-[var(--radius-sm)] bg-surface-sunken"
                >
                  <ProductRender
                    kind={line.render as RenderKind}
                    color={{ hex: line.colorHex, hexAccent: line.colorHex, name: line.colorName }}
                    productName={line.productName}
                    className="h-16 w-16"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/producto/${line.productSlug}`}
                        onClick={() => setCartOpen(false)}
                        className="block truncate text-tiny font-medium"
                      >
                        {line.productName}
                      </Link>
                      <p className="u-mono text-micro text-fg-dim">
                        {[line.colorName, line.variantLabel].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeLine(line.sku)}
                      className="u-mono -mr-1 px-2 py-1 text-micro text-fg-faint transition-colors hover:text-signal-err"
                    >
                      <span className="sr-only">Quitar {line.productName} del carrito</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <QuantityStepper
                      value={line.qty}
                      max={line.stock}
                      disabled={pending}
                      label={line.productName}
                      onChange={(next) => void setQty(line.sku, next)}
                    />
                    <p className="u-mono text-tiny font-semibold">
                      {formatARS(line.lineTotal)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <CompleteYourSetup />

          <div className="border-t border-line px-5 py-4">
            <label htmlFor="promo" className="u-label">
              Código de descuento
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="promo"
                value={cart.promo?.code ?? promoInput}
                readOnly={!!cart.promo}
                onChange={(event) => setPromoInput(event.target.value.toUpperCase().slice(0, 24))}
                placeholder="OWNER5"
                autoComplete="off"
                spellCheck={false}
                className="u-mono min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-transparent px-3 text-tiny uppercase placeholder:text-fg-faint focus:border-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (cart.promo) {
                    void applyPromo(null);
                    setPromoInput('');
                  } else if (promoInput.trim()) {
                    void applyPromo(promoInput.trim());
                  }
                }}
              >
                {cart.promo ? 'Quitar' : 'Aplicar'}
              </Button>
            </div>
            {cart.promo ? (
              <p className="u-mono mt-2 text-micro text-signal-ok">
                {cart.promo.label} aplicado
              </p>
            ) : null}
          </div>
        </>
      )}

      {!empty ? (
        <div className="sticky bottom-0 border-t border-line bg-surface-raised px-5 py-4">
          <dl className="u-mono flex flex-col gap-1.5 text-tiny">
            <Row label="Subtotal" value={formatARS(cart.totals.subtotal)} />
            {cart.totals.promoDiscount > 0 ? (
              <Row
                label={`Descuento ${cart.promo?.code ?? ''}`}
                value={`− ${formatARS(cart.totals.promoDiscount)}`}
                tone="ok"
              />
            ) : null}
            <Row
              label="Envío"
              value={
                cart.totals.shipping === 0
                  ? cart.totals.freeShippingApplied
                    ? 'Gratis'
                    : 'Se calcula en el checkout'
                  : formatARS(cart.totals.shipping)
              }
              muted
            />
            <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-3">
              <dt className="u-label normal-case tracking-[0.1em] text-fg">
                Total transferencia
              </dt>
              <dd className="u-mono text-lead font-semibold">
                {formatARS(cart.totals.transferTotal)}
              </dd>
            </div>
            <Row
              label={`O ${cart.totals.instalments?.count ?? site.commerce.interestFreeInstalments} cuotas sin interés`}
              value={
                cart.totals.instalments ? `${formatARS(cart.totals.instalments.amount)}/mes` : '—'
              }
              tone="brass"
            />
          </dl>

          <ButtonLink
            href="/checkout"
            size="lg"
            block
            className="mt-4"
            prefetch={false}
          >
            Ir al checkout
          </ButtonLink>

          {PRICES_ARE_MOCK ? (
            <p className="u-mono mt-3 text-center text-[0.5625rem] uppercase tracking-[0.14em] text-fg-faint">
              Precios de demostración
            </p>
          ) : null}
        </div>
      ) : null}
    </Overlay>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'brass';
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-fg-faint' : 'text-fg-dim'}>{label}</dt>
      <dd
        className={
          tone === 'ok'
            ? 'text-signal-ok'
            : tone === 'brass'
              ? 'text-accent'
              : 'text-fg'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Complementary products, derived from what is already in the cart.
 *
 * Honest cross-sell: real complements, real prices, no urgency theatre.
 */
function CompleteYourSetup() {
  const { cart, addToCart } = useCommerce();

  // Suggest an accessory only when the cart holds a device and no accessory yet.
  const hasAccessory = cart.lines.some((line) => line.render === 'case' || line.render === 'puck' || line.render === 'stylus');
  const hasAudio = cart.lines.some((line) => line.render === 'earbuds');
  const hasDevice = cart.lines.some((line) =>
    ['phone', 'phone-pro', 'laptop', 'tablet', 'desktop', 'compact'].includes(line.render),
  );

  if (!hasDevice || (hasAccessory && hasAudio)) return null;

  const suggestions: { sku: string; label: string; detail: string }[] = [];
  if (!hasAudio) {
    suggestions.push({
      sku: 'OWN-AIRPODSPRO3-WHT',
      label: 'AirPods Pro 3',
      detail: 'Cancelación de ruido',
    });
  }
  if (!hasAccessory) {
    suggestions.push({
      sku: 'OWN-MAGSAFECHARGER-WHT',
      label: 'Cargador MagSafe 25 W',
      detail: 'Carga magnética',
    });
  }

  return (
    <section aria-labelledby="setup-heading" className="border-t border-line px-5 py-4">
      <h3 id="setup-heading" className="u-label">
        Completá tu setup
      </h3>
      <ul className="mt-3 flex flex-col gap-2">
        {suggestions.map((item) => (
          <li key={item.sku} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-tiny">{item.label}</p>
              <p className="u-mono text-micro text-fg-faint">
                {item.detail}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void addToCart(item.sku, 1)}
              aria-label={`Agregar ${item.label} al carrito`}
              className="flex-none border border-line"
            >
              + Agregar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
