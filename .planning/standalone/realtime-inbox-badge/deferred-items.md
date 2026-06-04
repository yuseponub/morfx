# Deferred Items — realtime-inbox-badge

Pre-existing, out-of-scope issues discovered during Plan 01 execution (`npx tsc --noEmit`).
NONE are caused by the `client.ts` singleton change (a signature-preserving swap cannot affect these files).
Logged per the scope-boundary rule; NOT fixed in this plan.

## Pre-existing typecheck errors (24 total, unrelated to this plan)

- `.next/dev/types/validator.ts(962,*)` — generated Next.js route validator (`m`, `bots`, `reader`, `route` names) — build artifact, regenerates.
- `src/lib/domain/__tests__/conversations.test.ts(16,*)` — `eqMock` implicit-any (TS7022/TS7024).
- `src/lib/domain/__tests__/messages-provider.test.ts(138..186)` — `DomainContext.source` missing in test fixtures (TS2345).
- `src/lib/meta/__tests__/media.test.ts` — unused `@ts-expect-error` (TS2578) + cannot find `@/lib/meta/media` (TS2307).
- `src/lib/meta/__tests__/send.test.ts(24)` — unused `@ts-expect-error` (TS2578).
- `src/lib/meta/__tests__/templates.test.ts` — cannot find `@/lib/meta/templates` (TS2307, multiple).

All in `__tests__/` or generated `.next/` output. None in `src/lib/supabase/client.ts` or its 12 consumers.

## React #418 real node — DEFERRED to an inbox-v2 follow-up (discovered Plan 06 live verification)

The local harness (Plan 06) proved the realtime fix PASS but also showed React #418 (hydration
text mismatch) STILL fires on a fresh `/whatsapp` **list** load — so Plan 07's `message-bubble.tsx`
fix, while a valid Regla-2 latent-TZ cleanup, is NOT the #418 source (message bubbles only render in
the open-chat view).

**Real node pinned via the React component stack:** the mismatch is inside `<ConversationItem>` in the
`role="list"` (`src/app/(dashboard)/whatsapp/components/conversation-item.tsx`), whose markup branches
~15 ways on `v2 = useInboxV2()`. `RelativeTime` itself is hydration-safe; the diverging text node is
elsewhere in the v2 subtree. `v2` is sourced server-side in `page.tsx` (`isInboxV2Enabled()` from DB)
and threaded through `InboxV2Provider` (inbox-layout.tsx:153), so server and client agree on the flag
— the divergence is a text node within the `v2=true` branch.

**Why deferred (not fixed here):**
- It is **pre-existing** (it fired on the OLD Vercel deploy in harness run 1, before any of this
  standalone's work) and **cosmetic** (a console warning; React regenerates the subtree client-side —
  no user-facing breakage).
- It lives in the **inbox-v2 feature** (separate, rollout-sensitive subsystem — Somnio `ui_inbox_v2=true`).
  A correct fix needs to identify the exact diverging text node in the v2 branch and is NOT the
  one-line TZ fix the RESEARCH hypothesized. Jamming it into the realtime standalone risks that feature.
- It is **independent of realtime** (RESEARCH verdict, confirmed: the harness got 7/7 events WITH #418
  present — #418 does not gate or kill the socket).

**Follow-up:** open a small standalone `inbox-v2-hydration-418` — reproduce with the component stack
(use the Plan 06 session-injection pattern), pin the exact text node in the `v2` branch of
`conversation-item.tsx`, fix with deterministic `America/Bogota` formatting / client-only render, no
blanket subtree suppression. Keep Plan 07's `message-bubble` fix (valid regardless).
