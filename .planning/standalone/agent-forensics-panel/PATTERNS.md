# Agent Forensics Panel — Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 26 new/modified files
**Analogs found:** 24 / 26 (2 files are pure authoring/bundling — no code analog, only markdown template)

## File Classification

### Migration (Plan 01)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/{ts}_agent_observability_responding_agent_id.sql` | migration | DDL + backfill | `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` + `supabase/migrations/20260408000000_observability_schema.sql` | role-match (DDL idempotency) + exact (same table) |

### Observability writeback (Plan 01)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/observability/collector.ts` (MOD) | model | in-memory state | same file (existing `agentId` + `mergeFrom` pattern) | exact (self-reference) |
| `src/lib/observability/flush.ts` (MOD) | service | CRUD write | same file (existing INSERT at lines 110-133) | exact (self-reference) |
| `src/lib/observability/repository.ts` (MOD) | service | CRUD read | same file (existing `listTurnsForConversation` + `getTurnDetail`) | exact (self-reference) |
| `src/inngest/functions/agent-production.ts` (MOD) | controller (inngest) | event-driven | same file (existing `__obs` step-boundary merge, lines 313-366) | exact (self-reference) |
| `src/lib/agents/production/webhook-processor.ts` (MOD) | service | request-response | same file (existing `getCollector()?.recordEvent` at lines 192, 453, 476) | exact (self-reference) |

### Agent specs (Plan 03)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/agent-specs/README.md` | docs | static content | `.claude/rules/agent-scope.md` lines 1-15 (header + principles) | role-match |
| `src/lib/agent-specs/somnio-sales-v3.md` | docs | static content | `.claude/rules/agent-scope.md` §Scopes por Agente + RESEARCH.md §6.1 template | role-match (source material for consolidation) |
| `src/lib/agent-specs/somnio-recompra-v1.md` | docs | static content | same as above + `.claude/rules/agent-scope.md` §Somnio Recompra Agent (lines 115-135) | role-match |
| `src/lib/agent-specs/godentist.md` | docs | static content | same as above (godentist section TBD in agent-scope.md) | role-match |

### Forensics lib (Plans 02-04)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/agent-forensics/condense-timeline.ts` | utility | transform | `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx` lines 75-94 (existing merge-by-sequence) | partial (filter vs merge) |
| `src/lib/agent-forensics/load-agent-spec.ts` | utility | file-I/O | (no fs.readFile analog in src — novel pattern) | NO ANALOG |
| `src/lib/agent-forensics/load-session-snapshot.ts` | service | CRUD read | `src/lib/observability/repository.ts` `listTurnsForConversation` (same `createRawAdminClient` pattern) | exact |
| `src/lib/agent-forensics/auditor-prompt.ts` | utility | transform | `src/lib/builder/system-prompt.ts` (prompt string builder) + RESEARCH.md §Code Examples | role-match |

### API route + server actions (Plan 02-04)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/api/agent-forensics/audit/route.ts` | controller (api) | streaming | `src/app/api/builder/chat/route.ts` + `src/app/api/config-builder/templates/chat/route.ts` | exact (canonical pattern) |
| `src/app/actions/observability.ts` (MOD) | controller (action) | request-response | same file (existing `getTurnDetailAction` + `getTurnsByConversationAction`) | exact (self-reference) |

### UI components (Plan 02-04)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx` (MOD) | component | presentation | same file (existing left/right split) | exact (self-reference) |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx` | component | presentation | grep `@/components/ui/tabs` imports (shadcn Tabs) | role-match |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx` | component | presentation | same-dir `turn-detail.tsx` lines 117-170 (header + scrollable body) | exact (sibling) |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx` | component | presentation | same-dir `turn-detail.tsx` + `event-row.tsx` (row rendering) | exact (sibling) |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx` | component | presentation | `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` lines 14-27 (@uiw/react-json-view) | exact (same library) |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx` | component | streaming | `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` + `configuracion/.../chat-pane.tsx` | exact (canonical) |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx` (MOD) | component | presentation | same file line 156 (existing `{turn.agentId}` render) | exact (self-reference) |

### Config

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `next.config.ts` (MOD) | config | build | same file existing `serverExternalPackages` + `experimental` keys | role-match (same shape, different key) |

### Tests (all plans)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/observability/__tests__/collector.responding.test.ts` | test | unit | `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` (vi describe/it shape) | role-match |
| `src/lib/observability/__tests__/flush.responding.test.ts` | test | unit | same as above | role-match |
| `src/lib/agent-forensics/__tests__/condense-timeline.test.ts` | test | unit | same as above | role-match |
| `src/lib/agent-forensics/__tests__/load-agent-spec.test.ts` | test | unit | same as above | role-match |
| `src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts` | test | integration | `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` (supabase mock pattern) | role-match |
| `src/lib/agent-forensics/__tests__/auditor-prompt.test.ts` | test | unit | `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` (prompt assembly) | role-match |
| `src/app/api/agent-forensics/audit/__tests__/route.test.ts` | test | integration | `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` (route-like mock shape) | role-match |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/turn-list.test.tsx` | test | unit (RTL) | (no RTL test in repo yet — novel file) | NO ANALOG |

---

## Pattern Assignments

### `supabase/migrations/{ts}_agent_observability_responding_agent_id.sql` (migration, DDL + backfill)

**Analog A:** `supabase/migrations/20260408000000_observability_schema.sql` (same table — canonical schema reference)

**Partitioned-table DDL pattern** (lines 41-72):
```sql
CREATE TABLE agent_observability_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ...
  agent_id TEXT NOT NULL,                       -- 'somnio-v3' | 'godentist' | 'somnio-recompra'
  ...
  PRIMARY KEY (started_at, id)                  -- composite: la columna de particion debe estar en el PK
) PARTITION BY RANGE (started_at);

CREATE INDEX idx_turns_conversation
  ON agent_observability_turns (conversation_id, started_at DESC);
CREATE INDEX idx_turns_workspace_agent
  ON agent_observability_turns (workspace_id, agent_id, started_at DESC);
```

**Delta for new migration:** Add `responding_agent_id TEXT NULL` column on the PARENT (cascades to all partitions in PG 12+). Add partial index `idx_turns_responding_agent ON (responding_agent_id, started_at DESC) WHERE responding_agent_id IS NOT NULL`. Keep existing indexes untouched.

**Analog B:** `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` (idempotency pattern for recent migrations)

**Header convention + Regla 5 reminder** (lines 1-25):
```sql
-- ============================================================================
-- Recompra Template Catalog Gaps — cerrar runtime gaps
-- ============================================================================
-- Phase: somnio-recompra-template-catalog (standalone)
-- Origen: audit D-11 revelo 3 gaps reales en prod bajo agent_id='somnio-recompra-v1'.
-- ...
-- Idempotencia: DO $$ BEGIN IF NOT EXISTS ... END $$ por intent
-- ...
-- Regla 5: este SQL se aplica en Supabase prod durante Plan 05 Task 1,
-- ANTES del push de codigo de Plans 02/03/04.

BEGIN;
```

**Backfill pattern (cascading UPDATE with NULL-guard):**
```sql
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-recompra-v1'
WHERE EXISTS (
  SELECT 1 FROM agent_observability_events e
  WHERE e.turn_id = t.id
    AND e.category = 'pipeline_decision'
    AND e.label = 'recompra_routed'
);

-- subsequent UPDATEs include `AND responding_agent_id IS NULL` guard
-- so criterion A wins over B, B wins over C, and final fallback catches the rest.
```

**Delta:** The recompra migration uses `DO $$ BEGIN IF NOT EXISTS ... END $$` for INSERT idempotency. For our ALTER+UPDATE case, the simpler `ALTER TABLE ... ADD COLUMN` is naturally idempotent once applied (second run errors gracefully). Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS responding_agent_id TEXT` for safety. BEGIN/COMMIT wraps the whole migration per the analog convention.

---

### `src/lib/observability/collector.ts` (model, in-memory state) — MODIFY

**Analog (self-reference):** same file, existing `agentId` + `mergeFrom` pattern.

**Identity-field pattern** (lines 71-102):
```typescript
export class ObservabilityCollector {
  // Identity / context (set in constructor, immutable thereafter except newMode)
  readonly conversationId: string
  readonly workspaceId: string
  readonly agentId: ObservabilityCollectorInit['agentId']
  readonly turnStartedAt: Date
  readonly triggerMessageId?: string
  readonly triggerKind: ObservabilityCollectorInit['triggerKind']
  readonly currentMode?: string
  newMode?: string
  // ...
  constructor(init: ObservabilityCollectorInit) {
    this.conversationId = init.conversationId
    // ...
    this.agentId = init.agentId
    // ...
    this.newMode = init.newMode
  }
```

**Defensive never-throw pattern** (lines 108-126):
```typescript
recordEvent(
  category: EventCategory,
  label: string | undefined,
  payload: Record<string, unknown>,
  durationMs?: number,
): void {
  try {
    this.events.push({ /* ... */ })
  } catch {
    // Defensive: never throw from a record call (REGLA 6).
  }
}
```

**Delta for new field:**
- Add mutable field `respondingAgentId: AgentId | null = null` (matches `newMode` mutable precedent).
- Add setter `setRespondingAgentId(id: AgentId): void` with REGLA 6 try/catch swallow; idempotent on same value, silently ignores second-different-value (per Pitfall 1 in RESEARCH.md and design doc at RESEARCH.md Pattern 2, lines 306-337).
- `mergeFrom` (lines 209-283) — extend to also merge `respondingAgentId` from the step-output payload when present.

---

### `src/lib/observability/flush.ts` (service, CRUD write) — MODIFY

**Analog (self-reference):** same file, existing INSERT shape.

**INSERT shape pattern** (lines 110-133):
```typescript
const { error: turnError } = await supabase
  .from('agent_observability_turns')
  .insert({
    id: turnId,
    conversation_id: collector.conversationId,
    workspace_id: collector.workspaceId,
    agent_id: collector.agentId,
    turn_number: null,
    started_at: collector.turnStartedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    event_count: collector.events.length,
    query_count: collector.queries.length,
    ai_call_count: collector.aiCalls.length,
    total_tokens: collector.totalTokens,
    total_cost_usd: collector.totalCostUsd,
    error: collector.error,
    trigger_message_id: collector.triggerMessageId ?? null,
    trigger_kind: collector.triggerKind,
    current_mode: collector.currentMode ?? null,
    new_mode: collector.newMode ?? null,
  })
```

**Delta:** add one line — `responding_agent_id: collector.respondingAgentId ?? null,` between `agent_id` and `turn_number` (maintains logical grouping: both are agent-identity fields).

**Swallow-on-error pattern preserved** (lines 234-253):
```typescript
} catch (err) {
  // Swallow-on-error (REGLA 6): the production turn already
  // succeeded -- we will not let observability persistence break it.
  logger.error({ err, turnId, /* ... */ }, 'observability flush failed — events dropped')
  return
}
```

No change to this block — the new column just flows through the existing INSERT.

---

### `src/lib/observability/repository.ts` (service, CRUD read) — MODIFY

**Analog (self-reference):** same file, existing `TurnSummary` type + `listTurnsForConversation` projection.

**Type definition pattern** (lines 28-45):
```typescript
export interface TurnSummary {
  id: string
  conversationId: string
  workspaceId: string
  agentId: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  eventCount: number
  queryCount: number
  aiCallCount: number
  totalTokens: number
  totalCostUsd: number
  hasError: boolean
  triggerKind: string | null
  currentMode: string | null
  newMode: string | null
}
```

**SELECT + projection pattern** (lines 67-97):
```typescript
const { data, error } = await supabase
  .from('agent_observability_turns')
  .select(
    'id, conversation_id, workspace_id, agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode',
  )
  .eq('conversation_id', conversationId)
  .order('started_at', { ascending: false })
  .limit(opts.limit ?? 200)
// ...
return rows.map((r) => ({
  // ...
  agentId: r.agent_id as string,
  // ...
}))
```

**Delta:**
1. Add `respondingAgentId: string | null` to `TurnSummary` (and to the `TurnDetail.turn` extension).
2. Add `, responding_agent_id` to the select string.
3. Add `respondingAgentId: (r.responding_agent_id as string | null) ?? null,` to the mapping.
4. In `getTurnDetail` (uses `select('*')` at line 225) — projection is automatic, but still add the field to the returned shape at line 304-322.

---

### `src/inngest/functions/agent-production.ts` (controller, event-driven) — MODIFY

**Analog (self-reference):** same file, existing `__obs` step-boundary pattern.

**Collector instantiation pattern** (lines 106-115):
```typescript
const collector = isObservabilityEnabled()
  ? new ObservabilityCollector({
      conversationId,
      workspaceId,
      agentId: await resolveAgentIdForWorkspace(workspaceId),
      turnStartedAt: new Date(),
      triggerMessageId: messageId,
      triggerKind: 'user_message',
    })
  : null
```

**Step-boundary merge pattern (CRITICAL — Pitfall 1)** (lines 313-366):
```typescript
const stepCollector = collector
  ? new ObservabilityCollector({
      conversationId: collector.conversationId,
      workspaceId: collector.workspaceId,
      agentId: collector.agentId,
      turnStartedAt: collector.turnStartedAt,
      triggerMessageId: collector.triggerMessageId,
      triggerKind: collector.triggerKind,
    })
  : null
// ...
const engineResult = stepCollector
  ? await runWithCollector(stepCollector, invokePipeline)
  : await invokePipeline()

return {
  engineResult,
  __obs: stepCollector
    ? {
        events: stepCollector.events,
        queries: stepCollector.queries,
        aiCalls: stepCollector.aiCalls,
      }
    : null,
}
// ...
// After step.run returns:
if (collector && stepResult.__obs) {
  collector.mergeFrom(stepResult.__obs)
}
```

**Delta:** Extend the `__obs` return shape with `respondingAgentId: stepCollector.respondingAgentId`, and in the post-step merge block add `if (collector && stepResult.__obs?.respondingAgentId) collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)`. This is the exact fix flagged in RESEARCH.md Pitfall 1 (lines 509-534).

---

### `src/lib/agents/production/webhook-processor.ts` (service, request-response) — MODIFY

**Analog (self-reference):** same file, existing `getCollector()?.recordEvent` pattern.

**Recompra branch routing event** (lines 192-197):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'recompra_routed', {
  conversationId,
  contactId,
  isClient: true,
})
logger.info({ conversationId, contactId }, 'Contact is a client, routing to recompra agent')
```

**V3 branch routing event** (lines 453-458):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
  agentId,
  conversationId,
  contactId,
})
logger.info({ conversationId, agentId }, 'V3 agent processing complete')
```

**GoDentist branch routing event** (lines 476-481):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
  agentId,
  conversationId,
  contactId,
})
logger.info({ conversationId, agentId }, 'GoDentist agent processing complete')
```

**Delta:** Immediately before each `V3ProductionRunner` / `UnifiedEngine` `.processMessage(...)` invocation, add `getCollector()?.setRespondingAgentId('somnio-recompra-v1' | 'somnio-v3' | 'godentist')`. CRITICAL — set it BEFORE the runner runs so the schema records the routing even on error (RESEARCH.md Anti-Pattern line 470).

Recompra branch insertion point: before line 240 (`runner.processMessage({ ... })`).
V3 branch insertion point: before line 442 (`runner.processMessage({ ... })`).
GoDentist branch insertion point: before line 465 (`runner.processMessage({ ... })`).

---

### `src/lib/agent-specs/{id}.md` + `README.md` (docs, static content) — NEW

**Source material (no code analog):** `.claude/rules/agent-scope.md` contents.

**Header block (Principle pattern from agent-scope.md lines 1-15):**
```markdown
# REGLA DE SCOPE DE AGENTES

## Principio
Cada agente AI (builder, sandbox, etc.) SOLO puede operar dentro de su modulo asignado.
...
```

**Per-bot PUEDE / NO PUEDE pattern (agent-scope.md §CRM Reader Bot lines 30-50 + §Somnio Recompra Agent lines 115-135):**
```markdown
### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — buscar y leer contactos (tags, custom fields, archivados via flag)
  - ...
- **NO PUEDE:**
  - Mutar NADA (crear/editar/archivar/eliminar contactos, pedidos, notas, tareas, tags, pipelines, etapas, templates, usuarios)
  - Enviar mensajes de WhatsApp
  - ...
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` ...
  - Agent ID registrado: `'crm-reader'` en `agentRegistry`; ...
```

**Authoritative template for each spec** is given verbatim in RESEARCH.md §Open Items Resolution §1 (lines 866-960). Copy that markdown skeleton and fill sections from: `agent-scope.md`, `src/lib/agents/{module}/response-track.ts`, `src/lib/agents/{module}/transitions.ts`, `src/lib/agents/{module}/__tests__/`, `.planning/standalone/somnio-recompra-template-catalog/`, `.planning/standalone/somnio-recompra-crm-reader/`.

**Delta vs agent-scope.md:** these new spec files MUST be bundled into Vercel lambda (via `outputFileTracingIncludes`) because the auditor loads them at runtime via `fs.readFile`. `.claude/rules/` is NOT bundled — it's authoring-time-only. Hence the new path in `src/lib/`.

---

### `src/lib/agent-forensics/condense-timeline.ts` (utility, transform) — NEW

**Analog:** `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx` lines 78-94 (existing merge-by-sequence).

**Merge-by-sequence pattern:**
```typescript
const timeline: TimelineItem[] = useMemo(() => {
  if (view.kind !== 'data') return []
  const d = view.detail
  const items: TimelineItem[] = [
    ...d.events.map((e): TimelineItem => ({ kind: 'event', sequence: e.sequence, data: e })),
    ...d.queries.map((q): TimelineItem => ({ kind: 'query', sequence: q.sequence, data: q })),
    ...d.aiCalls.map((a): TimelineItem => ({ kind: 'ai', sequence: a.sequence, data: a })),
  ]
  items.sort((a, b) => a.sequence - b.sequence)
  return items
}, [view])
```

**Event category taxonomy source:** `src/lib/observability/types.ts` lines 47-71 (21 `EventCategory` values — exhaustive list to filter against).

**Delta:** Operate on `TurnDetail` directly (not in a useMemo) — this is a pure server/client function. Drop `queries` entirely (D-05). Filter events by a whitelist set of 16 categories. Filter aiCalls to "mechanism" purposes only. Return `CondensedTimelineItem[]` sorted by sequence. Full reference implementation in RESEARCH.md §Code Examples lines 599-721.

---

### `src/lib/agent-forensics/load-agent-spec.ts` (utility, file-I/O) — NEW

**NO ANALOG in codebase** — `fs.readFile` from bundled markdown is a novel pattern in this repo.

**Recommended shape** (RESEARCH.md §Code Examples lines 726-751):
```typescript
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SPEC_IDS = new Set(['somnio-sales-v3', 'somnio-recompra-v1', 'godentist'])

export async function loadAgentSpec(agentId: string): Promise<string> {
  if (!SPEC_IDS.has(agentId)) {
    throw new Error(`Unknown agent spec: ${agentId}`)
  }
  const filePath = path.join(process.cwd(), 'src/lib/agent-specs', `${agentId}.md`)
  return readFile(filePath, 'utf-8')
}
```

**Constraints:** (1) NO module-scope caching (Vercel lambdas cold-start — cache saves nothing, and spec changes should apply without redeploy). (2) Requires `outputFileTracingIncludes` entry in `next.config.ts` — see Pitfall 3 (RESEARCH.md lines 544-558). (3) Node runtime only (the `/api/agent-forensics/audit/route.ts` must NOT opt into Edge).

---

### `src/lib/agent-forensics/load-session-snapshot.ts` (service, CRUD read) — NEW

**Analog:** `src/lib/observability/repository.ts` `listTurnsForConversation` (lines 63-98) — same `createRawAdminClient()` pattern.

**Raw admin client pattern** (from repository.ts lines 17 + 67):
```typescript
import { createRawAdminClient } from '@/lib/supabase/admin'
// ...
export async function listTurnsForConversation(conversationId: string, opts: ListTurnsOptions = {}): Promise<TurnSummary[]> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_observability_turns')
    .select('id, conversation_id, ...')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (error) throw error
  // ...
}
```

**session_state access pattern (source: `src/lib/agents/session-manager.ts:181`):**
```typescript
const { error: stateError } = await this.supabase
  .from('session_state')
  .insert({ session_id, ...stateFields })
```

**Delta:** Resolve via the SAME conversation → agent_sessions → session_state join, read-only. Filter on `agent_sessions.conversation_id = ?` + `is_active = true` + `order by created_at desc limit 1` to get the freshest session, then select * from `session_state` where `session_id = ?`. MUST use `createRawAdminClient()` (anti-recursion — same rationale as repository.ts file header lines 1-15). Return raw JSON; no projection (D-06).

---

### `src/lib/agent-forensics/auditor-prompt.ts` (utility, transform) — NEW

**Analog A:** `src/lib/builder/system-prompt.ts` (prompt string builder) + `src/app/api/builder/chat/route.ts:127` (`const systemPrompt = buildSystemPrompt(workspaceId)`).

**Analog B (tighter):** RESEARCH.md §Code Examples lines 754-827 (verbatim auditor-prompt.ts reference).

**Prompt assembly pattern (returns `{systemPrompt, userMessage}`):**
```typescript
export function buildAuditorPrompt(args: {
  spec: string
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
}): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `Eres un auditor técnico de agentes conversacionales. ...
# Diagnóstico: {nombre del bot}
## Resumen
...
## Evidencia del timeline
...
## Discrepancias con la spec
...
## Próximos pasos
...`

  const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)
${args.spec}
---
## Turn analizado
- **ID:** ${args.turn.id}
- **Entry agent (routing):** ${args.turn.agentId}
- **Responding agent:** ${(args.turn as any).respondingAgentId ?? args.turn.agentId}
...
## Timeline condensado (orden de secuencia)
\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`
## Snapshot completo del session_state
\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`
...`

  return { systemPrompt, userMessage }
}
```

**Notes:** Output enforces markdown structure via the system prompt (D-09, D-13). Pointers (`file:line`) come from the spec — auditor is prohibited from inventing new ones.

---

### `src/app/api/agent-forensics/audit/route.ts` (controller, streaming) — NEW

**Analog A (canonical):** `src/app/api/builder/chat/route.ts` (entire file, 164 lines).
**Analog B:** `src/app/api/config-builder/templates/chat/route.ts` (139 lines — near-verbatim clone of A with 4 swaps).

**Imports pattern** (builder/chat/route.ts lines 1-18):
```typescript
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/builder/system-prompt'
import { createBuilderTools } from '@/lib/builder/tools'
// ...
import type { UIMessage } from 'ai'
```

**streamText invocation** (lines 129-145):
```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(5),
  onFinish: async () => { /* persist */ },
})
const response = result.toUIMessageStreamResponse()
response.headers.set('X-Session-Id', sessionId!)
return response
```

**Error envelope pattern** (lines 156-162):
```typescript
} catch (error) {
  console.error('[builder/chat] Error:', error)
  return Response.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  )
}
```

**Auth gate pattern for super-user (from `src/app/actions/observability.ts:43`):**
```typescript
import { assertSuperUser } from '@/lib/auth/super-user'
// ...
await assertSuperUser()  // throws Error('FORBIDDEN')
```

**Deltas for audit/route.ts:**
1. Replace `createClient().auth.getUser()` + workspace_members membership check with `assertSuperUser()` (single gate — super-user has access to all workspaces by design).
2. Return `new Response('Forbidden', { status: 403 })` when `assertSuperUser` throws `FORBIDDEN`.
3. Swap model to `anthropic('claude-sonnet-4-6')` (D-08).
4. No `tools`, no `stopWhen`, no session store, no `convertToModelMessages` — body is `{ turnId, startedAt, respondingAgentId, conversationId }` (NOT a messages array).
5. Assemble context via `Promise.all([getTurnDetail(...), loadAgentSpec(...), loadSessionSnapshot(...)])` then `condenseTimeline(detail, respondingAgentId)` then `buildAuditorPrompt(...)`.
6. `temperature: 0.3`, `maxOutputTokens: 4096` (RESEARCH.md §Pattern 4 lines 362-419).
7. Error envelope mirrors analog: `console.error('[agent-forensics/audit] Error:', error)` prefix.

---

### `src/app/actions/observability.ts` (controller, request-response) — MODIFY

**Analog (self-reference):** same file, existing `getTurnDetailAction` + `getTurnsByConversationAction`.

**Server action pattern** (lines 40-51):
```typescript
export async function getTurnsByConversationAction(
  conversationId: string,
): Promise<GetTurnsResult> {
  await assertSuperUser()

  if (!isObservabilityEnabled()) {
    return { status: 'disabled', flagName: OBSERVABILITY_FLAG_NAME }
  }

  const turns = await listTurnsForConversation(conversationId, { limit: 200 })
  return { status: 'ok', turns }
}
```

**Detail action pattern (no flag discriminator)** (lines 68-74):
```typescript
export async function getTurnDetailAction(
  turnId: string,
  startedAt: string,
): Promise<TurnDetail> {
  await assertSuperUser()
  return getTurnDetail(turnId, startedAt)
}
```

**Delta — add two new actions:**
1. `getForensicsViewAction(turnId, startedAt, respondingAgentId)` — calls existing `getTurnDetail` + calls `condenseTimeline(detail, respondingAgentId)` and returns `{ turn, condensed }`. Super-user gated.
2. `getSessionSnapshotAction(conversationId)` — wraps `loadSessionSnapshot(conversationId)`. Super-user gated. Returns `{ snapshot: unknown; sessionId: string | null }`.

Both follow the `getTurnDetailAction` shape (no discriminated union — caller already sees the turn list).

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx` — MODIFY

**Analog (self-reference):** same file, current layout.

**Existing layout pattern** (lines 46-70):
```typescript
<div className="flex-1 flex min-h-0">
  <div className="w-64 border-r flex-shrink-0">
    <TurnList
      conversationId={conversationId}
      selectedTurnId={selectedTurn?.id ?? null}
      onSelectTurn={(id, startedAt) => setSelectedTurn({ id, startedAt })}
    />
  </div>
  <div className="flex-1 min-w-0 min-h-0">
    {selectedTurn ? (
      <TurnDetailView
        key={selectedTurn.id}
        turnId={selectedTurn.id}
        startedAt={selectedTurn.startedAt}
      />
    ) : (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground italic">
          Selecciona un turno de la lista.
        </div>
      </div>
    )}
  </div>
</div>
```

**Delta:** Replace `<TurnDetailView>` with `<Tabs>` containing 3 panes: Forensics (default), Raw, Auditor. `TurnDetailView` becomes the body of the Raw tab (unchanged). See RESEARCH.md §Open Items Resolution §6 for full component tree.

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx` — NEW

**Analog:** shadcn Tabs primitive. No sibling pattern in the debug panel yet; expect project-wide usage via `import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'`.

**Tabs shape (typical shadcn usage):**
```typescript
<Tabs defaultValue="forensics" className="h-full flex flex-col">
  <TabsList className="flex-shrink-0">
    <TabsTrigger value="forensics">Forensics</TabsTrigger>
    <TabsTrigger value="raw">Raw</TabsTrigger>
    <TabsTrigger value="auditor">Auditor</TabsTrigger>
  </TabsList>
  <TabsContent value="forensics" className="flex-1 min-h-0"><ForensicsTab .../></TabsContent>
  <TabsContent value="raw" className="flex-1 min-h-0"><TurnDetailView .../></TabsContent>
  <TabsContent value="auditor" className="flex-1 min-h-0"><AuditorTab .../></TabsContent>
</Tabs>
```

**Verify at plan time:** grep `@/components/ui/tabs` for existing consumer to copy exact import + className patterns.

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx` — NEW

**Analog:** sibling `turn-detail.tsx` lines 117-170 (same header + scrollable body shape).

**Header + scrollable body pattern** (turn-detail.tsx lines 117-155):
```typescript
return (
  <div className="h-full flex flex-col min-h-0">
    {/* Header */}
    <div className="px-3 py-2 border-b flex-shrink-0 space-y-1">
      <div className="text-sm font-medium">
        {turn.agentId}
        {turn.triggerKind && (
          <span className="ml-2 text-xs text-muted-foreground font-mono">
            · {turn.triggerKind}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground font-mono flex flex-wrap gap-x-3">
        <span>{turn.durationMs ?? '—'}ms</span>
        <span>{turn.totalTokens}tok</span>
        ...
      </div>
    </div>

    {/* Timeline */}
    <div className="flex-1 overflow-y-auto divide-y">
      {/* ... */}
    </div>
  </div>
)
```

**Delta:** Composes `<CondensedTimeline>` and `<SessionSnapshot>` stacked, with a sticky header showing `{turn.respondingAgentId ?? turn.agentId}` + `{turn.triggerKind}` + counters, and a "Ver timeline completo" toggle button (handoff to Raw tab — typically via `onTabChange('raw')` prop or URL state).

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx` — NEW

**Analog:** sibling `turn-detail.tsx` lines 154-167 (existing row list) + `event-row.tsx` (row component).

**Timeline mapping pattern** (turn-detail.tsx lines 154-167):
```typescript
<div className="flex-1 overflow-y-auto divide-y">
  {timeline.length === 0 ? (
    <div className="p-4 text-xs text-muted-foreground italic">
      Turno vacio (sin events / queries / ai calls registrados).
    </div>
  ) : (
    timeline.map((item) => (
      <EventRow
        key={`${item.kind}-${item.data.id}`}
        item={item}
        promptVersionsById={promptVersionsById}
      />
    ))
  )}
</div>
```

**Row header visual anchor** (event-row.tsx lines 43-62):
```typescript
<span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">EVT</span>
<span className="ml-2">{item.data.category}</span>
{item.data.label && (
  <span className="ml-1 text-muted-foreground">· {item.data.label}</span>
)}
```

**Delta:** Input is `CondensedTimelineItem[]` (from `condenseTimeline(...)`), NOT a `TurnDetail`. No SQL rows (D-05). Row renderer can reuse `<EventRow>` in 'event' + 'ai' modes only, or be a lighter dedicated component that renders `item.summary` directly (precomputed by `condenseTimeline`'s `summarizeEvent`).

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/session-snapshot.tsx` — NEW

**Analog:** `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` (same @uiw/react-json-view library).

**Editor + theme pattern** (state-tab.tsx lines 14-27):
```typescript
import JsonViewEditor from '@uiw/react-json-view/editor'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
// ...
const { resolvedTheme } = useTheme()
const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme
```

**Also seen in `event-row.tsx` lines 20-23 + 40-41** (READ-ONLY mode via plain `JsonView`):
```typescript
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
// ...
const { resolvedTheme } = useTheme()
const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme
```

**Delta:** Use READ-ONLY `JsonView` (not `JsonViewEditor` — user is auditing, not editing). Data fetched via new `getSessionSnapshotAction(conversationId)`. Same hand-rolled fetch pattern as `turn-list.tsx` or `turn-detail.tsx` (useEffect + mountedRef + error state). Show "no session" fallback if snapshot is null.

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx` — NEW

**Canonical analog:** `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` + `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx`.

**Transport + useChat pattern** (builder-chat.tsx lines 36-63):
```typescript
const [transport] = useState(
  () =>
    new DefaultChatTransport({
      api: '/api/builder/chat',
      body: () => ({ sessionId: sessionIdRef.current }),
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        const newSessionId = response.headers.get('X-Session-Id')
        if (newSessionId && !sessionIdRef.current) {
          onSessionCreated(newSessionId)
        }
        return response
      },
    })
)

const { messages, sendMessage, status, error, setMessages } = useChat({
  transport,
  messages: initialMessages,
})
```

**sendMessage invocation pattern** (builder-chat.tsx lines 80-86):
```typescript
const handleSubmit = useCallback(
  (text: string) => {
    if (!text.trim() || isLoading) return
    sendMessage({ text: text.trim() })
  },
  [sendMessage, isLoading]
)
```

**Error display pattern** (builder-chat.tsx lines 137-143):
```typescript
{error && (
  <div className="px-4 pb-2">
    <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
      Error: {error.message}
    </div>
  </div>
)}
```

**Deltas for auditor-tab.tsx:**
1. Simpler — NO sessionId plumbing, NO X-Session-Id capture, NO initialMessages.
2. Transport api = `'/api/agent-forensics/audit'`; body carries `{ turnId, startedAt, respondingAgentId, conversationId }` (NOT session).
3. Single button "Auditar sesión" → calls `sendMessage({ text: 'Auditar' }, { body: { turnId, startedAt, respondingAgentId, conversationId } })` (message content ignored server-side).
4. Render response with `<ReactMarkdown remarkPlugins={[remarkGfm]}>` inside `<div className="prose prose-sm dark:prose-invert">` — extract text from `messages[assistant].parts[].text`.
5. "Copiar al portapapeles" button with `sonner` toast (already a repo dependency).
6. NO `setMessages([])` reset — audits are one-shot per turn, new turn = remounts component via `key={turnId}`.

Full reference skeleton: RESEARCH.md §Pattern 4 lines 424-463.

---

### `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx` — MODIFY

**Analog (self-reference):** same file, line 156.

**Current render line** (turn-list.tsx line 155-159):
```typescript
<div className="text-sm text-foreground mt-1 truncate">
  {turn.agentId} · {turn.triggerKind ?? 'event'}
  {turn.hasError && (
    <span className="ml-2 text-destructive text-xs font-medium">ERROR</span>
  )}
</div>
```

**Delta:** One-line change:
```typescript
{turn.respondingAgentId ?? turn.agentId} · {turn.triggerKind ?? 'event'}
```

Requires `TurnSummary` type to already have `respondingAgentId: string | null` (done in repository.ts). If both fields are equal (e.g. non-client turns), the UI visual is unchanged. If different (the recompra bug case), the UI now correctly shows `somnio-recompra` instead of `somnio-v3`.

---

### `next.config.ts` — MODIFY

**Analog (self-reference):** same file, existing `serverExternalPackages` + `experimental` + `images` keys.

**Current shape** (lines 6-27):
```typescript
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['pdfkit', 'bwip-js'],
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  images: { remotePatterns: [ /* ... */ ] },
};
```

**Delta:** Add `outputFileTracingIncludes` key (RESEARCH.md Pitfall 3 lines 544-558):
```typescript
outputFileTracingIncludes: {
  '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
},
```

This ensures the `.md` spec files are bundled into the Vercel lambda for `/api/agent-forensics/audit` (without this, `fs.readFile` throws ENOENT in prod).

---

### Tests — shared pattern

**Analog A (unit, vi + describe + it):** `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` lines 10-55.

**Vitest unit test shape:**
```typescript
import { describe, it, expect } from 'vitest'
import { resolveTransition } from '../transitions'
// ...
describe('resolveTransition — D-05 + Q#1 saludo fallback', () => {
  it('returns null for initial + saludo (entry removed ...)', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)
    const result = resolveTransition('initial', 'saludo', state, gates)
    expect(result).toBeNull()
  })
})
```

**Analog B (mock-heavy integration, vi.mock hoisting):** `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` lines 1-75.

**Mock-before-import pattern:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPlatformConfig = vi.fn()
const mockInngestSend = vi.fn()
const mockRecordEvent = vi.fn()

vi.mock('@/lib/domain/platform-config', () => ({
  getPlatformConfig: mockGetPlatformConfig,
}))
vi.mock('@/inngest/client', () => ({
  inngest: { send: mockInngestSend },
}))
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: mockRecordEvent }),
}))

describe('webhook-processor recompra preload dispatch', () => {
  beforeEach(() => { vi.clearAllMocks() })
  // ...
})
```

**Analog C (Inngest-like handler test):** `src/inngest/functions/__tests__/recompra-preload-context.test.ts` lines 1-65 — mocks `createFunction` as identity to test the handler body directly.

**Delta per test file:**
- `collector.responding.test.ts` — unit, test setter idempotency, second-value-ignore, defensive try/catch.
- `flush.responding.test.ts` — mock `createRawAdminClient`; assert the INSERT payload includes `responding_agent_id`.
- `condense-timeline.test.ts` — unit with fixture `TurnDetail`, assert whitelist + queries-excluded behavior.
- `load-agent-spec.test.ts` — unit; stub `node:fs/promises.readFile` via `vi.mock('node:fs/promises', ...)`; assert unknown-id throws.
- `load-session-snapshot.test.ts` — mock `createRawAdminClient` with chained `.from().select().eq()...` (see `recompra-preload-context.test.ts` for the admin client mock shape).
- `auditor-prompt.test.ts` — unit; assert output strings contain spec body, condensed JSON, snapshot JSON, and the markdown section headers.
- `route.test.ts` — mock `assertSuperUser` to throw FORBIDDEN / succeed; mock AI SDK `streamText` to return a `toUIMessageStreamResponse` stub; assert 403 and 200 code paths + model ID + prompt shape.
- `turn-list.test.tsx` — RTL (`@testing-library/react` — need to verify it's available in repo first; if not, use a simpler DOM-free snapshot test); assert that when `respondingAgentId` is set, it renders instead of `agentId`.

---

## Shared Patterns

### Authentication: Super-user gate
**Source:** `src/lib/auth/super-user.ts` lines 76-79
**Apply to:** All new server actions + the `/api/agent-forensics/audit` route.

```typescript
import { assertSuperUser } from '@/lib/auth/super-user'
// ...
await assertSuperUser()  // throws Error('FORBIDDEN') → 403
```

### Anti-recursion read: Raw admin client
**Source:** `src/lib/observability/repository.ts` lines 1-17 + line 67
**Apply to:** `load-session-snapshot.ts`, any new forensics read path. NEVER use `createAdminClient()` — it re-enters the instrumented fetch wrapper.

```typescript
import { createRawAdminClient } from '@/lib/supabase/admin'
// ...
const supabase = createRawAdminClient()
```

### Inngest step-boundary merge (CRITICAL)
**Source:** `src/inngest/functions/agent-production.ts` lines 313-366
**Apply to:** ANY collector field mutated inside `step.run('process-message', …)` MUST be encoded in the step return value and merged by the outer handler. This is the fix prescribed by RESEARCH.md Pitfall 1.

```typescript
return {
  engineResult,
  __obs: stepCollector ? {
    events: stepCollector.events,
    queries: stepCollector.queries,
    aiCalls: stepCollector.aiCalls,
    respondingAgentId: stepCollector.respondingAgentId,  // NEW
  } : null,
}
// After step.run:
if (collector && stepResult.__obs?.respondingAgentId) {
  collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)
}
```

### Regla 6 defensive never-throw
**Source:** `src/lib/observability/collector.ts` lines 123-125 (canonical comment + pattern)
**Apply to:** Any collector mutation, `setRespondingAgentId`, `mergeFrom`, `recordEvent`.

```typescript
try {
  /* mutation */
} catch {
  // Defensive: never throw from a record call (REGLA 6).
}
```

### AI SDK v6 streaming + useChat
**Source:** `src/app/api/builder/chat/route.ts` + `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx`
**Apply to:** `/api/agent-forensics/audit/route.ts` + `auditor-tab.tsx`.

```typescript
// Server (route.ts)
const result = streamText({ model: anthropic('claude-sonnet-4-6'), system, messages, temperature: 0.3, maxOutputTokens: 4096 })
return result.toUIMessageStreamResponse()

// Client (auditor-tab.tsx)
const [transport] = useState(() => new DefaultChatTransport({ api: '/api/agent-forensics/audit', body: () => ({ turnId, startedAt, respondingAgentId, conversationId }) }))
const { messages, sendMessage, status, error } = useChat({ transport })
```

### Super-user-gated server action with discriminated result
**Source:** `src/app/actions/observability.ts` lines 31-51
**Apply to:** `getForensicsViewAction`, `getSessionSnapshotAction`.

```typescript
'use server'
import { assertSuperUser } from '@/lib/auth/super-user'
import { isObservabilityEnabled, OBSERVABILITY_FLAG_NAME } from '@/lib/observability'

export type GetForensicsViewResult =
  | { status: 'disabled'; flagName: string }
  | { status: 'ok'; turn: TurnSummary; condensed: CondensedTimelineItem[] }

export async function getForensicsViewAction(
  turnId: string, startedAt: string, respondingAgentId: string | null,
): Promise<GetForensicsViewResult> {
  await assertSuperUser()
  if (!isObservabilityEnabled()) return { status: 'disabled', flagName: OBSERVABILITY_FLAG_NAME }
  const detail = await getTurnDetail(turnId, startedAt)
  const condensed = condenseTimeline(detail, respondingAgentId)
  return { status: 'ok', turn: detail.turn, condensed }
}
```

### Hand-rolled fetch+poll pattern (no SWR, no react-query)
**Source:** `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx` lines 48-88
**Apply to:** `session-snapshot.tsx` (one-shot, not polled — use the `turn-detail.tsx` simpler variant at lines 50-73 without setInterval).

```typescript
const [view, setView] = useState<ViewState>({ kind: 'loading' })
const mountedRef = useRef(true)

useEffect(() => {
  mountedRef.current = true
  setView({ kind: 'loading' })
  let cancelled = false
  ;(async () => {
    try {
      const data = await someServerAction(...)
      if (cancelled || !mountedRef.current) return
      setView({ kind: 'data', data })
    } catch (err) {
      if (cancelled || !mountedRef.current) return
      setView({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })()
  return () => { cancelled = true; mountedRef.current = false }
}, [deps])
```

### Regla 5 migration-before-deploy header
**Source:** `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` lines 22-25
**Apply to:** the new migration file.

```sql
-- Regla 5: este SQL se aplica en Supabase prod durante Plan 01 Task 1,
-- ANTES del push de codigo de Plans 02/03/04/05.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/lib/agent-forensics/load-agent-spec.ts` | utility | file-I/O | No `fs.readFile` usage in `src/` today — novel pattern. Mitigated: RESEARCH.md §Code Examples lines 726-751 contains a complete reference implementation. Requires companion `next.config.ts` change (also no analog — introduces new config key). |
| `src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/turn-list.test.tsx` | test | unit (RTL) | No React Testing Library `.test.tsx` file exists in the repo (grep confirmed only `.test.ts` files). Plan must either (a) add `@testing-library/react` as a new dev dep and write a proper render test, or (b) defer to a DOM-free unit test of a small pure helper extracted from `turn-list.tsx`. Recommend (b) to avoid dep creep — extract the label-resolver into a pure `getDisplayAgentId(turn): string` function and test that. |

---

## Metadata

**Analog search scope:**
- `src/lib/observability/**`
- `src/lib/agents/production/**`
- `src/lib/agents/somnio-recompra/**`
- `src/app/api/builder/chat/route.ts`
- `src/app/api/config-builder/templates/chat/route.ts`
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/**`
- `src/app/(dashboard)/automatizaciones/builder/components/**`
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/**`
- `src/app/(dashboard)/sandbox/components/debug-panel/**`
- `src/app/actions/observability.ts`
- `src/lib/auth/super-user.ts`
- `src/inngest/functions/agent-production.ts`
- `src/inngest/functions/__tests__/**`
- `src/lib/agents/somnio-recompra/__tests__/**`
- `src/lib/agents/production/__tests__/**`
- `supabase/migrations/2026040800*.sql`
- `supabase/migrations/20260423142420*.sql`
- `next.config.ts`
- `.claude/rules/agent-scope.md`

**Files scanned:** 18 files fully read + 6 grep probes.

**Pattern extraction date:** 2026-04-23
