---
phase: v4-handoff-soft-signal
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/production/webhook-processor.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "When v4 signals a soft handoff, the inbox shows a note: ⚠ HANDOFF SUGERIDO — motivo: <reason>"
    - "The inbox note has direction:'outbound' — it is NOT sent to the customer via WhatsApp"
    - "The inbox note insert uses the admin (createAdminClient) supabase client — no silent 0-row inserts"
    - "The note is inserted ONLY on the v4 soft path (result.handoffSuggested === true)"
    - "tsc --noEmit exits 0"
    - "All v4 test suites still pass"
  artifacts:
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Inbox note insert inside the result.handoffSuggested branch"
      contains: "HANDOFF SUGERIDO"
  key_links:
    - from: "webhook-processor.ts soft branch (result.handoffSuggested)"
      to: "messages table"
      via: "supabase.from('messages').insert({direction:'outbound', content:{body:'⚠ HANDOFF SUGERIDO...'}})"
      pattern: "HANDOFF SUGERIDO"
---

<objective>
Insert the handoff suggestion note into the inbox so operators can see WHY v4 suggested a handoff, without the bot being turned off.

Purpose: Operators need visibility into soft handoff signals. A direction:'outbound' internal note (never sent to the customer) surfaces the reason directly in the conversation inbox.

Output: When v4 signals a soft handoff, the inbox shows "⚠ HANDOFF SUGERIDO — motivo: <reason>". Mechanism is identical to the existing [ERROR AGENTE] insert pattern.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-handoff-soft-signal/RESEARCH.md
@.planning/standalone/v4-handoff-soft-signal/CONTEXT.md

<interfaces>
<!-- Existing pattern to clone — the [ERROR AGENTE] insert in webhook-handler.ts lines 546-554 -->

From src/lib/whatsapp/webhook-handler.ts (lines 546-554):
```typescript
if (!agentResult.success && agentResult.error) {
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    direction: 'outbound',
    type: 'text',
    content: { body: `[ERROR AGENTE] ${agentResult.error.code}: ${agentResult.error.message?.substring(0, 500)}` },
    timestamp: new Date().toISOString(),
  })
}
```

From Plan 01 (already in webhook-processor.ts after Plan 01):
```typescript
// Soft path skeleton added by Plan 01:
if (result.success && result.newMode === 'handoff' && result.handoffSuggested) {
  logger.info(
    { conversationId, handoffSignal: result.handoffSignal },
    'v4 soft handoff signal — executeHandoff suppressed (inbox note pending Plan 02)'
  )
}
```

The `supabase` variable at line 140 of webhook-processor.ts = `createAdminClient()` (admin client).
This is in scope at the executeHandoff block (line 1080+) — it's the same admin client used throughout processMessageWithAgent.

From CONTEXT.md D-05:
- Note text: `⚠ HANDOFF SUGERIDO — motivo: ${reason}`
- direction: 'outbound' (internal, not sent via WhatsApp)
- reason comes from result.handoffSignal.reason
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace soft branch skeleton with inbox note insert</name>
  <files>src/lib/agents/production/webhook-processor.ts</files>
  <read_first>
    Read webhook-processor.ts lines around the soft branch added by Plan 01 (search for "v4 soft handoff signal" or "handoffSuggested" in the file).
    Read webhook-handler.ts lines 546-554 for the exact clone pattern (above in interfaces).
    Read RESEARCH.md §Q2 "Inbox note insert mechanism" for the exact insert shape.
    Read RESEARCH.md Assumption A1 — confirmed: the supabase variable at line 140 is createAdminClient() (admin, bypasses RLS). No silent 0-row risk.
    Read CONTEXT.md D-05 for the exact note text.
  </read_first>
  <action>
Find the soft path skeleton added by Plan 01 in webhook-processor.ts. It looks like:

```typescript
if (result.success && result.newMode === 'handoff' && result.handoffSuggested) {
  logger.info(
    { conversationId, handoffSignal: result.handoffSignal },
    'v4 soft handoff signal — executeHandoff suppressed (inbox note pending Plan 02)'
  )
}
```

Replace the body of this block with the inbox note insert:

```typescript
if (result.success && result.newMode === 'handoff' && result.handoffSuggested) {
  // v4-handoff-soft-signal (D-05): insert inbox note with handoff reason.
  // direction:'outbound' → appears in the inbox as a bot-side note. NOT sent to WhatsApp.
  // Clone of [ERROR AGENTE] insert pattern (webhook-handler.ts:546-554).
  // supabase = createAdminClient() (line 140) — bypasses RLS, no silent 0-row risk.
  try {
    const handoffReason = result.handoffSignal?.reason ?? 'unknown'
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      direction: 'outbound',
      type: 'text',
      content: { body: `⚠ HANDOFF SUGERIDO — motivo: ${handoffReason}` },
      timestamp: new Date().toISOString(),
    })
    logger.info(
      { conversationId, handoffSignal: result.handoffSignal },
      'v4 soft handoff — inbox note inserted'
    )
  } catch (noteError) {
    // Non-blocking: inbox note failure must not affect turn completion.
    logger.warn({ error: noteError, conversationId }, 'Failed to insert handoff suggestion note')
  }
}
```

Key properties:
- `direction: 'outbound'` — inbox note, NOT sent to the customer via WhatsApp
- `type: 'text'` — matches existing [ERROR AGENTE] pattern
- `content: { body: \`⚠ HANDOFF SUGERIDO — motivo: ${handoffReason}\` }` — exact D-05 text
- Wrapped in try/catch — note failure must not abort turn completion
- Uses the `supabase` variable already in scope (admin client, line 140)
- No new imports needed (supabase already in scope, logger already in scope)

Do NOT add any import for createAdminClient. The existing `supabase` variable already is the admin client.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20 && grep -n "HANDOFF SUGERIDO" src/lib/agents/production/webhook-processor.ts</automated>
  </verify>
  <done>
    - `grep -n "HANDOFF SUGERIDO" src/lib/agents/production/webhook-processor.ts` returns 1 match inside the `result.handoffSuggested` branch.
    - `grep -n "direction.*outbound" src/lib/agents/production/webhook-processor.ts` confirms the insert has direction:'outbound'.
    - `grep -n "executeHandoff" src/lib/agents/production/webhook-processor.ts` still returns exactly 1 match (inside the !handoffSuggested hard path — Plan 01 guard intact).
    - tsc exits 0.
    - Full test suite: `npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/` passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| result.handoffSignal.reason → DB insert | The reason string comes from agent decisionInfo — internal, not user-supplied |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hs-04 | Tampering | Inbox note content (reason string) | accept | reason comes from internal agent decisionInfo (guardResult.decision.reason, outcome.reason) — not from inbound message content. No XSS risk (inbox renders plain text). |
| T-hs-05 | Denial of Service | Inbox note insert failure | mitigate | Wrapped in try/catch; failure logged as warn, turn completion unaffected. |
</threat_model>

<verification>
Run after task completes:

```bash
# Type-check
cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit

# Inbox note present in soft branch
grep -n "HANDOFF SUGERIDO" src/lib/agents/production/webhook-processor.ts

# Hard path still has executeHandoff (Regla 6)
grep -n "executeHandoff" src/lib/agents/production/webhook-processor.ts

# direction:outbound present (not sent to customer)
grep -n "direction.*outbound" src/lib/agents/production/webhook-processor.ts

# Full v4 test suite
npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/
```
</verification>

<success_criteria>
- Inbox note `⚠ HANDOFF SUGERIDO — motivo: <reason>` is inserted when result.handoffSuggested is true
- Note uses direction:'outbound', type:'text', no WhatsApp send occurs
- Hard path (executeHandoff) still fires for existing agents (!result.handoffSuggested)
- Try/catch wraps the insert — note failure does not abort turn
- tsc exits 0; all v4 test suites pass
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-handoff-soft-signal/v4-handoff-soft-signal-02-SUMMARY.md` using the summary template.
</output>
