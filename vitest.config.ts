import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Default env: Node. Integration tests (Plan 02 — orders-cas,
    // order-stage-history-rls) require Supabase admin client + real DB — they
    // CANNOT run under jsdom (fails with `window is not defined` on server libs).
    // Component tests (future) opt-in to jsdom via per-file comment at the top
    // of the test file:
    //   // @vitest-environment jsdom
    // Standalone crm-stage-integrity Plan 05 (BLOCKER 4).
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.claude/**',
      'e2e/**',
    ],
  },
})
