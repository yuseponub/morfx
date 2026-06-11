---
phase: standalone-whatsapp-inbox-reliability
plan: 03
type: execute
wave: 1
depends_on: [01, 02]
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, error-state, chat-view, useMessages]
requirements: [F-6, D-20]
files_modified:
  - src/hooks/use-messages.ts
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
autonomous: false

must_haves:
  truths:
    - "A failed message fetch renders an explicit error state with a Reintentar button, never a permanent empty chat"
    - "chat-view distinguishes 3 states: loading (skeleton) / error (retry) / real empty"
  artifacts:
    - path: "src/hooks/use-messages.ts"
      provides: "useMessages exposes isError + refetch"
      contains: "isError"
    - path: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      provides: "3-state branch (loading/error/empty)"
      contains: "Reintentar"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      to: "src/hooks/use-messages.ts"
      via: "consumes isError + refetch from useMessages"
      pattern: "isError"
---

<objective>
Give the chat an explicit error state (DIAGNOSIS H-5). Today `useMessages` has `retry: 1`; if `getConversationMessages` fails twice (timeout/cold-start/network), React Query lands in `error` but `chat-view` only knows `isLoading` and `messages.length===0` — so a network failure renders as "chat vacío para siempre" (case 3, the permanent-never-loads layer).

Purpose: Expose `isError` + `refetch` from `useMessages` and make `chat-view` distinguish three states — loading (skeleton) / error (es-CO message + "Reintentar" button) / real empty. A network failure must never again look like an empty chat (D-20).
Output: `useMessages` returning `isError`/`refetch`; `chat-view` with a 3-state branch.

NOTE: This plan depends_on 01+02 only because it carries the SHARED Wave 1 push gate (Task 3) — it must run after 01 and 02 are merged so the push covers all three Wave 1 plans. The code change itself is independent of 01/02.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@.planning/standalone/whatsapp-inbox-reliability/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- useMessages return shape after this change -->
useMessages(conversationId): {
  messages: Message[]
  isLoading: boolean
  isError: boolean        // NEW (D-20)
  refetch: () => void     // NEW (D-20)
  ...existing fields unchanged (sendMessage, softRefetch, etc.)
}
Existing React Query call lives at use-messages.ts ~line 115 with `retry: 1` (KEEP retry: 1 — do not change to 3).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expose isError + refetch from useMessages</name>
  <files>src/hooks/use-messages.ts</files>
  <read_first>
    - src/hooks/use-messages.ts (read the useQuery call ~line 115 and the hook's return object/type UseMessagesReturn)
    - PATTERNS.md section "React Query isError + refetch wiring" (lines 653-662)
    - RESEARCH.md Q10 "Realtime message arrival ... UNTOUCHED by this standalone" (line 404 — do not alter realtime/send paths)
  </read_first>
  <action>
In `src/hooks/use-messages.ts`, locate the `useQuery({ ... })` call (~line 115). Destructure `isError` and `refetch` from its result alongside the existing `data`/`isLoading`:
```typescript
const { data: messages = [], isLoading, isError, refetch } = useQuery({
  queryKey,
  queryFn: () => getConversationMessages(conversationId!, limit),
  enabled: !!conversationId,
  retry: 1,   // KEEP — already caps at 1
})
```
Add `isError` and `refetch` to the hook's return object AND to its return type (`UseMessagesReturn` or inline). Do NOT change `retry`, `staleTime`, `gcTime`, the realtime channel, `sendMessage`, or `softRefetch` — only surface the two new fields.
  </action>
  <verify>
    <automated>grep -n "isError\|refetch" src/hooks/use-messages.ts | head; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "isError" src/hooks/use-messages.ts` returns >= 2 (destructure + return/type).
    - `grep -c "refetch" src/hooks/use-messages.ts` returns >= 2.
    - `grep -c "retry: 1" src/hooks/use-messages.ts` returns >= 1 (unchanged).
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>useMessages returns isError + refetch; retry: 1 and all other behavior unchanged; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: 3-state branch in chat-view (loading / error+Reintentar / real empty)</name>
  <files>src/app/(dashboard)/whatsapp/components/chat-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx (read the current loading/empty conditions ~lines 258-298 and ~351-358, and where useMessages is consumed)
    - PATTERNS.md section "chat-view.tsx — F-6 three-state error" (lines 609-651 — the exact 3-state JSX)
  </read_first>
  <action>
In `chat-view.tsx`, consume the new `isError` + `refetch` from `useMessages`. Replace the current two-state pattern (loading + empty) with three mutually-exclusive states (from PATTERNS.md lines 631-650):

```tsx
{isLoading && messages.length === 0 && <LoadingState v2={v2} v3={v3} />}

{isError && messages.length === 0 && (
  <div className="flex flex-col items-center gap-3 py-20 text-center">
    <p className="mx-caption">No se pudieron cargar los mensajes.</p>
    <button className="mx-btn-ghost text-sm" onClick={refetch}>
      Reintentar
    </button>
  </div>
)}

{messages.length === 0 && !isLoading && !isError && (
  <div className="flex-1 flex items-center justify-center py-20">
    <p className="text-sm text-muted-foreground">No hay mensajes aun</p>
  </div>
)}
```

Use the existing skeleton/loader for the loading branch (keep whatever `chat-view` already renders for `isLoading` — wrap it but do not redesign it). The error copy must be es-CO (Regla 2 spirit for user-facing text; no date formatting involved here). React Query's `retry: 1` already provides the auto-retry-with-backoff (D-20) before the error state shows; `refetch` is the manual retry. Match the existing class conventions in the file (`mx-caption`/`mx-btn-ghost` if present, otherwise the file's existing tailwind classes for empty states).
  </action>
  <verify>
    <automated>grep -n "Reintentar\|isError\|refetch" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx | head; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - chat-view renders an error branch gated on `isError && messages.length === 0` containing a "Reintentar" button wired to `refetch`.
    - The real-empty branch is gated on `!isLoading && !isError` (so an error never shows as empty).
    - `grep -c "Reintentar" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` returns >= 1.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>chat-view shows loading/error/empty as three distinct states; a fetch failure shows error + Reintentar, never empty.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Wave 1 robot gate + commit + push to Vercel (covers plans 01+02+03)</name>
  <what-built>Wave 1 complete: grapheme-safe initials (#418 killed, plan 01), markAsRead no longer revalidates (plan 02), chat 3-state error (plan 03). This task runs the Wave 1 robot gates and the single Wave 1 push (Regla 1).</what-built>
  <how-to-verify>
Run the Wave 1 verification gates against the dev server (port 3020), then commit + push. Somnio is LIVE with real customers — these gates are mandatory pre-push (Regla 6 spirit).

1. Start/confirm dev server on 3020 (`npm run dev`).
2. F-2 gate (D-12): `for i in 1 2 3; do ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts probe418; done` → inspect latest `robot/probe418-*.txt`: 0 hydration pageerrors in all 3 runs.
3. F-3 gate: `ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts flow` → inspect `robot/*-flow.json`: the click→bubbles path no longer shows a per-click page-1 RSC re-render (`getConversations` not re-running twice on open driven by markAsRead).
4. F-6 gate: `ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts case3` → a forced/observed message-fetch failure renders the error+Reintentar state, not "chat vacío". (Vitest already covers the branch logic.)
5. All vitest green: `npx vitest run src/lib/utils/__tests__/initials.test.ts`.
6. `npx tsc --noEmit` → 0 errors (predicts Vercel build green — project memory).
7. Gotcha (D-25): robot inlines functions in `page.evaluate` — keep it that way.

After all gates pass, commit the Wave 1 changes (plans 01+02+03 files) with a Spanish atomic message and push to origin/main (Regla 1):
```bash
git add src/lib/utils/initials.ts src/lib/utils/__tests__/initials.test.ts \
  src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx \
  src/app/\(dashboard\)/whatsapp/components/chat-header.tsx \
  src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx \
  src/app/\(dashboard\)/tareas/components/task-card.tsx \
  src/app/\(dashboard\)/settings/workspace/members/members-content.tsx \
  src/components/layout/sidebar.tsx src/components/layout/user-menu.tsx \
  src/components/workspace/workspace-switcher.tsx \
  src/app/\(dashboard\)/configuracion/whatsapp/equipos/components/team-members-manager.tsx \
  src/app/actions/conversations.ts \
  src/hooks/use-messages.ts \
  src/app/\(dashboard\)/whatsapp/components/chat-view.tsx
git commit -m "fix(whatsapp-inbox-reliability W1): F-2 iniciales grapheme-safe (#418), F-3 markAsRead sin revalidate, F-6 estado error del chat"
git push origin main
```
No DB migration in Wave 1 → no Regla 5 pause needed here.
  </how-to-verify>
  <resume-signal>Type "approved" once all Wave 1 gates pass AND the push to origin/main succeeded, or describe what failed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| network/server → chat UI | message fetch may fail (timeout, cold start) and that failure must be visible, not silently empty |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-05 | Availability (perceived) | chat-view empty-vs-error | mitigate | Explicit error branch + manual Reintentar + React Query retry:1 — a transient failure is recoverable, not a permanent dead chat |
</threat_model>

<verification>
- `npx vitest run src/lib/utils/__tests__/initials.test.ts` green.
- robot `probe418` ×3 → 0 hydration errors; `flow` → no per-click page re-render; `case3` → error state on fetch failure.
- `npx tsc --noEmit` → 0 errors.
- Push to origin/main succeeded (Vercel deploy).
</verification>

<success_criteria>
- All three Wave 1 fixes shipped together and verified by the robot harness.
- A failed message fetch is recoverable (error + Reintentar), never a permanent empty chat.
- Wave 1 pushed as one independent, revert-able unit (D-24).
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/03-SUMMARY.md`
</output>
