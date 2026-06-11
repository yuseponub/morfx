---
phase: standalone-whatsapp-inbox-reliability
plan: 02
type: execute
wave: 1
depends_on: []
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, revalidate, markAsRead]
requirements: [F-3, D-13]
files_modified:
  - src/app/actions/conversations.ts
autonomous: true

must_haves:
  truths:
    - "Clicking a conversation (markAsRead) no longer triggers a full server re-render of /whatsapp"
    - "archive/unarchive still call revalidatePath('/whatsapp') (they change the visible set)"
  artifacts:
    - path: "src/app/actions/conversations.ts"
      provides: "markAsRead without revalidatePath; documented read-state reconciliation contract"
      contains: "markAsRead"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: "markAsRead"
      via: "fire-and-forget on conversation select — now without route invalidation"
      pattern: "markAsRead"
---

<objective>
Remove `revalidatePath('/whatsapp')` from `markAsRead` (DIAGNOSIS H-4b). `markAsRead` is invoked fire-and-forget on EVERY conversation click; the revalidatePath forces a full server re-render of `WhatsAppPage` — re-executing `getConversations` (1000 rows, ~4.3s measured) and re-streaming the whole RSC payload — for a state change that is ALREADY reconciled by optimistic local update + realtime UPDATE. This is the post-click waterfall that helps make conversations "never load" (case 3).

Purpose: Define and document the structural contract "read-state mutations do NOT invalidate routes; they reconcile via optimistic local state + realtime" (D-13). This is a contract change, not a patch — `archive`/`unarchive` KEEP their revalidatePath because they change the visible set.
Output: `markAsRead` with the revalidatePath removed and a contract comment; archive/unarchive unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@CLAUDE.md
@src/app/actions/conversations.ts

<interfaces>
<!-- The mutations and their revalidate status after this change -->
markAsRead(conversationId)        → UPDATE is_read/unread_count; NO revalidatePath (D-13)
archive(conversationId)           → KEEPS revalidatePath('/whatsapp') (changes visible set)
unarchive(conversationId)         → KEEPS revalidatePath('/whatsapp') (changes visible set)
Optimistic reconciliation already exists: markAsReadLocally in use-conversations.ts (~:520) + realtime UPDATE handler.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove revalidatePath from markAsRead + document the contract</name>
  <files>src/app/actions/conversations.ts</files>
  <read_first>
    - src/app/actions/conversations.ts (read markAsRead ~lines 282-305, archive ~325, unarchive ~351 — confirm exact revalidatePath line locations)
    - PATTERNS.md section "F-3: remove revalidatePath from markAsRead" (lines 204-210)
    - DIAGNOSIS.md H-4b (lines 34-36)
    - RESEARCH.md Q10 "Prod behaviors that MUST NOT change" table (lines 398-410) — confirm markAsRead UPDATE stays, archive/unarchive keep revalidate
  </read_first>
  <action>
In `src/app/actions/conversations.ts`, locate `markAsRead` (~line 303). DELETE the `revalidatePath('/whatsapp')` call inside it. Keep EVERYTHING else in `markAsRead` (the UPDATE that resets `is_read`/`unread_count` server-side MUST stay — RESEARCH Q10).

Replace the deleted line with a contract comment (D-13):
```typescript
// D-13 (whatsapp-inbox-reliability F-3): read-state mutations do NOT invalidate routes.
// markAsRead reconciles via optimistic local update (markAsReadLocally) + realtime UPDATE.
// revalidatePath here forced a full /whatsapp RSC re-render (re-fetch of ~1000 rows) on every click.
// archive/unarchive KEEP revalidatePath — they change the visible set.
```

Do NOT touch `archive` or `unarchive` — they must retain their `revalidatePath('/whatsapp')` (they change the visible conversation set). Verify by reading both functions after the edit. If `revalidatePath` import becomes unused (it won't — archive/unarchive use it), leave the import.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - The `markAsRead` function body contains NO `revalidatePath` call (verify by reading the function start-to-end).
    - `archive` and `unarchive` each STILL contain `revalidatePath('/whatsapp')`.
    - `grep -c "revalidatePath" src/app/actions/conversations.ts` returns >= 2 (archive + unarchive still present).
    - The contract comment referencing D-13 is present at the former revalidatePath location.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>markAsRead no longer revalidates; archive/unarchive still do; the contract is documented; tsc clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| client click → server action | markAsRead is a fire-and-forget mutation from the browser |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-03 | Repudiation/consistency | markAsRead reconciliation | mitigate | UPDATE still persists server-side; optimistic local + realtime reconcile the UI. Removing revalidate does not drop the durable write — only the redundant route re-render |
| T-wir-04 | Tampering | workspace isolation | accept | markAsRead already filters by workspace via existing auth guard (unchanged by this plan) |
</threat_model>

<verification>
- `npx tsc --noEmit` → 0 errors.
- Manual read: markAsRead has no revalidatePath; archive/unarchive keep it.
- Robot `flow` (run as part of the Wave 1 push gate in plan 03): click→bubbles waterfall no longer includes a per-click page-1 RSC re-render.
</verification>

<success_criteria>
- markAsRead reconciles purely via optimistic + realtime (no route invalidation).
- archive/unarchive behavior is byte-identical to before.
- Contract documented in the action.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/02-SUMMARY.md`
</output>
