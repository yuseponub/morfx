# Deferred Items — ui-redesign-editorial-core

Out-of-scope discoveries logged during execution. NOT fixed (SCOPE BOUNDARY).

## Pre-existing typecheck errors (Plan 00, found during Task 2/4)

`pnpm exec tsc --noEmit` reports 4 errors in files UNRELATED to this plan's changes.
They predate Plan 00 and are not caused by any file this plan touches
(globals.css / editorial-v3.ts / layout.tsx are all clean):

- `src/lib/domain/__tests__/conversations.test.ts(16,7)` — TS7022 `eqMock` implicit any
- `src/lib/domain/__tests__/conversations.test.ts(16,22)` — TS7024 implicit return any
- `src/lib/instagram/__tests__/webhook-handler.test.ts(87,25)` — TS2307 cannot find `@/lib/inngest/client`
- `src/lib/messenger/__tests__/webhook-handler.test.ts(83,25)` — TS2307 cannot find `@/lib/inngest/client`

These are test-file-only errors (the `inngest/client` path moved; the conversations mock
lacks annotations). They do not affect the build of the reskin and are out of this plan's scope.
