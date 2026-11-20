import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'scraper/test/**/*.test.ts'],
    // Each SQL test file boots PGlite with PostGIS, which takes a few seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
