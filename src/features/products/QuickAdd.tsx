'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useCommerce } from '@/features/cart/CommerceProvider';

/**
 * Quick-add from a listing card.
 *
 * The smallest possible client island: a listing of twelve cards ships this
 * component once, not twelve server components' worth of JavaScript.
 *
 * It adds the cheapest in-stock variant — resolved on the server in `toCardData`,
 * so the SKU is one we know exists and can sell. The server re-validates anyway.
 *
 * Deliberately **not** wrapped in `<Magnetic>`. Doing so imported `motion` into the
 * catalogue route and pushed its first-load JS from ~105 kB to ~159 kB, for a 3 px
 * hover effect on a secondary button in a 12-up grid. The budget in
 * docs/motion-system.md says the catalogue ships no animation JS, and a measurement
 * that contradicts the budget means the effect goes, not the budget.
 */
export function QuickAdd({
  sku,
  productName,
  className,
}: {
  sku: string;
  productName: string;
  className?: string;
}) {
  const { addToCart } = useCommerce();
  const [busy, setBusy] = useState(false);

  return (
    <div className={className}>
      <Button
        variant="secondary"
        size="sm"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await addToCart(sku, 1);
          } finally {
            setBusy(false);
          }
        }}
        // The product name is in the accessible name, so a screen-reader user
        // moving between cards is never told only "agregar".
        aria-label={`Agregar ${productName} al carrito`}
      >
        Agregar
      </Button>
    </div>
  );
}
