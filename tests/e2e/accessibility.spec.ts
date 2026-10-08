import { expect, test, type Page } from '@playwright/test';
import { addOpenProductToCart, openBuyableProduct } from './fixtures';

/**
 * Accessibility, verified in a browser rather than asserted in a document.
 *
 * These cover the baseline in `docs/design-system.md`: landmarks, one h1, a skip
 * link, visible focus, keyboard reachability, dialog focus management, and that
 * `prefers-reduced-motion` resolves every narrative to a complete static state.
 */

const ROUTES = [
  '/',
  '/tienda',
  '/tienda/iphone',
  '/producto/iphone-17-pro',
  '/descubri',
  '/checkout',
  '/cuenta',
  '/legal/garantia',
];

async function headingLevels(page: Page): Promise<number[]> {
  return page.$$eval('h1, h2, h3, h4, h5, h6', (nodes) =>
    nodes
      .filter((node) => {
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((node) => Number(node.tagName.slice(1))),
  );
}

for (const route of ROUTES) {
  test.describe(`a11y: ${route}`, () => {
    test('has the expected document structure', async ({ page }) => {
      await page.goto(route);

      // Exactly one h1.
      await expect(page.locator('h1')).toHaveCount(1);

      /**
       * Landmarks, asserted by ROLE rather than by tag.
       *
       * A page may legitimately contain several `<header>` elements — one inside
       * an `<article>` or a `<section>` is a sectioning header, not a banner —
       * and asserting on the tag flagged correct markup as broken. What must be
       * unique is the landmark.
       */
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(page.locator('main#main')).toHaveCount(1);
      expect(await page.getByRole('navigation').count()).toBeGreaterThan(0);

      // Language is declared, and it is the right one.
      await expect(page.locator('html')).toHaveAttribute('lang', 'es-AR');

      // Headings never skip a level.
      const levels = await headingLevels(page);
      let previous = levels[0] ?? 1;
      for (const level of levels) {
        expect(level - previous, `heading jump on ${route}: ${levels.join(',')}`).toBeLessThanOrEqual(1);
        previous = Math.max(previous, level);
      }
    });

    test('the skip link is the first thing a keyboard reaches', async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('Tab');

      const focused = await page.evaluate(() => ({
        text: document.activeElement?.textContent ?? '',
        href: document.activeElement?.getAttribute('href') ?? '',
      }));
      expect(focused.href).toBe('#main');
      expect(focused.text).toMatch(/saltar al contenido/i);
    });

    test('every image has an accessible name', async ({ page }) => {
      await page.goto(route);
      const unnamed = await page.$$eval('img, svg[role="img"]', (nodes) =>
        nodes.filter((node) => {
          if (node.getAttribute('aria-hidden') === 'true') return false;
          const label = node.getAttribute('alt') ?? node.getAttribute('aria-label') ?? '';
          return label.trim().length === 0;
        }).length,
      );
      expect(unnamed).toBe(0);
    });

    test('focus is always visible', async ({ page }) => {
      await page.goto(route);

      // Walk the first several focusable elements and confirm each one paints an
      // outline. A focus style that exists in CSS but is overridden somewhere is
      // exactly what this catches.
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        const visible = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return true;
          const style = window.getComputedStyle(element);
          const hasOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
          const hasRing = style.boxShadow !== 'none';
          return hasOutline || hasRing;
        });
        expect(visible, `focus not visible at tab stop ${i + 1} on ${route}`).toBe(true);
      }
    });
  });
}

test.describe('dialogs', () => {
  test('the cart drawer traps focus, closes on Escape, and restores focus', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /^carrito/i }).first();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Focus moved inside.
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return panel?.contains(document.activeElement) ?? false;
    });
    expect(inside).toBe(true);

    // Tab many times: focus must never leave the dialog.
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        return panel?.contains(document.activeElement) ?? false;
      });
      expect(stillInside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // And focus came back to the button that opened it.
    await expect(trigger).toBeFocused();
  });

  test('the search overlay supports arrow keys and Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /buscar productos/i }).click();

    const input = page.getByRole('combobox', { name: /buscar productos/i });
    await input.fill('ipad');
    await expect(page.getByRole('option').first()).toBeVisible();

    // Arrow keys move the active option without moving DOM focus off the input.
    await page.keyboard.press('ArrowDown');
    await expect(input).toBeFocused();
    const active = await input.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('opening a dialog does not shift the page behind it', async ({ page }) => {
    await page.goto('/tienda');
    const before = await page.evaluate(() => document.body.getBoundingClientRect().width);

    await page.getByRole('button', { name: /^carrito/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const after = await page.evaluate(() => document.body.getBoundingClientRect().width);
    // Scroll lock compensates for the scrollbar, so the layout must not jump.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });
});

test.describe('reduced motion', () => {
  test('the home narrative resolves to a complete, readable state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Hero copy is present and visible without any scrolling.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The commercial detail, which is scroll-revealed with motion enabled, is
    // present immediately — nothing is motion-only.
    await expect(page.getByText(/En foco/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /ver el iphone/i }).first()).toBeVisible();
  });

  test('the pinned narrative becomes a readable scroller', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // All four panels' copy is reachable rather than hidden behind a transform.
    await expect(page.getByText(/Titanio, no plástico/i)).toBeVisible({ timeout: 10_000 });
  });

  test('spec rails are drawn, not stuck at zero width', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/producto/iphone-17-pro');

    const drawn = await page.evaluate(() => {
      const rail = document.querySelector('.spec-rail');
      if (!rail) return false;
      const transform = window.getComputedStyle(rail, '::before').transform;
      // `matrix(1, 0, 0, 1, 0, 0)` or `none` both mean fully drawn.
      return transform === 'none' || transform.startsWith('matrix(1,');
    });
    expect(drawn).toBe(true);
  });
});

test.describe('forms', () => {
  test('checkout fields are labelled and errors are announced', async ({ page }) => {
    await openBuyableProduct(page);
    await addOpenProductToCart(page);
    await page.getByRole('dialog').getByRole('link', { name: /checkout/i }).click();
    await page.waitForURL(/\/checkout/);

    // Submitting empty surfaces per-field errors wired to the inputs.
    await page.getByRole('button', { name: /continuar/i }).click();

    const nameField = page.getByLabel(/nombre y apellido/i);
    await expect(nameField).toHaveAttribute('aria-invalid', 'true');

    const describedBy = await nameField.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy!.split(' ')[0]}`)).toBeVisible();

    // The error is a live region, so it is announced without stealing focus.
    await expect(page.locator('[role="status"]').first()).toBeVisible();
  });

  test('zoom is not blocked', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1\b/);
  });
});

/**
 * WCAG 2.2 — 2.4.11 / 2.4.12, Focus Not Obscured.
 *
 * The stylesheet gave `scroll-margin-top` to anchored sections and headings,
 * which is what auditing *links* turns up. But Tab scrolls the focused element
 * into view as well, and a product card carries no id — so tabbing down the
 * catalogue parked each card with its top edge beneath the fixed header and the
 * keyboard user lost sight of their own position. 21 of the elements reached by
 * tabbing landed there.
 *
 * This asserts the AA line — **entirely** hidden — not the AAA one. I wrote it
 * the strict way first and it failed on things no CSS rule can fix: a fixed bar
 * overlaps whatever is passing under it, and `scroll-margin` only applies when
 * the browser actually scrolls an element into view, so an element already in
 * the viewport and partly under the bar is never repositioned. Asserting the
 * unachievable would have meant deleting the test a week later. The scroll
 * margin still does its job — the elements the browser DOES scroll to now land
 * clear of the header — and this guards the line that can be held.
 */
test.describe('focus is never parked under a fixed bar', () => {
  for (const route of ['/tienda', '/', '/producto/iphone-17-pro-max']) {
    test(`tabbing through ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const obscured: string[] = [];
      for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press('Tab');
        const hit = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;

          for (const bar of document.querySelectorAll('header, nav')) {
            const style = getComputedStyle(bar);
            if (style.position !== 'fixed') continue;
            // A bar's own controls overlap it by definition.
            if (bar.contains(el)) continue;

            const rect = el.getBoundingClientRect();
            // A visually-hidden control (an `sr-only` radio is 1x1) is not
            // "obscured"; it is deliberately not drawn, and its label carries
            // the visible target. Geometrically it fits inside any bar.
            if (rect.width < 8 || rect.height < 8) continue;
            const barRect = bar.getBoundingClientRect();
            const fullyHidden =
              rect.top >= barRect.top &&
              rect.bottom <= barRect.bottom &&
              rect.left >= barRect.left &&
              rect.right <= barRect.right;
            if (fullyHidden) {
              return (el.textContent || el.getAttribute('aria-label') || el.tagName)
                .trim()
                .slice(0, 40);
            }
          }
          return null;
        });
        if (hit) obscured.push(hit);
      }

      expect(obscured, obscured.join('\n')).toEqual([]);
    });
  }
});
