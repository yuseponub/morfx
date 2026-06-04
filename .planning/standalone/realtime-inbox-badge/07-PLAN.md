---
phase: standalone-realtime-inbox-badge
plan: 07
type: execute
wave: 2
depends_on: []
files_modified:
  - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
autonomous: true
requirements:
  - RQ-3
user_setup: []

must_haves:
  truths:
    - "React error #418 (Text content does not match server-rendered HTML) no longer fires on a /whatsapp load"
    - "Any time/date text that SSRs is formatted deterministically in America/Bogota (server and client produce the identical string) — CLAUDE.md Regla 2"
    - "The fix targets the EXACT node pinned via the React error component stack — no blanket suppressHydrationWarning over a subtree"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      provides: "Hydration-safe timestamp rendering (deterministic Bogota TZ or client-only)"
      contains: "America/Bogota"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      to: "deterministic server/client timestamp string"
      via: "timeZone: 'America/Bogota' (or client-only render gate)"
      pattern: "America/Bogota"
---

<objective>
Fix React error #418 (hydration text mismatch) on `/whatsapp`. It is INDEPENDENT of the realtime bug (verdict from RESEARCH.md, HIGH confidence) — a WebSocket delivery issue and an SSR-vs-hydrate text divergence are unrelated. The user put #418 in scope for this standalone with its own dedicated plan.

Most likely source (to CONFIRM by reproduction, not assume): a timezone-sensitive `date-fns format()` node. The strongest candidate is `src/app/(dashboard)/whatsapp/components/message-bubble.tsx:168` — `format(new Date(message.timestamp), 'HH:mm', { locale: es })`. `date-fns format` uses the RUNTIME local timezone: the server renders in UTC, the client in America/Bogota (UTC-5) → the `HH:mm` differs by an hour → text mismatch. Caveat (Open Question 2): messages are client-fetched via `useMessages`, so a bubble may not actually SSR — the plan MUST reproduce #418, read the React error component stack to PIN the exact node, then fix the real culprit.

Fix with deterministic `America/Bogota` formatting (CLAUDE.md Regla 2) OR the client-only `RelativeTime` pattern (render empty until mounted + `suppressHydrationWarning` on a single leaf). NEVER blanket-suppress a subtree. Confirm in a `pnpm build && pnpm start` run (minified #418 surfaces with a component stack).

Purpose: clean, correct hydration on the inbox page.
Output: the pinned node fixed; #418 gone from a fresh `/whatsapp` load.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/RESEARCH.md

<interfaces>
<!-- The #418 candidate + the proven hydration-safe pattern to reuse. -->

src/app/(dashboard)/whatsapp/components/message-bubble.tsx:168 (CANDIDATE — TZ-sensitive):
```tsx
const timestamp = format(new Date(message.timestamp), 'HH:mm', { locale: es })
```
`date-fns format` is runtime-TZ-dependent → UTC (server) vs Bogota (client) → potential #418.

src/components/ui/relative-time.tsx (ALREADY hydration-safe — pattern to reuse if the node is "now"-relative):
renders '' until `mounted` (useEffect(() => setMounted(true))) + uses suppressHydrationWarning. NOT the #418 source — do not touch.

CLAUDE.md Regla 2: ALL date logic uses America/Bogota. Any unpinned format/toLocale* is a latent #418. Prefer `toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false })` for a deterministic HH:mm, OR a TZ-aware date-fns formatter (date-fns-tz `formatInTimeZone`) if available — check before importing a new dep (RESEARCH: no new dependencies for the realtime work; verify date-fns-tz is installed before using it, else use the Intl/toLocale form which needs no new dep).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Reproduce #418, pin the exact node via component stack, and fix it deterministically</name>
  <read_first>
- src/app/(dashboard)/whatsapp/components/message-bubble.tsx (the candidate file — line 168 format() call)
- RESEARCH.md "React #418 Diagnosis (RQ-3)" (lines 329-342) — verdict + candidate + 3 fix patterns + the "reproduce then pin" mandate
- RESEARCH.md Open Question 2 (lines 413-417) — does any message text actually SSR? do not pre-commit to a node
- src/components/ui/relative-time.tsx — the hydration-safe pattern (reuse if the node is "now"-relative)
- CLAUDE.md Regla 2 (America/Bogota for all date logic)
  </read_first>
  <action>
1. REPRODUCE #418 locally first (do not assume the node):
   - `pnpm dev` (next dev -p 3020). Load `http://localhost:3020/whatsapp` with a session, open DevTools console. React dev shows the full #418 message ("Text content does not match server-rendered HTML") WITH a component stack. Read the stack to identify the exact component + text node that diverges.
   - If dev's stack is ambiguous, also run `pnpm build && pnpm start` and load `/whatsapp` — the minified #418 still surfaces with a component stack; cross-reference.
   - Confirm whether `message-bubble.tsx:168` is the culprit, OR whether the real node is elsewhere (e.g. a server component rendering a date without a fixed `timeZone`). Per Open Question 2, message bubbles may be client-fetched and not SSR at all — let the stack decide.

2. FIX the pinned node (pick per its nature):
   - If it is a date/time text that MUST render server-side: format deterministically in America/Bogota so server and client produce the IDENTICAL string. For the `message-bubble.tsx:168` HH:mm case, replace the runtime-TZ `format(new Date(message.timestamp), 'HH:mm', { locale: es })` with a TZ-pinned form, e.g.:
     ```tsx
     const timestamp = new Date(message.timestamp).toLocaleTimeString('es-CO', {
       timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false,
     })
     ```
     (Intl/toLocale needs NO new dependency. Only use date-fns-tz `formatInTimeZone` if it is ALREADY installed — verify with `grep date-fns-tz package.json` before importing; do NOT add a dependency.)
   - If the value is inherently "now"-relative: reuse the `RelativeTime` client-only pattern (render empty until mounted + `suppressHydrationWarning` on the single leaf).
   - If it is a single leaf that is legitimately client-variant: `suppressHydrationWarning` on THAT leaf node ONLY — never on a wrapping subtree.

3. If the pinned node is NOT in `message-bubble.tsx`, update this plan's `files_modified` reality in the SUMMARY (note the actual file edited) — but the fix still goes in whichever component owns the diverging node. Keep the change minimal and TZ-deterministic per Regla 2.

4. CONFIRM the fix: `pnpm build && pnpm start`, load `/whatsapp`, verify NO #418 in the console (and no `suppressHydrationWarning` blanket over a subtree was introduced).
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | grep -c "message-bubble.tsx" | grep -qx 0 && echo TS-CLEAN</automated>
  </verify>
  <acceptance_criteria>
- The pinned node renders a deterministic Bogota-TZ string OR is client-only-gated. For the message-bubble HH:mm case: `grep -c "America/Bogota" src/app/(dashboard)/whatsapp/components/message-bubble.tsx` >= 1 AND `grep -c "format(new Date(message.timestamp), 'HH:mm'" src/app/(dashboard)/whatsapp/components/message-bubble.tsx` = 0 (the runtime-TZ format call is gone).
- NO new dependency added: `git diff package.json pnpm-lock.yaml` is empty (date-fns-tz only used if already present).
- NO blanket suppression: the diff does NOT add `suppressHydrationWarning` to a wrapping/container element — at most a single leaf text node (reviewer-checkable in the diff; if used at all).
- `npx tsc --noEmit` reports ZERO errors for the edited component.
- CONFIRMATION recorded: a `pnpm build` completes and a `/whatsapp` load shows NO React #418 (capture in the SUMMARY — console clean of "#418" / "Text content does not match").
- pnpm-only (no npm).
  </acceptance_criteria>
  <done>React #418 reproduced, the exact diverging node pinned via component stack, fixed with deterministic America/Bogota formatting (or client-only render) with no new dependency and no blanket suppression, confirmed gone in a pnpm build && start run.</done>
</task>

</tasks>

<verification>
- #418 reproduced and the exact node pinned (not assumed) before fixing.
- The fix is deterministic Bogota-TZ formatting (Regla 2) or a single-leaf client-only render — never a subtree suppression.
- `pnpm build && pnpm start` + a `/whatsapp` load show no #418.
- No new dependency; `npx tsc --noEmit` clean for the edited file.
</verification>

<success_criteria>
- `/whatsapp` hydrates cleanly — React #418 gone (RQ-3 satisfied).
- Date/time text that SSRs is America/Bogota-deterministic (server === client string).
</success_criteria>

<output>
After completion, create `.planning/standalone/realtime-inbox-badge/07-SUMMARY.md` recording: the exact node the component stack pinned (and whether it matched the message-bubble:168 hypothesis), the fix applied (TZ-deterministic vs client-only), the actual file(s) edited, and the `pnpm build && pnpm start` confirmation that #418 is gone.
</output>
