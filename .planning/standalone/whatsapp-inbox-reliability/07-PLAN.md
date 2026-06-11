---
phase: standalone-whatsapp-inbox-reliability
plan: 07
type: execute
wave: 4
depends_on: [06]
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, selection, derived-state, regression]
requirements: [F-7, D-21, D-23]
files_modified:
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/(dashboard)/whatsapp/components/__tests__/selection-derivation.test.tsx
autonomous: false

must_haves:
  truths:
    - "selectedConversation is DERIVED from selectedConversationId (lookup in loaded list + fetch-by-id if absent), not a parallel useState"
    - "The chat header and chat content never diverge (no header showing one person while content shows another)"
    - "handleConversationCreated no longer leaves the selected conversation object as null"
    - "Full robot re-run (case1/case3/case4/case4b/flow/sidebar/probe418) shows no regression vs baselines"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      provides: "derived selectedConversation + fetch-by-id effect with correct deps"
      contains: "selectedConversationId"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: "loaded conversations list"
      via: "getConversationById(selectedConversationId) ?? fetchedConversation"
      pattern: "selectedConversationId"
---

<objective>
Wave 4. F-7 (DIAGNOSIS case 2 class): make `selectedConversation` a DERIVED value, not parallel state. Today `selectedConversation` is a separate `useState` object that can diverge from `selectedConversationId` — the class behind "chat de otra conversación bajo el nombre de otra persona" and the `handleConversationCreated` null-object bug. Derive it from `selectedConversationId` (lookup in the loaded list + fetch-by-id as a reactive effect with CORRECT deps — `[selectedConversationId, conversations]`, not `[]`). Then re-run the full robot suite as the regression gate (D-23).

Purpose: Eliminate the header/content divergence family by construction, and prove no wave regressed the others.
Output: derived selection in inbox-layout + a unit test; full robot regression pass; final standalone close-out.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/RESEARCH.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md
@CLAUDE.md

<interfaces>
<!-- Derived selection shape (PATTERNS lines 670-690) -->
// REMOVE: const [selectedConversation, setSelectedConversation] = useState(null)
// selectedConversationId is the single source of truth:
// const [selectedConversationId, setSelectedConversationId] = useState<string|null>(initialSelectedId ?? null)
// const [fetchedConversation, setFetchedConversation] = useState<ConversationWithDetails|null>(null)
// const selectedConversation = getConversationById(selectedConversationId ?? '') ?? fetchedConversation
// fetch-by-id effect deps: [selectedConversationId, conversations]  — NOT []
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Derive selectedConversation from selectedConversationId + unit test</name>
  <files>src/app/(dashboard)/whatsapp/components/inbox-layout.tsx, src/app/(dashboard)/whatsapp/components/__tests__/selection-derivation.test.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (read the current selectedConversation useState, setSelectedConversation call sites, handleConversationCreated, and where markAsRead is fired on select ~line 103)
    - PATTERNS.md section "F-7: selectedConversation derived selection" (lines 666-690 — the exact derivation + effect)
    - RESEARCH.md Q10 must-not-change table (handleConversationCreated row line 408; keyboard nav line 407)
    - CONTEXT.md D-21
  </read_first>
  <behavior>
    - When selectedConversationId is in the loaded list → selectedConversation === that list object (header + content from the same source).
    - When selectedConversationId is NOT in the loaded list → the fetch-by-id effect fetches it and selectedConversation becomes the fetched object.
    - When selectedConversationId is null → selectedConversation is null and fetchedConversation is cleared.
    - When the same id later ARRIVES in a page load → selectedConversation re-derives to the list object (effect deps include `conversations`).
    - After handleConversationCreated(newId) → selectedConversation is never null for a real id (derivation + fetch-by-id covers it).
  </behavior>
  <action>
In `inbox-layout.tsx`, REMOVE the parallel `const [selectedConversation, setSelectedConversation] = useState(...)`. Replace with the derived pattern (PATTERNS lines 670-690):

```tsx
const [selectedConversationId, setSelectedConversationId] =
  useState<string | null>(initialSelectedId ?? null)
const [fetchedConversation, setFetchedConversation] =
  useState<ConversationWithDetails | null>(null)
const selectedConversation =
  getConversationById(selectedConversationId ?? '') ?? fetchedConversation

useEffect(() => {
  if (!selectedConversationId) { setFetchedConversation(null); return }
  if (getConversationById(selectedConversationId)) { setFetchedConversation(null); return }
  let cancelled = false
  getConversation(selectedConversationId).then(conv => {
    if (!cancelled) setFetchedConversation(conv)
  })
  return () => { cancelled = true }
}, [selectedConversationId, conversations])   // deps include conversations — NOT []
```

- `getConversationById` looks up the hook's loaded `conversations` (add a small helper or inline `conversations.find(c => c.id === id)`).
- Replace every former `setSelectedConversation(obj)` call with `setSelectedConversationId(obj.id)` (selection now flows through the id only).
- `handleConversationCreated`: after creating, `setSelectedConversationId(newConv.id)` (the new conv lands on page 1 so it'll be in the loaded list, or the fetch-by-id effect covers it) — fixes the null-object bug (D-21).
- Keep markAsRead-on-select, keyboard nav (`[`/`]`/`/`), and channel/badge rendering identical (RESEARCH Q10 must-not-change). The `cancelled` guard above avoids stale-set on rapid switching.

Write `selection-derivation.test.tsx`: assert the derivation — id-in-list returns list object, id-absent triggers fetch-by-id (mock `getConversation`), id-null clears, arrival-in-page re-derives. Use the repo's existing test conventions under `whatsapp/components/__tests__`.
  </action>
  <verify>
    <automated>npx vitest run src/app/\(dashboard\)/whatsapp/components/__tests__/selection-derivation.test.tsx; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "setSelectedConversation\b" src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx` returns 0 (parallel state removed; only `setSelectedConversationId` remains).
    - `selectedConversation` is a derived `const`, not a `useState` (verify by reading — no `useState` for the object).
    - The fetch-by-id effect deps array includes `conversations` (not `[]`).
    - `npx vitest run .../selection-derivation.test.tsx` → green.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>selectedConversation is derived from the id; no parallel object state; fetch-by-id covers unloaded ids; handleConversationCreated never leaves a null object; test green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Full robot regression vs baselines + all vitest + tsc; commit + push (Wave 4 close-out)</name>
  <what-built>Derived selection (F-7) plus the full-suite regression that closes the standalone. This proves the four user symptoms are eliminated and no wave regressed another.</what-built>
  <how-to-verify>
Run the COMPLETE robot suite against dev:3020 and compare each phase to its baseline JSON in `.planning/standalone/whatsapp-inbox-reliability/robot/` (D-23). Somnio is LIVE — mandatory pre-push.

1. Full robot re-run:
   ```bash
   for ph in probe418 case1 case3 case4 case4b flow sidebar; do
     ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts $ph
   done
   ```
   Compare new `robot/*-<phase>.json` vs the existing baselines. Pass criteria (cumulative across waves):
   - `probe418`: 0 hydration pageerrors (W1).
   - `case1`: first page loads, names correct vs ground truth, no #418-driven full re-render.
   - `case3`: dead-click window collapsed (no "NUNCA pegó"); a forced message-fetch failure shows error+Reintentar, not empty.
   - `case4`: 0 full-refetches >2s after N no-op updates (W3 F-4).
   - `case4b`: 0 under-viewport content shift; activity banner increments (W3 F-5).
   - `flow`: click→bubbles no longer carries a per-click page re-render; getOrdersForContacts scoped (~50 not 1000).
   - `sidebar`: `/whatsapp` HTML KB <300KB and DOM nodes near other modules (W2 F-1); /tareas SPA no longer contaminated by zombie inbox fetches (D-17).
   - Selection: header and content never diverge (F-7).
2. All vitest suites green: `npx vitest run src/lib/utils/__tests__/initials.test.ts src/app/actions/__tests__/conversations-page.test.ts src/app/\(dashboard\)/whatsapp/components/__tests__/selection-derivation.test.tsx` (plus any others touched).
3. `npx tsc --noEmit` → 0 errors (predicts Vercel build green).
Gotcha (D-25): keep robot `page.evaluate` inlined.

After all gates pass, commit + push (Regla 1), then update docs per CLAUDE.md Regla 4:
```bash
git add src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx \
  src/app/\(dashboard\)/whatsapp/components/__tests__/selection-derivation.test.tsx
git commit -m "feat(whatsapp-inbox-reliability W4): F-7 seleccion derivada (una sola fuente de verdad) + regresion robot completa vs baselines"
git push origin main
```
Then (Regla 4 docs): update `docs/analysis/04-estado-actual-plataforma.md` (inbox module status: pagination/virtualization/#418 resolved), and create the standalone `LEARNINGS.md` (CLAUDE.md Regla 0 step 7) capturing: the keyset NULL-drop trap (P1), the surrogate→#418 mechanism, the mounted-ref vs AbortController-for-server-actions gotcha, and the freeze-banner pattern. No DB migration in Wave 4 → no Regla 5 pause.
  </how-to-verify>
  <resume-signal>Type "approved" once the full robot suite passes all per-phase criteria vs baselines, all vitest green, tsc clean, push succeeded, and docs/LEARNINGS updated. Otherwise describe the regression.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| selectedConversationId (may come from URL param) → fetch-by-id | an id not in loaded pages triggers a server fetch |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-14 | Tampering (cross-workspace id) | fetch-by-id (getConversation) | mitigate | getConversation already runs under RLS via createClient() + workspace auth; an id outside the workspace returns nothing — no cross-workspace leak |
| T-wir-15 | Consistency (header/content divergence) | derived selection | mitigate | Single source of truth (id → derived object) eliminates the parallel-state divergence class by construction |
</threat_model>

<verification>
- `npx vitest run` selection-derivation + all touched suites → green.
- Full robot suite vs baselines: probe418/case1/case3/case4/case4b/flow/sidebar all meet their cumulative criteria.
- `npx tsc --noEmit` → 0 errors.
- Push succeeded; docs + LEARNINGS updated (Regla 4 / Regla 0).
</verification>

<success_criteria>
- Header/content divergence class eliminated by derived selection (F-7).
- The 4 reported symptoms (don't load / never opens / scroll jumps / autorefresh) are all eliminated and verified against the robot baselines.
- Standalone closed: pushed, docs synced, LEARNINGS written.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/07-SUMMARY.md`
</output>
