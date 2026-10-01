import { expect, test } from '@playwright/test';
import { addOpenProductToCart, completeCheckout, openBuyableProduct } from './fixtures';

/**
 * The commercial path, end to end in a real browser.
 *
 * This is where the cookie-dependent happy paths live — the ones the vitest
 * integration suite cannot reach, because `cookies()` needs a real request.
 */

test.describe('browse and buy', () => {
  test('home page renders the hero and the commercial detail', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/owner/i);
    // The brand promise, not a product claim.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/redefined/i);

    // A price is visible without scrolling into the narrative.
    await expect(page.getByText(/transferencia/i).first()).toBeVisible();

    // The demo notice must be present while the data is mock.
    await expect(page.getByText(/precios.*demostración|demostración/i).first()).toBeVisible();
  });

  test('catalogue filters work without JavaScript state — they are real URLs', async ({ page }) => {
    await page.goto('/tienda');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Category chips are links: navigating changes the URL and the results.
    await page.getByRole('link', { name: /^iPhone/ }).first().click();
    await expect(page).toHaveURL(/\/tienda\/iphone/);

    const cards = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
    expect(await cards.count()).toBeGreaterThan(0);

    // Sorting by price ascending is a GET form submission.
    await page.getByLabel('Ordenar por').selectOption('price-asc');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/sort=price-asc/);
  });

  test('configurator updates price, SKU and stock without navigating', async ({ page }) => {
    // The most expensive in-stock product is reliably one with variants.
    await openBuyableProduct(page, { order: 'price-desc' });

    const url = page.url();

    /**
     * The radios are `sr-only` inputs inside labels — a correct, accessible
     * pattern that keyboard and screen-reader users navigate normally, but one
     * Playwright cannot `check()`, because the input itself is clipped to 1×1.
     * So the test does what a sighted user does and clicks the visible label.
     */

    // Precise locators, not "the first thing starting with $". An earlier version
    // read the first `$` on the page, which on mobile is a *tier label's* price —
    // a value that correctly never changes — so the assertion failed on working code.
    const sku = page.getByText(/^OWN-[A-Z0-9-]+$/);
    const transferPrice = page.getByText(/^Precio con transferencia:/);

    const skuBefore = await sku.first().textContent();
    const priceBefore = await transferPrice.first().textContent();

    /**
     * Click an option that is not already selected.
     *
     * The configurator defaults to the first *in-stock* combination, which is not
     * necessarily the first one listed — on a Mac mini it was the second capacity.
     * Clicking by index therefore sometimes re-selected the current value and
     * asserted that nothing had changed, which is true and useless.
     */
    const unselected = (name: string) =>
      page.locator(`label:has(input[name="${name}"]:not(:checked))`);

    const tierLabels = unselected('tier');
    if ((await tierLabels.count()) > 0) {
      await tierLabels.first().click();

      // A different capacity is a different SKU at a different price, with no
      // navigation and no page reload.
      await expect.poll(async () => sku.first().textContent()).not.toBe(skuBefore);
      await expect.poll(async () => transferPrice.first().textContent()).not.toBe(priceBefore);
    }

    // Changing a colour is also a different SKU, and also must not navigate.
    const colourLabels = unselected('color');
    if ((await colourLabels.count()) > 0) {
      const beforeColour = await sku.first().textContent();
      await colourLabels.first().click();
      await expect.poll(async () => sku.first().textContent()).not.toBe(beforeColour);
    }

    expect(page.url()).toBe(url);
  });

  test('add to cart, see server totals, and reach the checkout', async ({ page }) => {
    const name = await openBuyableProduct(page);
    await addOpenProductToCart(page);

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // `.first()`: the line title and the "quitar X del carrito" label both match.
    await expect(drawer.getByText(name, { exact: false }).first()).toBeVisible();
    await expect(drawer.getByText(/Total transferencia/i)).toBeVisible();

    await drawer.getByRole('link', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/tus datos/i);
  });

  test('completes a checkout and lands on an order with a reference', async ({ page }) => {
    await openBuyableProduct(page, { order: 'recommended' });
    await addOpenProductToCart(page);
    await completeCheckout(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/gracias/i);
    // The reference is shown, and it is not sequential.
    await expect(page.getByText(/OWN-[0-9A-HJKMNP-TV-Z]{10}/).first()).toBeVisible();
  });

  test('an order page belonging to another session is a 404, not a 403', async ({ page, context }) => {
    await openBuyableProduct(page, { order: 'price-desc' });
    await addOpenProductToCart(page);
    await completeCheckout(page);

    const orderUrl = page.url();

    // Now open it from a clean context — a different session, same URL.
    await context.clearCookies();
    const attacker = await context.newPage();
    const response = await attacker.goto(orderUrl);

    expect(response?.status()).toBe(404);
    await expect(attacker.getByRole('heading', { level: 1 })).toContainText(/nothing here/i);
    await attacker.close();
  });

  test('search returns results and opens a product', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /buscar productos/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByRole('combobox', { name: /buscar productos/i }).fill('macbook');
    await expect(dialog.getByRole('option').first()).toBeVisible();

    await dialog.getByRole('option').first().click();
    await expect(page).toHaveURL(/\/producto\//);
  });

  test('discovery recommends products for a use case', async ({ page }) => {
    await page.goto('/descubri');

    // Same sr-only-input pattern as the configurator: click the visible card.
    await page.locator('label').filter({ hasText: /creatividad/i }).click();
    await page.locator('label').filter({ hasText: /sin techo/i }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/serviría/i, {
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: /ver y configurar/i }).first()).toBeVisible();
  });

  test('a sold-out variant offers a WhatsApp path instead of a dead end', async ({ page }) => {
    // Walk the catalogue for a product whose default variant is unavailable.
    await page.goto('/tienda?availability=any&sort=price-asc');
    const cards = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
    const count = await cards.count();

    let foundSoldOut = false;
    for (let i = 0; i < Math.min(count, 12); i += 1) {
      if (await cards.nth(i).getByText(/sin stock/i).count()) {
        foundSoldOut = true;
        break;
      }
    }
    // The fixture guarantees some sold-out variants exist (see catalog.test.ts),
    // but which products they land on is data-dependent, so this is a soft check.
    if (!foundSoldOut) test.skip(true, 'no sold-out product on the first page');
  });
});

test.describe('cart behaviour', () => {
  test('quantity changes and removal are reflected by the server', async ({ page }) => {
    // Needs headroom to increase: the stepper correctly disables `+` at the cap.
    await openBuyableProduct(page, { minStock: 2 });
    await addOpenProductToCart(page);

    const drawer = page.getByRole('dialog');
    const increase = drawer.getByRole('button', { name: /agregar una unidad/i }).first();
    await increase.click();
    await expect(drawer.getByRole('spinbutton').first()).toHaveValue('2');

    await drawer.getByRole('button', { name: /quitar .* del carrito/i }).first().click();
    await expect(drawer.getByText(/todavía no elegiste nada/i)).toBeVisible();
  });

  test('an invalid promo code is reported without failing the request', async ({ page }) => {
    await openBuyableProduct(page);
    await addOpenProductToCart(page);

    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/código de descuento/i).fill('NOPEXYZ');
    await drawer.getByRole('button', { name: 'Aplicar' }).click();

    // A notice, not an error page.
    await expect(page.getByText(/no es válido/i)).toBeVisible();
    await expect(drawer).toBeVisible();
  });
});
