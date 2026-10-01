'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatARS } from '@/lib/money';
import { site } from '@/config/site';
import { apiFetch } from '@/lib/http/client';
import { cn } from '@/lib/utils/cn';
import {
  CheckoutSchema,
  CustomerSchema,
  ShippingSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/lib/validation/schemas';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useCommerce } from '@/features/cart/CommerceProvider';
import type { PaymentMethod, PricedCart, ShippingZone } from '@/types/commerce';

/**
 * ============================================================================
 *  CHECKOUT — four steps, server-priced, mobile-first.
 * ============================================================================
 *
 * The security shape, which is the whole point of this file:
 *
 *  - the request body carries a customer, a shipping zone and address, a payment
 *    method, a promo *code* and a terms acceptance. **No amount of any kind**, and
 *    no card data — the card is entered on the provider's own page;
 *  - the running total comes from `POST /api/cart/quote`, which prices the cart
 *    server-side for the chosen zone and method. This component displays figures;
 *    it never derives them;
 *  - the same Zod schemas validate here and on the server. The client-side pass is
 *    a convenience so errors appear before a round trip — the server re-parses
 *    everything, always.
 *
 * Friction, deliberately minimised: three fields in step one, no account required,
 * a showroom-pickup path that asks for **no address at all** (the least data we can
 * fulfil with), and every field carrying the right `autoComplete` token so a phone
 * fills the form in one tap.
 */

interface ShippingOption {
  zone: ShippingZone;
  label: string;
  detail: string;
  flatRate: number;
  etaDays: [number, number];
  requiresAddress: boolean;
}

const STEPS = ['Tus datos', 'Entrega', 'Pago', 'Revisión'] as const;

export function CheckoutFlow({ shippingOptions }: { shippingOptions: ShippingOption[] }) {
  const router = useRouter();
  const { cart, refresh } = useCommerce();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [shipping, setShipping] = useState({
    zone: 'caba' as ShippingZone,
    street: '',
    city: '',
    province: '',
    postalCode: '',
    notes: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /** The server's price for the current zone and method. */
  const [quote, setQuote] = useState<PricedCart>(cart);

  const option = shippingOptions.find((candidate) => candidate.zone === shipping.zone);
  const needsAddress = option?.requiresAddress ?? true;

  /** Re-quote whenever the zone or the method changes. Never computed locally. */
  const requote = useCallback(
    async (zone: ShippingZone, method: PaymentMethod) => {
      const result = await apiFetch<{ cart: PricedCart }>('/api/cart/quote', {
        method: 'POST',
        body: { zone, paymentMethod: method },
      });
      if (result.ok) setQuote(result.data.cart);
    },
    [],
  );

  useEffect(() => {
    void requote(shipping.zone, paymentMethod);
  }, [shipping.zone, paymentMethod, requote]);

  useEffect(() => {
    setQuote(cart);
  }, [cart]);

  /** Focus the step heading on change, so the move is announced. */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function goNext() {
    setFormError(null);

    if (step === 0) {
      const parsed = CustomerSchema.safeParse(customer);
      if (!parsed.success) {
        setErrors(toFieldErrors(parsed.error));
        return;
      }
    }

    if (step === 1) {
      const payload = needsAddress
        ? { ...shipping, notes: shipping.notes || undefined }
        : { zone: shipping.zone, notes: shipping.notes || undefined };
      const parsed = ShippingSchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(toFieldErrors(parsed.error));
        return;
      }
    }

    setErrors({});
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit() {
    setFormError(null);

    const payload = {
      customer,
      shipping: needsAddress
        ? {
            zone: shipping.zone,
            street: shipping.street,
            city: shipping.city,
            province: shipping.province,
            postalCode: shipping.postalCode,
            ...(shipping.notes ? { notes: shipping.notes } : {}),
          }
        : { zone: shipping.zone, ...(shipping.notes ? { notes: shipping.notes } : {}) },
      paymentMethod,
      acceptedTerms,
    };

    // Final client-side pass against the same schema the server uses.
    const parsed = CheckoutSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      setFormError('Revisá los datos marcados.');
      return;
    }

    setSubmitting(true);
    const result = await apiFetch<{ order: { reference: string } }>('/api/checkout', {
      method: 'POST',
      body: parsed.data,
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.fields ?? {});
      setFormError(result.message);
      // A stock conflict changes the cart, so pull the server's version.
      if (result.code === 'conflict') void refresh();
      return;
    }

    await refresh();
    router.push(`/pedido/${result.data.order.reference}`);
  }

  if (cart.lines.length === 0) {
    return (
      <div className="u-container u-section text-center">
        <h1 className="u-display text-[var(--text-step-4)]">Tu carrito está vacío</h1>
        <p className="u-prose mx-auto mt-4 text-[var(--text-step-0)] text-[var(--text-dim)]">
          Agregá un producto y volvé para completar la compra.
        </p>
        <ButtonLink href="/tienda" size="lg" className="mt-8">
          Ver catálogo
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="u-container u-section grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
      <div>
        {/* Step indicator */}
        <ol className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Pasos del checkout">
          {STEPS.map((label, index) => (
            <li key={label} className="u-mono flex items-center gap-2 text-[var(--text-step--2)]">
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full border text-[0.5625rem]',
                  index === step
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
                    : index < step
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-[var(--line)] text-[var(--text-faint)]',
                )}
              >
                {index < step ? '✓' : index + 1}
              </span>
              <span
                className={cn(
                  'uppercase tracking-[0.12em]',
                  index === step ? 'text-[var(--text)]' : 'text-[var(--text-faint)]',
                )}
                aria-current={index === step ? 'step' : undefined}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="u-display mt-8 text-[var(--text-step-4)] outline-none"
        >
          {STEPS[step]}
        </h1>

        {/* ----------------------------- STEP 1 ---------------------------- */}
        {step === 0 ? (
          <div className="mt-8 flex max-w-xl flex-col gap-5">
            <TextField
              id="name"
              label="Nombre y apellido"
              autoComplete="name"
              required
              value={customer.name}
              error={errors.name}
              onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
            />
            <TextField
              id="email"
              type="email"
              label="Email"
              autoComplete="email"
              inputMode="email"
              required
              hint="Te mandamos el comprobante y el seguimiento acá."
              value={customer.email}
              error={errors.email}
              onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
            />
            <TextField
              id="phone"
              type="tel"
              label="Teléfono"
              autoComplete="tel"
              inputMode="tel"
              required
              hint="Con característica, sin el 0 ni el 15."
              value={customer.phone}
              error={errors.phone}
              onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
            />
          </div>
        ) : null}

        {/* ----------------------------- STEP 2 ---------------------------- */}
        {step === 1 ? (
          <div className="mt-8 flex max-w-xl flex-col gap-6">
            <fieldset>
              <legend className="u-label mb-3">Cómo lo recibís</legend>
              <div className="flex flex-col gap-2">
                {shippingOptions.map((candidate) => (
                  <label
                    key={candidate.zone}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-4 transition-colors',
                      shipping.zone === candidate.zone
                        ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
                        : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="zone"
                      value={candidate.zone}
                      checked={shipping.zone === candidate.zone}
                      onChange={() => setShipping({ ...shipping, zone: candidate.zone })}
                      className="mt-1 size-4 flex-none accent-[var(--accent)]"
                    />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[var(--text-step-0)] text-[var(--text)]">
                          {candidate.label}
                        </span>
                        <span className="u-mono text-[var(--text-step--1)] text-[var(--text-dim)]">
                          {candidate.flatRate === 0 ? 'Sin cargo' : formatARS(candidate.flatRate)}
                        </span>
                      </span>
                      <span className="u-mono mt-1 block text-[var(--text-step--2)] text-[var(--text-faint)]">
                        {candidate.detail} ·{' '}
                        {candidate.etaDays[0] === 0
                          ? 'mismo día'
                          : `${candidate.etaDays[0]}-${candidate.etaDays[1]} días hábiles`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Pickup collects no address: the least data we can fulfil with. */}
            {needsAddress ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="street"
                  label="Calle y número"
                  autoComplete="street-address"
                  required
                  wrapperClassName="sm:col-span-2"
                  value={shipping.street}
                  error={errors.street}
                  onChange={(event) => setShipping({ ...shipping, street: event.target.value })}
                />
                <TextField
                  id="city"
                  label="Localidad"
                  autoComplete="address-level2"
                  required
                  value={shipping.city}
                  error={errors.city}
                  onChange={(event) => setShipping({ ...shipping, city: event.target.value })}
                />
                <TextField
                  id="province"
                  label="Provincia"
                  autoComplete="address-level1"
                  required
                  value={shipping.province}
                  error={errors.province}
                  onChange={(event) => setShipping({ ...shipping, province: event.target.value })}
                />
                <TextField
                  id="postalCode"
                  label="Código postal"
                  autoComplete="postal-code"
                  required
                  hint="Ej. 1425 o C1425DKE"
                  value={shipping.postalCode}
                  error={errors.postalCode}
                  onChange={(event) => setShipping({ ...shipping, postalCode: event.target.value })}
                />
              </div>
            ) : (
              <p className="u-mono rounded-[var(--radius-sm)] border border-[var(--line)] p-4 text-[var(--text-step--1)] text-[var(--text-dim)]">
                {site.store.pickupNote} Te escribimos para coordinar el turno.
              </p>
            )}

            <TextAreaField
              id="notes"
              label="Indicaciones (opcional)"
              hint="Piso, timbre, horario preferido."
              value={shipping.notes}
              error={errors.notes}
              onChange={(event) => setShipping({ ...shipping, notes: event.target.value })}
            />
          </div>
        ) : null}

        {/* ----------------------------- STEP 3 ---------------------------- */}
        {step === 2 ? (
          <div className="mt-8 flex max-w-xl flex-col gap-6">
            <fieldset>
              <legend className="u-label mb-3">Medio de pago</legend>
              <div className="flex flex-col gap-2">
                <PaymentOption
                  checked={paymentMethod === 'transfer'}
                  onSelect={() => setPaymentMethod('transfer')}
                  title={`Transferencia · ${site.commerce.transferDiscountPercent}% off`}
                  detail="Te pasamos el CBU al confirmar. Acreditación en el día."
                  amount={formatARS(quote.totals.transferTotal)}
                />
                <PaymentOption
                  checked={paymentMethod === 'card'}
                  onSelect={() => setPaymentMethod('card')}
                  title={`Tarjeta · ${site.commerce.interestFreeInstalments} cuotas sin interés`}
                  detail="Pagás en el sitio seguro del procesador. No vemos tu tarjeta."
                  amount={formatARS(quote.totals.cardTotal)}
                />
              </div>
            </fieldset>

            <p className="u-mono text-[var(--text-step--2)] text-[var(--text-faint)]">
              Los datos de tu tarjeta se ingresan directamente en el procesador de pagos. OWNER no
              los recibe ni los almacena.
            </p>
          </div>
        ) : null}

        {/* ----------------------------- STEP 4 ---------------------------- */}
        {step === 3 ? (
          <div className="mt-8 flex max-w-xl flex-col gap-6">
            <ReviewBlock title="Tus datos" onEdit={() => setStep(0)}>
              {customer.name}
              <br />
              {customer.email}
              <br />
              {customer.phone}
            </ReviewBlock>

            <ReviewBlock title="Entrega" onEdit={() => setStep(1)}>
              {option?.label}
              {needsAddress ? (
                <>
                  <br />
                  {shipping.street}, {shipping.city}
                  <br />
                  {shipping.province} ({shipping.postalCode})
                </>
              ) : null}
              {shipping.notes ? (
                <>
                  <br />
                  <span className="text-[var(--text-faint)]">{shipping.notes}</span>
                </>
              ) : null}
            </ReviewBlock>

            <ReviewBlock title="Pago" onEdit={() => setStep(2)}>
              {paymentMethod === 'transfer'
                ? `Transferencia — ${formatARS(quote.totals.transferTotal)}`
                : `Tarjeta — ${formatARS(quote.totals.cardTotal)} en ${
                    quote.totals.instalments?.count ?? site.commerce.interestFreeInstalments
                  } cuotas`}
            </ReviewBlock>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                aria-describedby={errors.acceptedTerms ? 'terms-error' : undefined}
                aria-invalid={errors.acceptedTerms ? true : undefined}
                className="mt-1 size-4 flex-none accent-[var(--accent)]"
              />
              <span className="text-[var(--text-step--1)] text-[var(--text-dim)]">
                Acepto los{' '}
                <Link href="/legal/terminos" className="text-[var(--accent)] underline">
                  términos y condiciones
                </Link>{' '}
                y la{' '}
                <Link href="/legal/privacidad" className="text-[var(--accent)] underline">
                  política de privacidad
                </Link>
                .
              </span>
            </label>
            {errors.acceptedTerms ? (
              <p id="terms-error" role="status" className="u-mono text-[var(--color-signal-err)]">
                {errors.acceptedTerms}
              </p>
            ) : null}
          </div>
        ) : null}

        {formError ? (
          <p
            role="status"
            className="u-mono mt-6 max-w-xl rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-signal-err)_50%,transparent)] p-4 text-[var(--text-step--1)] text-[var(--color-signal-err)]"
          >
            {formError}
          </p>
        ) : null}

        {/* Navigation. Primary action on the right on desktop, full-width first on
            mobile — the thumb is at the bottom of the screen. */}
        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setErrors({});
                setFormError(null);
                setStep((current) => Math.max(0, current - 1));
              }}
              className="border border-[var(--line)]"
            >
              ← Volver
            </Button>
          ) : (
            <ButtonLink href="/tienda" variant="ghost" className="border border-[var(--line)]">
              ← Seguir comprando
            </ButtonLink>
          )}

          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={goNext} className="sm:min-w-56">
              Continuar
            </Button>
          ) : (
            <Button size="lg" loading={submitting} onClick={() => void submit()} className="sm:min-w-56">
              Confirmar pedido
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------ SUMMARY ----------------------------- */}
      <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
        <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <h2 id="summary-heading" className="u-label">
            Tu pedido
          </h2>

          <ul className="mt-4 flex flex-col gap-3">
            {quote.lines.map((line) => (
              <li key={line.sku} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[var(--text-step--1)]">
                    {line.productName}
                    <span className="u-mono text-[var(--text-faint)]"> ×{line.qty}</span>
                  </p>
                  <p className="u-mono text-[var(--text-step--2)] text-[var(--text-faint)]">
                    {[line.colorName, line.variantLabel].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className="u-mono flex-none text-[var(--text-step--1)]">
                  {formatARS(line.lineTotal)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="u-mono mt-5 flex flex-col gap-2 border-t border-[var(--line)] pt-4 text-[var(--text-step--1)]">
            <SummaryRow label="Subtotal" value={formatARS(quote.totals.subtotal)} />
            {quote.totals.promoDiscount > 0 ? (
              <SummaryRow
                label={`Descuento ${quote.promo?.code ?? ''}`}
                value={`− ${formatARS(quote.totals.promoDiscount)}`}
                tone="ok"
              />
            ) : null}
            <SummaryRow
              label="Envío"
              value={
                quote.totals.shipping === 0
                  ? quote.totals.freeShippingApplied
                    ? 'Gratis'
                    : 'Sin cargo'
                  : formatARS(quote.totals.shipping)
              }
            />
            {paymentMethod === 'transfer' ? (
              <SummaryRow
                label={`Descuento transferencia ${site.commerce.transferDiscountPercent}%`}
                value={`− ${formatARS(quote.totals.transferDiscount)}`}
                tone="ok"
              />
            ) : null}

            <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-3">
              <dt className="u-label normal-case tracking-[0.1em] text-[var(--text)]">Total</dt>
              <dd className="u-mono text-[var(--text-step-2)] font-semibold">
                {formatARS(
                  paymentMethod === 'transfer' ? quote.totals.transferTotal : quote.totals.cardTotal,
                )}
              </dd>
            </div>

            {paymentMethod === 'card' && quote.totals.instalments ? (
              <SummaryRow
                label={`${quote.totals.instalments.count} cuotas sin interés`}
                value={`${formatARS(quote.totals.instalments.amount)}/mes`}
                tone="brass"
              />
            ) : null}
          </dl>
        </div>
      </aside>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'brass';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-dim)]">{label}</dt>
      <dd
        className={
          tone === 'ok'
            ? 'text-[var(--color-signal-ok)]'
            : tone === 'brass'
              ? 'text-[var(--accent)]'
              : 'text-[var(--text)]'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PaymentOption({
  checked,
  onSelect,
  title,
  detail,
  amount,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  amount: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-4 transition-colors',
        checked
          ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
          : 'border-[var(--line)] hover:border-[var(--line-strong)]',
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 flex-none accent-[var(--accent)]"
      />
      <span className="flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[var(--text-step-0)] text-[var(--text)]">{title}</span>
          <span className="u-mono text-[var(--text-step--1)] font-semibold">{amount}</span>
        </span>
        <span className="u-mono mt-1 block text-[var(--text-step--2)] text-[var(--text-faint)]">
          {detail}
        </span>
      </span>
    </label>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="u-label">{title}</h2>
        <button
          type="button"
          onClick={onEdit}
          className="u-mono text-[var(--text-step--2)] uppercase tracking-[0.12em] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
        >
          Editar
          <span className="sr-only"> {title}</span>
        </button>
      </div>
      <p className="mt-3 text-[var(--text-step--1)] text-[var(--text-dim)]">{children}</p>
    </div>
  );
}
