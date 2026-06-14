---
phase: v4-handoff-soft-signal
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - src/inngest/functions/agent-production.ts
  - src/lib/whatsapp/webhook-handler.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire no longer writes [ERROR AGENTE] in the inbox"
    - "zombie_lambda_exit observability event is still emitted (mechanism unchanged)"
    - "Zombies at later checkpoints (ckpt_1, ckpt_2, etc.) still write [ERROR AGENTE] (safety net kept)"
    - "V4 non-zombie errors (V4_ENGINE_ERROR, V4_AGENT_ERROR) still write [ERROR AGENTE]"
    - "Non-v4 agents: their error insert paths are NOT modified"
    - "tsc --noEmit exits 0"
    - "npx vitest run src/lib/agents/interruption-system-v2/__tests__/ passes"
  artifacts:
    - path: "src/inngest/functions/agent-production.ts"
      provides: "Zombie ckpt_0 guard in the [ERROR AGENTE] insert (Inngest path)"
      contains: "V4_ZOMBIE_LAMBDA_EXIT"
    - path: "src/lib/whatsapp/webhook-handler.ts"
      provides: "Zombie ckpt_0 guard in the [ERROR AGENTE] insert (inline path)"
      contains: "V4_ZOMBIE_LAMBDA_EXIT"
  key_links:
    - from: "agent-production.ts write-error-message step"
      to: "messages table [ERROR AGENTE] insert"
      via: "guard: !(code==='V4_ZOMBIE_LAMBDA_EXIT' && message includes 'ckpt_0_post_acquire')"
      pattern: "V4_ZOMBIE_LAMBDA_EXIT.*ckpt_0"
    - from: "webhook-handler.ts processAgentInline"
      to: "messages table [ERROR AGENTE] insert"
      via: "same guard"
      pattern: "V4_ZOMBIE_LAMBDA_EXIT.*ckpt_0"
---

<objective>
Stop writing false-positive [ERROR AGENTE] inbox notes for V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire. These zombies are benign — the lock winner always completes the turn — but they pollute the inbox with alarming error messages.

Purpose: Clean operator experience. The zombie detection mechanism, the zombie_lambda_exit observability event, and [ERROR AGENTE] for real errors are all preserved. Only the specific cosmetic false-positive is suppressed.

Output: Two guarded inserts (Inngest path + inline path) that skip the [ERROR AGENTE] write when the error is V4_ZOMBIE_LAMBDA_EXIT at ckpt_0.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-handoff-soft-signal/RESEARCH.md
@.planning/standalone/v4-handoff-soft-signal/CONTEXT.md

<interfaces>
<!-- Two insert paths (Pitfall 4 from RESEARCH.md) -->

PATH 1 — Inngest path in src/inngest/functions/agent-production.ts (lines 582-594):
```typescript
// Write error message to conversation for visibility (same as inline path)
if (!result.success && result.error) {
  await step.run('write-error-message', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      direction: 'outbound',
      type: 'text',
      content: { body: `[ERROR AGENTE] ${result.error?.code}: ${result.error?.message?.substring(0, 500)}` },
      timestamp: new Date().toISOString(),
    })
  })
}
```

PATH 2 — Inline path in src/lib/whatsapp/webhook-handler.ts (lines 546-554):
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

From v4-messaging-adapter.ts (lines 46-50): The LostLockError message is:
  `"zombie lambda — lost lock at ${ckptId}"`
  (e.g. "zombie lambda — lost lock at ckpt_0_post_acquire")

From EngineOutput (types.ts):
  `error?: { code: string; message: string; retryable?: boolean }`

For V4_ZOMBIE_LAMBDA_EXIT at ckpt_0:
  - `error.code === 'V4_ZOMBIE_LAMBDA_EXIT'`
  - `error.message === 'zombie lambda — lost lock at ckpt_0_post_acquire'`
    (this is the string from LostLockError, passed through mapResult verbatim)

Guard condition (D-06):
  `error.code === 'V4_ZOMBIE_LAMBDA_EXIT' && error.message?.includes('ckpt_0_post_acquire')`

If this is TRUE → skip the [ERROR AGENTE] insert (benign zombie).
If FALSE → proceed with the insert (real error or later-checkpoint zombie).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Guard the Inngest path [ERROR AGENTE] insert in agent-production.ts</name>
  <files>src/inngest/functions/agent-production.ts</files>
  <read_first>
    Read agent-production.ts lines 580-596 (the "write-error-message" step.run block).
    Read RESEARCH.md Pitfall 4 (two zombie paths, and the exact error code + message string to check).
    Read CONTEXT.md D-06 (the guard condition: code === V4_ZOMBIE_LAMBDA_EXIT AND message includes ckpt_0_post_acquire).
    Verify that `result.error.message` here is the string from mapResult (v4-production-runner.ts kind==='zombie_exit' path, lines 564-573 — it uses `result.message` which is the LostLockError message verbatim).
  </read_first>
  <action>
Find the block:
```typescript
if (!result.success && result.error) {
  await step.run('write-error-message', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      direction: 'outbound',
      type: 'text',
      content: { body: `[ERROR AGENTE] ${result.error?.code}: ${result.error?.message?.substring(0, 500)}` },
      timestamp: new Date().toISOString(),
    })
  })
}
```

Replace with:
```typescript
if (!result.success && result.error) {
  // v4-handoff-soft-signal (D-06): suppress [ERROR AGENTE] for V4_ZOMBIE_LAMBDA_EXIT at ckpt_0.
  // These zombies are benign — the lock winner always completes the turn.
  // zombie_lambda_exit observability event is still emitted (mechanism unchanged).
  // Later-checkpoint zombies and all other errors still write [ERROR AGENTE].
  const isZombieAtCkpt0 =
    result.error.code === 'V4_ZOMBIE_LAMBDA_EXIT' &&
    result.error.message?.includes('ckpt_0_post_acquire')
  if (!isZombieAtCkpt0) {
    await step.run('write-error-message', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        workspace_id: workspaceId,
        direction: 'outbound',
        type: 'text',
        content: { body: `[ERROR AGENTE] ${result.error?.code}: ${result.error?.message?.substring(0, 500)}` },
        timestamp: new Date().toISOString(),
      })
    })
  }
}
```

The `isZombieAtCkpt0` variable is declared OUTSIDE the `step.run` callback so it is evaluated eagerly (before Inngest serializes the step). This is correct — we want to skip the entire step when it's a benign zombie, not run the step and skip inside it (running the step would still checkpoint it in Inngest's internal state).

Do NOT move or rename any other code in this file.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20 && grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/inngest/functions/agent-production.ts</automated>
  </verify>
  <done>
    - `grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/inngest/functions/agent-production.ts` returns 1 match (inside the isZombieAtCkpt0 guard).
    - `grep -n "ckpt_0_post_acquire" src/inngest/functions/agent-production.ts` returns 1 match.
    - `grep -n "isZombieAtCkpt0" src/inngest/functions/agent-production.ts` returns 2 matches (declaration + condition).
    - tsc exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Guard the inline path [ERROR AGENTE] insert in webhook-handler.ts</name>
  <files>src/lib/whatsapp/webhook-handler.ts</files>
  <read_first>
    Read webhook-handler.ts lines 530-571 (the processAgentInline function — the [ERROR AGENTE] insert is inside the try/catch at lines 546-554).
    Read RESEARCH.md Pitfall 4 (both paths use the same guard condition).
    Read CONTEXT.md D-06 for the guard condition.
    Note: This path uses `agentResult.error` (not `result.error`). The guard checks agentResult.error.code and agentResult.error.message.
    Note: The `supabase` variable in processAgentInline is the one in scope at that function — confirm it's the admin client by checking the function signature/caller. If it's passed in from the webhook handler, verify its type.
  </read_first>
  <action>
Find the inline path block in `processAgentInline` (lines ~546-554):
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

Replace with:
```typescript
if (!agentResult.success && agentResult.error) {
  // v4-handoff-soft-signal (D-06): suppress [ERROR AGENTE] for V4_ZOMBIE_LAMBDA_EXIT at ckpt_0.
  // Same guard as agent-production.ts Inngest path (RESEARCH Pitfall 4).
  const isZombieAtCkpt0 =
    agentResult.error.code === 'V4_ZOMBIE_LAMBDA_EXIT' &&
    agentResult.error.message?.includes('ckpt_0_post_acquire')
  if (!isZombieAtCkpt0) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      direction: 'outbound',
      type: 'text',
      content: { body: `[ERROR AGENTE] ${agentResult.error.code}: ${agentResult.error.message?.substring(0, 500)}` },
      timestamp: new Date().toISOString(),
    })
  }
}
```

Do NOT modify the second [ERROR AGENTE] insert at lines ~561-568 (the catch block for agent processing failure) — that is the exception path for when processMessageWithAgent itself throws, not the V4_ZOMBIE_LAMBDA_EXIT path.

Do NOT modify any other code in this file.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20 && grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/lib/whatsapp/webhook-handler.ts && npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -15</automated>
  </verify>
  <done>
    - `grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/lib/whatsapp/webhook-handler.ts` returns 1 match.
    - `grep -n "ckpt_0_post_acquire" src/lib/whatsapp/webhook-handler.ts` returns 1 match.
    - `grep -c "ERROR AGENTE" src/lib/whatsapp/webhook-handler.ts` returns 2 (one guarded, one unguarded exception-path catch).
    - interruption-system-v2 test suite still passes (mechanism untouched).
    - tsc exits 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| error.code + error.message → guard condition | Both fields come from the internal EngineOutput, not from user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hs-06 | Spoofing | isZombieAtCkpt0 guard | accept | Both error.code and error.message originate from mapResult in v4-production-runner.ts — not from inbound message content. Cannot be spoofed by a WhatsApp user. |
| T-hs-07 | Information Disclosure | Suppressing zombie [ERROR AGENTE] | accept | The zombie_lambda_exit observability event still fires in interruption-system-v2/checkpoints.ts:117. Later-checkpoint zombies and all non-zombie errors still write [ERROR AGENTE]. Suppression is narrowly scoped (code + ckpt_0 string both required). |
</threat_model>

<verification>
Run after both tasks complete:

```bash
# Type-check
cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit

# Both guards present
grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/inngest/functions/agent-production.ts
grep -n "V4_ZOMBIE_LAMBDA_EXIT" src/lib/whatsapp/webhook-handler.ts

# ckpt_0_post_acquire string present in both
grep -n "ckpt_0_post_acquire" src/inngest/functions/agent-production.ts
grep -n "ckpt_0_post_acquire" src/lib/whatsapp/webhook-handler.ts

# Mechanism untouched: zombie_lambda_exit still emitted by checkpoints.ts
grep -c "zombie_lambda_exit" src/lib/agents/interruption-system-v2/checkpoints.ts

# interruption tests pass
npx vitest run src/lib/agents/interruption-system-v2/__tests__/
```
</verification>

<success_criteria>
- Both [ERROR AGENTE] insert paths are guarded with isZombieAtCkpt0 check
- Guard condition: error.code === 'V4_ZOMBIE_LAMBDA_EXIT' && error.message includes 'ckpt_0_post_acquire'
- zombie_lambda_exit observability event in checkpoints.ts:117 is NOT modified
- Later-checkpoint zombies and non-zombie errors still insert [ERROR AGENTE]
- The exception-path catch block in webhook-handler.ts (lines ~561-568) is NOT modified
- tsc exits 0; interruption-system-v2 tests pass
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-handoff-soft-signal/v4-handoff-soft-signal-03-SUMMARY.md` using the summary template.
</output>
