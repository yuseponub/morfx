---
phase: quick-040
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/comprehension.ts
  - src/lib/agents/somnio-v3/response-track.ts
  - src/lib/agents/godentist/godentist-agent.ts
  - src/lib/agents/godentist/comprehension.ts
  - src/lib/agents/godentist/sales-track.ts
  - src/lib/agents/godentist/response-track.ts
  - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
  - src/lib/agents/somnio-recompra/comprehension.ts
  - src/lib/agents/somnio-recompra/sales-track.ts
  - src/lib/agents/somnio-recompra/response-track.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/engine/unified-engine.ts
autonomous: true

must_haves:
  truths:
    - "Every pipeline decision point emits a recordEvent visible in the observability timeline"
    - "Zero changes to existing control flow, return values, or variable assignments"
    - "Existing recordEvent calls are NOT duplicated"
  artifacts:
    - path: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      provides: "recordEvent calls for comprehension result, guard decisions, sales track output, response track output, order creation decision, natural silence"
    - path: "src/lib/agents/godentist/godentist-agent.ts"
      provides: "recordEvent calls for comprehension result, guard decisions, sales track output, availability lookup, response track output, natural silence"
    - path: "src/lib/agents/somnio-recompra/somnio-recompra-agent.ts"
      provides: "recordEvent calls for comprehension result, guard decisions, sales track output, response track output, order creation decision, natural silence"
  key_links:
    - from: "all agent files"
      to: "@/lib/observability"
      via: "import { getCollector }"
      pattern: "getCollector\\(\\)\\?\\.recordEvent"
---

<objective>
Add getCollector()?.recordEvent() calls at every internal pipeline decision point across all three agent pipelines (somnio-v3, godentist, recompra) and their shared infrastructure (v3-production-runner, webhook-processor, unified-engine).

Purpose: Phase 42.1 observability captures SQL queries, AI calls, and 7 lifecycle events, but the pipeline's internal decision logic (comprehension results, guard outcomes, track routing, template selection, order decisions) is invisible. These recordEvent calls make every decision observable on the timeline.

Output: ~40-60 new recordEvent calls spread across 14 files. Zero impact on agent behavior.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/observability/index.ts (getCollector export)
</context>

<constraints>
- ONLY add `getCollector()?.recordEvent(...)` standalone statements
- Do NOT modify any existing logic, control flow, variable assignments, or return values
- Each recordEvent must be AFTER the decision it records (not before)
- Use `import { getCollector } from '@/lib/observability'` — add import if file does not have it
- Check existing recordEvent calls to avoid duplicates (somnio-v3/sales-track.ts already has retake + ofi_inter events, somnio-v3/response-track.ts already has retake + ofi_inter template events, unified-engine.ts already has silence_timer event, interruption-handler.ts already has interruption events)
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Instrument somnio-v3 pipeline (agent, comprehension, response-track)</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/comprehension.ts
    src/lib/agents/somnio-v3/response-track.ts
  </files>
  <action>
**somnio-v3/comprehension.ts** — Add import for getCollector. After `parseAnalysis(textBlock.text)` on ~line 88, add:
```typescript
getCollector()?.recordEvent('comprehension', 'result', {
  agent: 'somnio-v3',
  intent: analysis.intent.primary,
  secondary: analysis.intent.secondary,
  confidence: analysis.intent.confidence,
  category: analysis.classification.category,
  sentiment: analysis.classification.sentiment,
  fieldsExtracted: Object.keys(analysis.extracted_fields).filter(k => analysis.extracted_fields[k] !== null),
  tokensUsed,
})
```

**somnio-v3/somnio-v3-agent.ts** — Add import for getCollector. Add recordEvent calls at these decision points:

1. After `processSystemEvent` sales track resolution (~line 65-69), after the salesResult is computed:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'system_event_routed', {
  agent: 'somnio-v3',
  eventType: 'timer_expired',
  level: systemEvent.level,
  action: salesResult.accion ?? 'none',
  reason: salesResult.reason,
  hasTimerSignal: !!salesResult.timerSignal,
})
```

2. After guard check in processUserMessage (~line 185-186), when `guardResult.blocked`:
```typescript
getCollector()?.recordEvent('guard', 'blocked', {
  agent: 'somnio-v3',
  intent: analysis.intent.primary,
  confidence: analysis.intent.confidence,
  reason: guardResult.decision.reason,
})
```

3. After guard check, when NOT blocked (before sales track), add:
```typescript
getCollector()?.recordEvent('guard', 'passed', {
  agent: 'somnio-v3',
  intent: analysis.intent.primary,
  confidence: analysis.intent.confidence,
})
```

4. After sales track result (~line 234), after salesResult is assigned:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
  agent: 'somnio-v3',
  intent: analysis.intent.primary,
  action: salesResult.accion ?? 'none',
  reason: salesResult.reason,
  enterCaptura: salesResult.enterCaptura,
  hasTimerSignal: !!salesResult.timerSignal,
  secondaryAction: salesResult.secondarySalesAction ?? 'none',
  phase,
})
```

5. After `isCreateOrder` decision (~line 246):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'order_decision', {
  agent: 'somnio-v3',
  willCreateOrder: isCreateOrder,
  action: salesResult.accion ?? 'none',
  hasPriorOrder,
})
```

6. After response track result (~line 256), after responseResult is assigned:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
  agent: 'somnio-v3',
  salesTemplateIntents: responseResult.salesTemplateIntents,
  infoTemplateIntents: responseResult.infoTemplateIntents,
  messageCount: responseResult.messages.length,
  templateIdsSent: responseResult.templateIdsSent,
})
```

7. At the natural silence branch (~line 276), inside the `if (responseResult.messages.length === 0)`:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
  agent: 'somnio-v3',
  intent: analysis.intent.primary,
  action: salesResult.accion ?? 'none',
  reason: salesResult.reason,
})
```

**somnio-v3/response-track.ts** — Already has getCollector import. Add after template processing at ~line 94 (empty allIntents early return):
```typescript
getCollector()?.recordEvent('template_selection', 'empty_result', {
  agent: 'somnio-v3',
  salesAction: salesAction ?? 'none',
  intent: intent ?? 'none',
  reason: 'no_matching_intents',
})
```

And after the final block composition (~line 182, after finalBlock is determined):
```typescript
getCollector()?.recordEvent('template_selection', 'block_composed', {
  agent: 'somnio-v3',
  salesTemplateCount: salesTemplateIntents.length,
  infoTemplateCount: infoTemplateIntents.length,
  allIntents,
  finalBlockSize: finalBlock.length,
  hasSaludoCombined,
})
```
  </action>
  <verify>
Run `npx tsc --noEmit` — must compile with zero errors. Grep for recordEvent in all three files to confirm new calls exist. Count total new recordEvent calls should be ~9-10 in these 3 files.
  </verify>
  <done>
somnio-v3 comprehension.ts has 1 recordEvent (comprehension result). somnio-v3-agent.ts has ~7 recordEvents (system event, guard blocked/passed, sales track, order decision, response track, natural silence). response-track.ts has 2 new recordEvents (empty result, block composed). All compile. Zero logic changes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Instrument godentist + recompra pipelines + shared infrastructure</name>
  <files>
    src/lib/agents/godentist/godentist-agent.ts
    src/lib/agents/godentist/comprehension.ts
    src/lib/agents/godentist/sales-track.ts
    src/lib/agents/godentist/response-track.ts
    src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
    src/lib/agents/somnio-recompra/comprehension.ts
    src/lib/agents/somnio-recompra/sales-track.ts
    src/lib/agents/somnio-recompra/response-track.ts
    src/lib/agents/engine/v3-production-runner.ts
    src/lib/agents/production/webhook-processor.ts
    src/lib/agents/engine/unified-engine.ts
  </files>
  <action>
**godentist/comprehension.ts** — Add import for getCollector. After `parseAnalysis(textBlock.text)` on ~line 89, add:
```typescript
getCollector()?.recordEvent('comprehension', 'result', {
  agent: 'godentist',
  intent: analysis.intent.primary,
  secondary: analysis.intent.secondary,
  confidence: analysis.intent.confidence,
  category: analysis.classification.category,
  sentiment: analysis.classification.sentiment,
  idioma: analysis.classification.idioma,
  fieldsExtracted: Object.keys(analysis.extracted_fields).filter(k => analysis.extracted_fields[k as keyof typeof analysis.extracted_fields] !== null),
  tokensUsed,
})
```

**godentist/sales-track.ts** — Add import for getCollector. After each transition match return point:

1. After timer_expired match (~line 49):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'timer_transition', {
  agent: 'godentist',
  level: event.level,
  action: match.action,
  reason: match.output.reason,
})
```

2. After datosCriticosJustCompleted auto-trigger match (~line 82):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'auto_trigger', {
  agent: 'godentist',
  trigger: 'datos_criticos',
  action: match.action,
  reason: match.output.reason,
})
```

3. After intent transition match (~line 97):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'intent_transition', {
  agent: 'godentist',
  intent,
  action: match.action,
  reason: match.output.reason,
  hasTimerSignal: !!match.output.timerSignal,
})
```

**godentist/godentist-agent.ts** — Add import for getCollector. Add same pattern of recordEvent calls as somnio-v3-agent.ts:

1. After processSystemEvent sales track result (~line 66):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'system_event_routed', {
  agent: 'godentist',
  eventType: 'timer_expired',
  level: systemEvent.level,
  action: salesResult.accion ?? 'none',
  reason: salesResult.reason,
})
```

2. After guard blocked check (~line 187):
```typescript
getCollector()?.recordEvent('guard', 'blocked', {
  agent: 'godentist',
  intent: analysis.intent.primary,
  confidence: analysis.intent.confidence,
  reason: guardResult.decision.reason,
})
```

3. After guard passed (before English detection ~line 223):
```typescript
getCollector()?.recordEvent('guard', 'passed', {
  agent: 'godentist',
  intent: analysis.intent.primary,
  confidence: analysis.intent.confidence,
})
```

4. After English detection short-circuit (~line 223):
```typescript
if (analysis.classification.idioma === 'en') {
  getCollector()?.recordEvent('pipeline_decision', 'english_detected', {
    agent: 'godentist',
    intent: analysis.intent.primary,
  })
  // ... existing code
}
```

5. After sales track result (~line 264):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
  agent: 'godentist',
  intent: analysis.intent.primary,
  action: salesResult.accion ?? 'none',
  reason: salesResult.reason,
  phase,
})
```

6. After availability lookup (~line 287-305), after the result is determined:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'availability_lookup', {
  agent: 'godentist',
  fecha: mergedState.datos.fecha_preferida,
  sede: mergedState.datos.sede_preferida,
  hasSlots: !!availabilitySlots,
  fallback: availabilityFallback,
  totalSlots: availabilitySlots
    ? (availabilitySlots.manana?.length ?? 0) + (availabilitySlots.tarde?.length ?? 0)
    : 0,
})
```

7. After response track result (~line 318):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
  agent: 'godentist',
  salesTemplateIntents: responseResult.salesTemplateIntents,
  infoTemplateIntents: responseResult.infoTemplateIntents,
  messageCount: responseResult.messages.length,
})
```

8. At natural silence branch (~line 343):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
  agent: 'godentist',
  intent: analysis.intent.primary,
  action: salesResult.accion ?? 'none',
})
```

9. After isScheduleAppointment decision (~line 281):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'appointment_decision', {
  agent: 'godentist',
  willSchedule: isScheduleAppointment,
  action: salesResult.accion ?? 'none',
})
```

**somnio-recompra/comprehension.ts** — Add import for getCollector. Same pattern as somnio-v3 comprehension, with agent: 'recompra'.

**somnio-recompra/sales-track.ts** — Read the file first. If it has no existing recordEvent calls (likely), add import for getCollector and add same transition-point events as godentist/sales-track.ts but with agent: 'recompra'.

**somnio-recompra/somnio-recompra-agent.ts** — Add import for getCollector. Same pattern as somnio-v3-agent.ts but with agent: 'recompra' and without enCapturaSilenciosa/ofiInter logic.

**godentist/response-track.ts** — Read the file. Add getCollector import if missing. Add recordEvent for empty result and block composed (same pattern as somnio-v3/response-track.ts).

**somnio-recompra/response-track.ts** — Read the file. Add getCollector import if missing. Add recordEvent for empty result and block composed.

**v3-production-runner.ts** — Add import for getCollector if missing. Add recordEvent calls at:

1. After agent module routing (~line 148, after output is assigned):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'agent_routed', {
  agentModule: this.config.agentModule ?? 'somnio-v3',
  sessionId: session.id,
  success: output.success,
  action: output.salesTrackInfo?.accion ?? 'none',
  messageCount: output.messages.length,
  templateCount: output.templates?.length ?? 0,
})
```

2. After Path A / Path B decision (~line 356 for Path A, ~line 374 for Path B):
```typescript
// Path A
getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
  sessionId: session.id,
  pendingMessage: input.message.substring(0, 100),
})
// After Path B normal state save
getCollector()?.recordEvent('pipeline_decision', 'state_committed', {
  sessionId: session.id,
  messagesSent,
  templatesSent: actuallySentIds.length,
  newMode: output.newMode,
  orderCreated: !!orderResult?.success,
})
```

**webhook-processor.ts** — Add import for getCollector if missing. Add recordEvent calls at:

1. After agent routing decision (~line 334 and ~line 352):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
  agentId,
  conversationId,
  contactId,
})
```

2. After recompra routing decision (~line 167-169):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'recompra_routed', {
  conversationId,
  contactId,
  isClient: true,
})
```

3. After skip tag check (~line 91-93):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'skip_tag_detected', {
  conversationId,
})
```
(Only inside the `if (hasSkipTag)` branch)

**unified-engine.ts** — Already has getCollector import. Add recordEvent calls at:

1. After order creation decision (~line 202):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'order_decision', {
  agent: 'somnio-v1',
  shouldCreateOrder: agentOutput.shouldCreateOrder,
  hasOrderData: !!agentOutput.orderData,
  pack: agentOutput.orderData?.packSeleccionado,
})
```

2. After mode transition decision (~line 161-172):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'mode_transition', {
  agent: 'somnio-v1',
  sessionId: session.id,
  from: session.current_mode,
  to: newMode,
  modeChanged,
})
```
(Add AFTER the modeChanged check, outside any if-block, only when modeChanged is true)
  </action>
  <verify>
Run `npx tsc --noEmit` — must compile with zero errors. Grep `getCollector()?.recordEvent` across the entire `src/lib/agents/` directory and count: should be ~40-55 total (19 existing + ~25-35 new). Verify no files have logic changes beyond import additions and standalone recordEvent statements.
  </verify>
  <done>
godentist pipeline has ~10 new recordEvents (comprehension, sales-track transitions, agent decisions, availability lookup, appointment decision). recompra pipeline has ~8 new recordEvents (comprehension, sales-track, agent decisions). v3-production-runner has ~3 new recordEvents (agent routed, interruption path, state committed). webhook-processor has ~3 new recordEvents (agent routing, recompra routing, skip tag). unified-engine has ~2 new recordEvents (order decision, mode transition). All compile. Zero logic changes.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero type errors
2. `grep -r "getCollector()?.recordEvent" src/lib/agents/ | wc -l` shows 40+ total calls
3. `git diff --stat` confirms only additions (no deletions beyond import line adjustments)
4. Visual inspection: every recordEvent is a standalone statement, not inside a condition that changes control flow
</verification>

<success_criteria>
- All 14 files instrumented with recordEvent calls at every pipeline decision point
- TypeScript compiles without errors
- Zero changes to any existing logic, control flow, or return values
- No duplicate recordEvent calls (existing ones preserved, not re-added)
- Consistent category naming: comprehension, guard, pipeline_decision, template_selection
- Every recordEvent includes agent identifier (somnio-v3, godentist, recompra, somnio-v1)
</success_criteria>

<output>
After completion, create `.planning/quick/040-pipeline-decision-recordevents/040-SUMMARY.md`
</output>
