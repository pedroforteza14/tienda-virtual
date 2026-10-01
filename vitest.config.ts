import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'dGVzdC1vbmx5LXNlY3JldC1uZXZlci11c2VkLWluLXByb2R1Y3Rpb24=',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      PAYMENT_PROVIDER: 'mock',
      LOG_LEVEL: 'error',
    },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/server/**'],
    },
  },
});
