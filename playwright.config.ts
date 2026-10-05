import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Reduced motion is opted into per-test with `page.emulateMedia()` rather
    // than globally, so the animated code paths are still exercised.
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // `STORE_DRIVER` is overridable so the same suite can be run against the
    // Redis driver (see the note in README on verifying a deploy), rather than
    // only ever exercising the in-process one.
    env: {
      SESSION_SECRET: 'ZTJlLW9ubHktc2VjcmV0LW5vdC1mb3ItcHJvZHVjdGlvbi11c2UtMDE=',
      NEXT_PUBLIC_SITE_URL: baseURL,
      ...(process.env.UPSTASH_REDIS_REST_URL
        ? {
            UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
            UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
          }
        : {}),
      PAYMENT_PROVIDER: 'mock',
      STORE_DRIVER: process.env.PLAYWRIGHT_STORE_DRIVER ?? 'memory',
      LOG_LEVEL: 'error',
    },
  },
});
