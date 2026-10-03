import type { Metadata } from 'next';
import Link from 'next/link';
import { formatARS } from '@/lib/money';
import { buildMetadata } from '@/lib/seo/metadata';
import { listOwnedOrders } from '@/server/orders/order-service';
import { currentSessionId, getAuthSession } from '@/server/security/session';
import { userRepository } from '@/server/auth/user-repository';
import { AuthPanel } from '@/features/account/AuthPanel';
import { LogoutButton } from '@/features/account/LogoutButton';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Ledger } from '@/components/layout/Ledger';

export const metadata: Metadata = buildMetadata({
  title: 'Mi cuenta',
  description: 'Tus pedidos y datos en OWNER STORE.',
  path: '/cuenta',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Esperando pago',
  paid: 'Pagado',
  review: 'En revisión',
  cancelled: 'Cancelado',
  expired: 'Vencido',
};

/**
 * Account page.
 *
 * Identity comes from the server-side session record — never from a cookie claim
 * or a request field. The order list is scoped by the derived owner key, so this
 * page cannot show an order that does not belong to the current session, whatever
 * is in the URL.
 *
 * Guest orders are listed too: the signed session that placed them is the same one
 * reading this page, so someone who checked out without an account still finds
 * their order here.
 */
export default async function AccountPage() {
  const sessionId = await currentSessionId();
  const auth = await getAuthSession(sessionId);
  const user = auth ? await userRepository().findById(auth.userId) : null;
  const orders = await listOwnedOrders(sessionId, 20);

  return (
    <div className="relative pt-[calc(var(--header-h)+2rem)]">
      <Ledger />

      <div className="u-container u-section-tight relative max-w-4xl">
        <p className="u-label">Mi cuenta</p>

        {user ? (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="u-display text-h2">Hola, {user.name.split(' ')[0]}.</h1>
                <p className="u-mono mt-2 text-tiny text-fg-dim">
                  {user.email}
                </p>
              </div>
              <LogoutButton />
            </div>
          </>
        ) : (
          <>
            <h1 className="u-display mt-4 max-w-[20ch] text-h2">
              Tus pedidos, en un
              <span className="u-editorial ml-3 text-accent normal-case">lugar</span>.
            </h1>
            <div className="mt-10">
              <AuthPanel />
            </div>
          </>
        )}

        {/* Orders are shown whether or not there is an account, because a guest
            session owns its own orders. */}
        <section aria-labelledby="orders-heading" className="mt-16">
          <h2 id="orders-heading" className="u-label border-t border-line pt-6">
            Pedidos recientes
          </h2>

          {orders.length === 0 ? (
            <div className="mt-6">
              <p className="text-body text-fg-dim">
                Todavía no hiciste ningún pedido con esta sesión.
              </p>
              <ButtonLink href="/tienda" variant="secondary" size="md" className="mt-5">
                Ver catálogo
              </ButtonLink>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {orders.map((order) => (
                <li key={order.reference}>
                  <Link
                    href={`/pedido/${order.reference}`}
                    className="flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-surface-raised"
                  >
                    <div>
                      <p className="u-mono text-body">{order.reference}</p>
                      <p className="u-mono mt-1 text-micro text-fg-faint">
                        {new Date(order.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}{' '}
                        · {order.lines.length} {order.lines.length === 1 ? 'producto' : 'productos'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        tone={
                          order.status === 'paid'
                            ? 'ok'
                            : order.status === 'pending_payment'
                              ? 'low'
                              : order.status === 'review'
                                ? 'brass'
                                : 'out'
                        }
                      >
                        {STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                      <p className="u-mono text-body font-semibold">
                        {formatARS(
                          order.paymentMethod === 'transfer'
                            ? order.totals.transferTotal
                            : order.totals.cardTotal,
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
