import { expect, test } from '@playwright/test';

/**
 * Visual QA, automated.
 *
 * The brief's §54 asks for a manual pass at six viewports. A manual pass is done
 * once and then rots, so the mechanical half of it is encoded here: horizontal
 * overflow, clipped text, broken images, layout shift, sticky-element collisions
 * and tap-target size — checked at every required width, on every key route.
 *
 * Screenshots are written to `tests/e2e/__screenshots__/` for the human half.
 */

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844 },
  { name: '375', width: 375, height: 812 },
  /* A short phone. Every mobile size here was a tall one, which is why a hero
     that did not fit on a 667px-high screen went unnoticed: the defect is in
     the viewport's HEIGHT, and nothing in this list varied it. */
  { name: '375x667', width: 375, height: 667 },
] as const;

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/tienda', name: 'catalogue' },
  { path: '/producto/iphone-17-pro', name: 'product' },
  { path: '/descubri', name: 'discovery' },
  { path: '/legal/garantia', name: 'legal' },
] as const;

test.describe('no horizontal overflow at any supported width', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.name} @ ${viewport.name}px`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        // The document must not scroll sideways. 1 px of tolerance for subpixel
        // rounding in the layout engine.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route.name} overflows by ${overflow}px at ${viewport.width}px`).toBeLessThanOrEqual(1);

        /**
         * And no individual element may *visibly* spill past the viewport.
         *
         * "Visibly" is the whole subtlety. `getBoundingClientRect()` reflects an
         * element's transform regardless of whether an ancestor clips it — so a
         * device render deliberately scaled inside an `overflow: hidden` stage
         * reports a box wider than the screen while being perfectly contained.
         * Flagging those is noise that teaches people to delete the test.
         *
         * So an element is an offender only when nothing between it and the root
         * clips the x axis. That is the condition that actually corresponds to
         * something hanging off the edge of the page.
         */
        const offenders = await page.evaluate((width) => {
          /**
           * Walks up to — but not including — `<body>`.
           *
           * `body` carries `overflow-x: clip` as a safety net, so including it
           * would mark every element on the page as clipped and this check would
           * silently assert nothing. The document-level assertion above is what
           * covers the body-clip case; this one is about an element escaping its
           * own container.
           */
          const clippedByAncestor = (element: Element): boolean => {
            let node = element.parentElement;
            while (node && node !== document.body) {
              const style = window.getComputedStyle(node);
              if (/hidden|clip|auto|scroll/.test(style.overflowX)) return true;
              node = node.parentElement;
            }
            return false;
          };

          const out: string[] = [];
          for (const element of document.querySelectorAll('body *')) {
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (style.position === 'fixed') continue;

            const rect = element.getBoundingClientRect();
            if (rect.width === 0) continue;
            if (rect.right <= width + 2 && rect.left >= -2) continue;
            if (clippedByAncestor(element)) continue;

            out.push(
              `${element.tagName.toLowerCase()}.${(element.className || '').toString().split(' ')[0]} ` +
                `[${Math.round(rect.left)}→${Math.round(rect.right)}]`,
            );
            if (out.length >= 5) break;
          }
          return out;
        }, viewport.width);

        expect(offenders, `elements visibly overflow at ${viewport.width}px`).toEqual([]);
      });
    }
  }
});

test.describe('typography and images hold up', () => {
  for (const viewport of VIEWPORTS) {
    test(`no clipped text or broken images @ ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of ROUTES) {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        // Any <img> that failed to load.
        const broken = await page.evaluate(
          () =>
            [...document.querySelectorAll('img')].filter(
              (img) => img.complete && img.naturalWidth === 0,
            ).length,
        );
        expect(broken, `${route.path} has broken images`).toBe(0);

        // Headings must not be clipped by their container.
        const clipped = await page.evaluate(() => {
          const out: string[] = [];
          for (const heading of document.querySelectorAll('h1, h2, h3')) {
            if (heading.closest('.sr-only')) continue;
            const style = window.getComputedStyle(heading);
            if (style.display === 'none') continue;
            // `scrollHeight` exceeding `clientHeight` on a clipped box means text
            // is being cut off rather than wrapping.
            if (
              style.overflow === 'hidden' &&
              heading.scrollHeight > heading.clientHeight + 2
            ) {
              out.push(heading.textContent?.slice(0, 40) ?? '');
            }
          }
          return out;
        });
        expect(clipped, `${route.path} clips a heading`).toEqual([]);
      }
    });
  }
});

test.describe('tap targets', () => {
  for (const viewport of [VIEWPORTS[3], VIEWPORTS[4]]) {
    test(`interactive elements are at least 44px @ ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/producto/iphone-17-pro');
      await page.waitForLoadState('networkidle');

      /**
       * Two thresholds, because WCAG has two.
       *
       * **Controls** — buttons, icon buttons, form controls, nav tabs — must be
       * 44 × 44, which is the figure `docs/design-system.md` commits to and the
       * iOS/Material guidance.
       *
       * **Inline text links** inside a sentence, a breadcrumb or a footer list are
       * explicitly exempted from WCAG 2.5.8 by its "inline" exception, and forcing
       * 44 px on them would wreck a breadcrumb. They are held to 24 px, which is
       * 2.5.8's AA floor, so they are still comfortably tappable.
       *
       * Both numbers are asserted rather than one being quietly dropped — the
       * first run of this test found the wordmark at 31 px and footer links at
       * 16 px, which were real problems under either rule.
       */
      const tooSmall = await page.evaluate(() => {
        const out: string[] = [];
        const selector =
          'a[href], button, input[type="radio"], input[type="checkbox"], input[type="number"], select, [role="tab"]';

        for (const element of document.querySelectorAll(selector)) {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (element.closest('.sr-only')) continue;

          // A visually-hidden input inside a label: the label is the real target.
          const target =
            element instanceof HTMLInputElement && element.classList.contains('sr-only')
              ? (element.closest('label') ?? element)
              : element;

          const rect = target.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Inline text link: an <a> whose computed display is inline-ish and
          // which sits in running text or a text list.
          const isInlineTextLink =
            element.tagName === 'A' &&
            /^inline/.test(style.display) &&
            !element.querySelector('svg, img');

          const minimum = isInlineTextLink ? 24 : 44;

          if (rect.width < minimum || rect.height < minimum) {
            out.push(
              `${element.tagName.toLowerCase()}${isInlineTextLink ? '(inline)' : ''} ` +
                `"${(element.textContent ?? '').trim().slice(0, 24)}" ` +
                `${Math.round(rect.width)}×${Math.round(rect.height)} < ${minimum}`,
            );
          }
          if (out.length >= 10) break;
        }
        return out;
      });

      expect(tooSmall, 'tap targets below the minimum').toEqual([]);
    });
  }
});

test.describe('sticky and fixed elements behave', () => {
  test('the mobile bottom nav never covers the primary action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/producto/iphone-17-pro');
    await page.waitForLoadState('networkidle');

    const bar = page.locator('nav[aria-label*="móvil"]');
    await expect(bar).toBeVisible();

    const barBox = await bar.boundingBox();
    const buyBox = await page.getByRole('button', { name: /^agregar$/i }).first().boundingBox();

    expect(barBox).not.toBeNull();
    expect(buyBox).not.toBeNull();
    // The sticky buy bar sits above the nav, not under it.
    expect(buyBox!.y + buyBox!.height).toBeLessThanOrEqual(barBox!.y + 2);
  });

  test('the header does not cover the h1 on any route', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ['/tienda', '/producto/iphone-17-pro', '/descubri', '/legal/garantia']) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const headerBox = await page.getByRole('banner').boundingBox();
        const headingBox = await page.locator('h1').boundingBox();
        expect(headingBox, `${route} @ ${viewport.width}`).not.toBeNull();
        expect(
          headingBox!.y,
          `h1 sits under the header on ${route} @ ${viewport.width}px`,
        ).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 2);
      }
    }
  });
});

test.describe('layout stability', () => {
  test('cumulative layout shift stays within budget on the home page', async ({ page }) => {
    await page.goto('/');

    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });
          // Scroll through the narrative, which is where shift would show up.
          window.scrollTo(0, document.body.scrollHeight / 2);
          setTimeout(() => {
            observer.disconnect();
            resolve(total);
          }, 2500);
        }),
    );

    // Google's "good" threshold is 0.1.
    expect(cls).toBeLessThan(0.1);
  });
});

test.describe('screenshots for the human pass', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`capture ${route.name} @ ${viewport.name}px`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // Deterministic: motion resolved, so a capture is comparable run to run.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        await page.screenshot({
          path: `tests/e2e/__screenshots__/${route.name}-${viewport.name}.png`,
          fullPage: false,
        });
      });
    }
  }
});

/**
 * Nothing interactive may sit under a fixed overlay.
 *
 * The defect class this exists for: the home hero was sized to the full
 * viewport while the mobile tab bar — `position: fixed`, `md:hidden` — was laid
 * over its bottom 57px. The secondary call to action was 86% covered, and a tap
 * on the sliver that remained hit a tab link instead, so the control was not
 * merely hard to see, it did the wrong thing. On a 375x667 screen the PRIMARY
 * call to action fell off the bottom entirely.
 *
 * No existing check could have caught it. Overflow tests look horizontally,
 * tap-target tests measure a box without asking what is painted over it, and
 * every mobile viewport in the list above was a tall one. This asks the only
 * question that matters for a control: if a user taps where it is drawn, does
 * the tap reach it?
 */
test.describe('no control is covered by a fixed overlay', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const blocked = await page.evaluate(() => {
          const out: string[] = [];
          const controls = document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [role="button"]',
          );

          for (const control of controls) {
            const rect = control.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8) continue;
            // Off-screen entirely is a different question (scrolling reaches it).
            if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
            if (rect.right <= 0 || rect.left >= innerWidth) continue;
            // `sr-only` inputs and anything visually hidden are not drawn.
            const style = getComputedStyle(control);
            if (style.visibility === 'hidden' || style.opacity === '0') continue;
            if (rect.width <= 1 || rect.height <= 1) continue;

            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            // Only probe a centre that is actually inside the viewport. Clamping
            // it to the edge instead reports every control sitting below the
            // fold as "covered by the tab bar", which is false: scrolling
            // reaches it. The question is whether a control DRAWN here can be
            // tapped here.
            if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (!hit) continue;
            if (control.contains(hit) || hit.contains(control)) continue;

            const label = (control.textContent || control.getAttribute('aria-label') || '')
              .trim()
              .slice(0, 40);
            const over = (hit.textContent || '').trim().slice(0, 30);
            out.push(`"${label}" is covered at its centre by "${over}"`);
          }
          return out;
        });

        expect(blocked, blocked.join('\n')).toEqual([]);
      });
    }
  }
});

/**
 * The assembly always finishes, and always on the object.
 *
 * The entrance starts every part at `opacity: 0`, which makes one failure mode
 * far worse than a missing flourish: a part whose animation never runs, or is
 * cut off, stays invisible, and the shopper is looking at a product with a hole
 * in it. The risk became real when the sequence started waiting for the element
 * to be scrolled into view — anything that breaks the observer breaks the
 * drawing rather than just the motion.
 *
 * Scroll the whole page so every object gets its moment, then assert that no
 * part is left transparent and no animation is still pending. A shape whose own
 * `opacity` attribute is translucent is drawn that way on purpose, so the check
 * compares against the attribute rather than against 1.
 */
test.describe('every product drawing settles fully assembled', () => {
  // Only the routes that actually draw a product at rest. The discovery quiz
  // renders one after an answer and the legal pages render none, so asserting
  // that drawings exist there would fail for the wrong reason.
  const WITH_PRODUCTS = ROUTES.filter((route) =>
    ['home', 'catalogue', 'product'].includes(route.name),
  );

  for (const viewport of [VIEWPORTS[0]!, VIEWPORTS[3]!]) {
    for (const route of WITH_PRODUCTS) {
      test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        await page.evaluate(async () => {
          const step = window.innerHeight * 0.8;
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1600);

        const broken = await page.evaluate(() => {
          const parts = [...document.querySelectorAll('svg[role="img"] g > *')].filter(
            (part) => part.getClientRects().length > 0,
          );
          const out: string[] = [];
          for (const part of parts) {
            const computed = Number(getComputedStyle(part).opacity);
            const declared = part.getAttribute('opacity');
            const expected = declared === null ? 1 : Number(declared);
            if (Math.abs(computed - expected) > 0.02) {
              out.push(`${part.tagName} rests at ${computed}, drawn as ${expected}`);
            }
            if (part.getAnimations().some((a) => a.playState === 'running' || a.playState === 'paused')) {
              out.push(`${part.tagName} still has a pending animation`);
            }
          }
          return { examined: parts.length, out };
        });

        expect(broken.examined).toBeGreaterThan(0);
        expect(broken.out, broken.out.join('\n')).toEqual([]);
      });
    }
  }
});
