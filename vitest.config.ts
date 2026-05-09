import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each test file gets its own DATA_DIR via the setup helper, so files can
    // run in parallel without clobbering one another.
    poolOptions: { threads: { singleThread: false } },
    setupFiles: ['./tests/_setup.ts'],
    // Suppress the unused next/headers and next/cache modules in unit tests
    // by aliasing them to small mocks imported in _setup.ts.
    server: { deps: { inline: ['next'] } },
  },
});
