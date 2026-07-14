import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules/**',
      'dist/**',
      '.astro/**',
      'test-cases/**', // Playwright E2E specs — run via `npx playwright test`, not Vitest
    ],
  },
});