import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@webtoe/core': r('./packages/core/src/index.ts'),
      '@webtoe/ops': r('./packages/ops/src/index.ts'),
      '@webtoe/gpu': r('./packages/gpu/src/index.ts'),
      '@webtoe/io': r('./packages/io/src/index.ts'),
      '@webtoe/editor': r('./packages/editor/src/index.ts'),
    },
  },
});
