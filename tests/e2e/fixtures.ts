import type { Page } from '@playwright/test';

/**
 * Shared e2e helpers.
 *
 * The important one is `openBuyableProduct`. Tests used to hardcode a slug, which
 * broke twice over: the fixture's pseudo-random stock had left one product with
 * every variant at zero, and — more fundamentally — the whole suite shares one
 * server, so an order placed by one test genuinely reduces stock for another, and
 * parallel workers all racing for the single cheapest product exhaust it.
 *
 * None of that is an application bug: refusing to sell stock that does not exist
 * is the behaviour we want. The tests were wrong. A purchase-path test should
 * assert that *a* customer can buy *a* product, so this picks one that is
 * genuinely available, and picks it at random so parallel workers spread out
 * instead of fighting over the same SKU.
 */

export interface BuyableOptions {
  /** Sort order of the catalogue to choose from. `price-asc` keeps flows quick. */
  order?: 'price-asc' | 'price-desc' | 'recommended';
  /** Require at least this many units available, read from the quantity stepper. */
  minStock?: number;
}

/**
 * Navigate to a product that can actually be bought right now, and return its
 * name. Uses the real catalogue with the in-stock filter, so it exercises that
 * path too.
 */
export async function openBuyableProduct(
  page: Page,
  options: BuyableOptions = {},
): Promise<string> {
  const { order = 'price-asc', minStock = 1 } = options;

  await page.goto(`/tienda?availability=in-stock&sort=${order}`);

  const cards = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3 }) });

  const count = await cards.count();
  if (count === 0) throw new Error('Catalogue returned no in-stock products.');

  // Shuffle the candidate order so concurrent workers do not all take the first.
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  for (const index of indices) {
    const card = cards.nth(index);
    if (await card.getByText(/sin stock/i).count()) continue;

    const heading = card.getByRole('heading', { level: 3 });
    const name = (await heading.innerText()).trim();
    await heading.click();
    await page.waitForURL(/\/producto\//);

    // The listing can be a step behind the server, so confirm on the PDP — and
    // read available units from the quantity stepper's `max`, which is
    // `min(stock, MAX_QTY_PER_LINE)`.
    const addButton = page.getByRole('button', { name: /agregar al carrito/i });
    if (await addButton.count()) {
      const max = Number(
        (await page.locator('input[type="number"]').first().getAttribute('max')) ?? '0',
      );
      if (max >= minStock) return name;
    }

    await page.goto(`/tienda?availability=in-stock&sort=${order}`);
  }

  throw new Error(
    `No product with at least ${minStock} unit(s) available — the fixture is exhausted.`,
  );
}

/** Add the currently-open product to the cart and wait for the drawer. */
export async function addOpenProductToCart(page: Page): Promise<void> {
  await page.getByRole('button', { name: /agregar al carrito/i }).first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
}

/** Fill and submit the four checkout steps with showroom pickup (no address). */
export async function completeCheckout(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('link', { name: /checkout/i }).click();
  await page.waitForURL(/\/checkout/);

  await page.getByLabel(/nombre y apellido/i).fill('Ana López');
  await page.getByLabel(/^email/i).fill('ana@example.com');
  await page.getByLabel(/teléfono/i).fill('1145678900');
  await page.getByRole('button', { name: /continuar/i }).click();

  await page.getByRole('radio', { name: /retiro en showroom/i }).check();
  await page.getByRole('button', { name: /continuar/i }).click();

  // Payment step: the transfer default is fine.
  await page.getByRole('button', { name: /continuar/i }).click();

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /confirmar pedido/i }).click();
  await page.waitForURL(/\/pedido\/OWN-/, { timeout: 25_000 });
}
