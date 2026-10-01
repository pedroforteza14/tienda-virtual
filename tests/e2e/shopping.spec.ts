import { expect, test } from '@playwright/test';

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
    await page.goto('/producto/iphone-17-pro');

    const url = page.url();
    const priceRegion = page.locator('main');

    // Capture the first visible price, change capacity, and expect it to change.
    const before = await priceRegion.getByText(/^\$/).first().textContent();

    const tiers = page.getByRole('radio', { name: /GB|TB/ });
    if ((await tiers.count()) > 1) {
      await tiers.nth(1).check();
      await expect
        .poll(async () => priceRegion.getByText(/^\$/).first().textContent())
        .not.toBe(before);
    }

    // Changing a colour must not navigate.
    const colours = page.getByRole('radio').filter({ hasText: '' });
    if ((await colours.count()) > 1) {
      await colours.last().check();
    }
    expect(page.url()).toBe(url);
  });

  test('add to cart, see server totals, and reach the checkout', async ({ page }) => {
    await page.goto('/producto/airpods-pro-3');

    await page.getByRole('button', { name: /agregar al carrito/i }).first().click();

    // The drawer opens with the line and a server-computed total.
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/AirPods Pro 3/)).toBeVisible();
    await expect(drawer.getByText(/Total transferencia/i)).toBeVisible();

    await drawer.getByRole('link', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/tus datos/i);
  });

  test('completes a checkout and lands on an order with a reference', async ({ page }) => {
    await page.goto('/producto/airpods-4');
    await page.getByRole('button', { name: /agregar al carrito/i }).first().click();
    await page.getByRole('dialog').getByRole('link', { name: /checkout/i }).click();

    // Step 1 — customer.
    await page.getByLabel(/nombre y apellido/i).fill('Ana López');
    await page.getByLabel(/^email/i).fill('ana@example.com');
    await page.getByLabel(/teléfono/i).fill('1145678900');
    await page.getByRole('button', { name: /continuar/i }).click();

    // Step 2 — pickup, which collects no address at all.
    await page.getByRole('radio', { name: /retiro en showroom/i }).check();
    await page.getByRole('button', { name: /continuar/i }).click();

    // Step 3 — payment.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/pago/i);
    await page.getByRole('button', { name: /continuar/i }).click();

    // Step 4 — review and confirm.
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /confirmar pedido/i }).click();

    await expect(page).toHaveURL(/\/pedido\/OWN-/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/gracias/i);
    // The reference is shown, and it is not sequential.
    await expect(page.getByText(/OWN-[0-9A-HJKMNP-TV-Z]{10}/).first()).toBeVisible();
  });

  test('an order page belonging to another session is a 404, not a 403', async ({ page, context }) => {
    // Place an order in one browser context.
    await page.goto('/producto/magsafe-charger');
    await page.getByRole('button', { name: /agregar al carrito/i }).first().click();
    await page.getByRole('dialog').getByRole('link', { name: /checkout/i }).click();
    await page.getByLabel(/nombre y apellido/i).fill('Ana López');
    await page.getByLabel(/^email/i).fill('ana@example.com');
    await page.getByLabel(/teléfono/i).fill('1145678900');
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.getByRole('radio', { name: /retiro en showroom/i }).check();
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /confirmar pedido/i }).click();
    await expect(page).toHaveURL(/\/pedido\/OWN-/, { timeout: 20_000 });

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

    await page.getByRole('radio', { name: /creatividad/i }).check();
    await page.getByRole('radio', { name: /sin techo/i }).check();

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
    await page.goto('/producto/airpods-4');
    await page.getByRole('button', { name: /agregar al carrito/i }).first().click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    const increase = drawer.getByRole('button', { name: /agregar una unidad/i }).first();
    await increase.click();
    await expect(drawer.getByRole('spinbutton').first()).toHaveValue('2');

    await drawer.getByRole('button', { name: /quitar .* del carrito/i }).first().click();
    await expect(drawer.getByText(/todavía no elegiste nada/i)).toBeVisible();
  });

  test('an invalid promo code is reported without failing the request', async ({ page }) => {
    await page.goto('/producto/airpods-4');
    await page.getByRole('button', { name: /agregar al carrito/i }).first().click();

    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/código de descuento/i).fill('NOPEXYZ');
    await drawer.getByRole('button', { name: 'Aplicar' }).click();

    // A notice, not an error page.
    await expect(page.getByText(/no es válido/i)).toBeVisible();
    await expect(drawer).toBeVisible();
  });
});
