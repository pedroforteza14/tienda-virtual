import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatARS } from '@/lib/money';
import { site, whatsappLink } from '@/config/site';
import { OrderReferenceSchema } from '@/lib/validation/schemas';
import { buildMetadata } from '@/lib/seo/metadata';
import { getOwnedOrderDTO } from '@/server/orders/order-service';
import { currentSessionId, getAuthSession } from '@/server/security/session';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProductRender } from '@/components/product/ProductRender';
import { PRICES_ARE_MOCK } from '@/data/catalog';
import type { OrderStatus } from '@/types/commerce';
import type { RenderKind } from '@/types/catalog';

export const metadata: Metadata = buildMetadata({
  title: 'Tu pedido',
  description: 'Detalle de tu pedido en OWNER STORE.',
  path: '/pedido',
  noIndex: true,
});

/** Never cached: it is per-session and authorization-checked on every request. */
export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<OrderStatus, { label: string; tone: 'ok' | 'low' | 'out' | 'brass'; detail: string }> = {
  pending_payment: {
    label: 'Esperando pago',
    tone: 'low',
    detail: 'Reservamos tu equipo. En cuanto se acredite el pago, lo despachamos.',
  },
  paid: {
    label: 'Pago confirmado',
    tone: 'ok',
    detail: 'Ya estamos preparando el envío. Te escribimos con el seguimiento.',
  },
  review: {
    label: 'En revisión',
    tone: 'brass',
    detail: 'El importe acreditado no coincide con el pedido. Lo estamos revisando a mano.',
  },
  cancelled: { label: 'Cancelado', tone: 'out', detail: 'Este pedido fue cancelado.' },
  expired: {
    label: 'Vencido',
    tone: 'out',
    detail: 'Pasó el plazo de pago y liberamos el stock. Podés volver a armarlo.',
  },
};

/**
 * Order confirmation.
 *
 * The IDOR surface, on a page rather than an API, and closed the same way:
 * `getOwnedOrderDTO` compares the order's owner key against one derived from the
 * **signed session**, and a mismatch is reported as `notFound()` — identical to a
 * reference that does not exist. Guessing a reference tells an attacker nothing,
 * and the reference itself is 10 characters of CSPRNG output.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  // Validate the shape before it is used as a lookup key.
  const parsed = OrderReferenceSchema.safeParse(decodeURIComponent(reference));
  if (!parsed.success) notFound();

  const sessionId = await currentSessionId();
  const auth = await getAuthSession(sessionId);

  const order = await getOwnedOrderDTO(parsed.data, sessionId, auth?.userId ?? null);
  // "Not yours" and "does not exist" are the same answer.
  if (!order) notFound();

  const status = STATUS_COPY[order.status];
  const payable =
    order.paymentMethod === 'transfer' ? order.totals.transferTotal : order.totals.cardTotal;

  return (
    <div
      // Light surface: this page gets printed and forwarded.
      data-surface="light"
      className="min-h-dvh bg-surface pt-[calc(var(--header-h)+2rem)] text-fg"
    >
      <div className="u-container u-section-tight max-w-4xl">
        <p className="u-label">Pedido confirmado</p>

        <h1 className="u-display mt-4 text-h2">
          Gracias, {order.customer.name.split(' ')[0]}.
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="u-mono text-lead">{order.reference}</p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <p className="u-prose mt-4 text-body text-fg-dim">
          {status.detail}
        </p>

        {order.status === 'pending_payment' && order.paymentMethod === 'transfer' ? (
          <section
            aria-labelledby="transfer-heading"
            className="mt-10 rounded-[var(--radius-lg)] border border-line-strong p-6"
          >
            <h2 id="transfer-heading" className="u-label">
              Datos para transferir
            </h2>
            <dl className="u-mono mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Titular', 'OWNER STORE SRL (demo)'],
                ['CBU', '0000003100000000000000'],
                ['Alias', 'owner.store.demo'],
                ['Importe', formatARS(payable)],
                ['Referencia', order.reference],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="u-label">{label}</dt>
                  <dd className="mt-1 text-body">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="u-mono mt-5 text-micro text-fg-faint">
              Mandanos el comprobante por WhatsApp citando la referencia y lo acreditamos en el día.
              {PRICES_ARE_MOCK ? ' Estos datos bancarios son de demostración.' : ''}
            </p>
          </section>
        ) : null}

        {/* Items */}
        <section aria-labelledby="items-heading" className="mt-10">
          <h2 id="items-heading" className="u-label">
            Tu equipo
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {order.lines.map((line) => (
              <li key={line.sku} className="flex items-center gap-4 py-4">
                <span className="relative grid size-16 flex-none place-items-center rounded-[var(--radius-sm)] bg-surface-sunken">
                  <ProductRender
                    kind={line.render as RenderKind}
                    color={{ hex: line.colorHex, hexAccent: line.colorHex, name: line.colorName }}
                    productName={line.productName}
                    className="h-12 w-12"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body">{line.productName}</p>
                  <p className="u-mono text-micro text-fg-dim">
                    {[line.colorName, line.variantLabel].filter(Boolean).join(' · ')} · ×{line.qty}
                  </p>
                </div>
                <p className="u-mono flex-none text-body">
                  {formatARS(line.lineTotal)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Totals — the server's snapshot, shown exactly as stored. */}
        <dl className="u-mono mt-6 flex flex-col gap-2 text-tiny">
          <Row label="Subtotal" value={formatARS(order.totals.subtotal)} />
          {order.totals.promoDiscount > 0 ? (
            <Row label="Descuento" value={`− ${formatARS(order.totals.promoDiscount)}`} />
          ) : null}
          <Row
            label="Envío"
            value={order.totals.shipping === 0 ? 'Sin cargo' : formatARS(order.totals.shipping)}
          />
          {order.paymentMethod === 'transfer' ? (
            <Row
              label={`Descuento transferencia ${site.commerce.transferDiscountPercent}%`}
              value={`− ${formatARS(order.totals.transferDiscount)}`}
            />
          ) : null}
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
            <dt className="u-label normal-case tracking-[0.1em] text-fg">Total</dt>
            <dd className="u-mono text-h4 font-semibold">{formatARS(payable)}</dd>
          </div>
        </dl>

        {/* Delivery */}
        <section aria-labelledby="delivery-heading" className="mt-10">
          <h2 id="delivery-heading" className="u-label">
            Entrega
          </h2>
          <p className="mt-3 text-tiny text-fg-dim">
            {order.shipping.zone === 'pickup' ? (
              site.store.pickupNote
            ) : (
              <>
                {order.shipping.street}, {order.shipping.city}
                <br />
                {order.shipping.province} ({order.shipping.postalCode})
              </>
            )}
            {order.shipping.notes ? (
              <>
                <br />
                <span className="text-fg-faint">{order.shipping.notes}</span>
              </>
            ) : null}
          </p>
        </section>

        <div className="mt-12 flex flex-wrap gap-3" data-print="hide">
          <ButtonLink
            href={whatsappLink(
              `Hola OWNER, te escribo por el pedido ${order.reference}.`,
            )}
            external
            size="lg"
          >
            Escribir por WhatsApp
          </ButtonLink>
          <ButtonLink href="/tienda" variant="secondary" size="lg">
            Seguir comprando
          </ButtonLink>
        </div>

        <p className="u-mono mt-10 text-micro text-fg-faint" data-print="hide">
          Guardá esta referencia: <span className="text-fg-dim">{order.reference}</span>.
          Podés volver a esta página desde{' '}
          <Link href="/cuenta" className="inline-block py-1 underline">
            tu cuenta
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-dim">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
