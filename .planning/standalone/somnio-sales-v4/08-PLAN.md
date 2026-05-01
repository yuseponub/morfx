---
plan: 08
phase: somnio-sales-v4
wave: 4
depends_on: [07]
files_modified:
  - src/inngest/functions/agent-timers-v4.ts
  - src/inngest/index.ts
addresses_decisions: [D-13, D-19, D-20, D-21, D-22, D-24, D-43]
addresses_research_pitfalls: [Pitfall 5, Pitfall 10]
autonomous: true
estimated_tasks: 3
must_haves:
  truths:
    - "Inngest function id='v4-timer' (no colisión con v3 — Pitfall 10)"
    - "Listen event: 'agent/v4.timer.started' (no 'agent/v3.timer.started')"
    - "Order creation timer-driven usa crm-mutation-tools.createOrder.execute (D-07) — NO createProductionAdapters('somnio-sales-v3')"
    - "idempotencyKey distingue por timer level: 'somnio-v4-createOrder-{sessionId}-timer_L3' vs 'timer_L4' (Pitfall 5)"
    - "Defensive guard checkSessionActive preserved (D-43)"
    - "Timer durations idénticas a v3 (D-21)"
    - "Cero imports desde @/lib/agents/somnio-v3/* (D-24)"
  artifacts:
    - path: "src/inngest/functions/agent-timers-v4.ts"
      provides: "v4Timer Inngest function + v4TimerFunctions array export"
      exports: ["v4Timer", "v4TimerFunctions"]
  key_links:
    - from: "v4Timer event handler"
      to: "processMessage from somnio-v4 (timer path)"
      via: "dynamic import('@/lib/agents/somnio-v4/somnio-v4-agent')"
      pattern: "import.*somnio-v4"
---

<objective>
Wave 3 — clonar `agent-timers-v3.ts` a `agent-timers-v4.ts` con todas las renames y reemplazar la creación de pedidos timer-driven (líneas 410-434 de v3) por `crm-mutation-tools` directo (D-07/D-22).

Pitfall 10 crítico: rename de `id`, `name`, y event name. Sin esto, Inngest colisiona con v3.

Output: 1 archivo nuevo + actualización del Inngest function registry index + 1 commit.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@.claude/skills/crm-mutation-tools.md
@src/inngest/functions/agent-timers-v3.ts
@src/inngest/index.ts
</context>

<interfaces>
<!-- v3 timer function shape (PATTERNS.md sección "agent-timers-v4.ts") -->

```typescript
export const v3Timer = inngest.createFunction(
  { id: 'v3-timer', name: 'V3 Agent Timer', retries: 3, concurrency: [{ key: 'event.data.sessionId', limit: 1 }] },
  { event: 'agent/v3.timer.started' },
  async ({ event, step }) => { ... }
)
```

Substituciones obligatorias para v4 (Pitfall 10):
- `id: 'v3-timer'` → `id: 'v4-timer'`
- `name: 'V3 Agent Timer'` → `name: 'V4 Agent Timer'`
- `event: 'agent/v3.timer.started'` → `event: 'agent/v4.timer.started'`
- `inngest.send({ name: 'agent/v3.timer.started', ... })` → `'agent/v4.timer.started'` (en TODOS los emit sites — incluyendo timer chaining L3 → L4)
- `V3_TIMER_DURATIONS` → `V4_TIMER_DURATIONS`
- export `v3Timer` → `v4Timer`; `v3TimerFunctions` → `v4TimerFunctions`

Order creation block (líneas 410-434 de v3) — REEMPLAZAR:
```typescript
// v3 deferred:
const adapters = createProductionAdapters({ agentId: 'somnio-sales-v3' })
const result = await adapters.orders.createOrder(...)

// v4 INLINE:
const tools = createCrmMutationTools({ workspaceId, invoker: 'somnio-sales-v4' })
const result = await tools.createOrder.execute({
  ...,
  idempotencyKey: `somnio-v4-createOrder-${sessionId}-timer_L${level}`,  // Pitfall 5 — tag distinto por nivel
})
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Clone agent-timers-v3.ts → agent-timers-v4.ts con todas las renames</name>
  <files>src/inngest/functions/agent-timers-v4.ts</files>
  <read_first>
    - src/inngest/functions/agent-timers-v3.ts (492 líneas — analog completo)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "agent-timers-v4.ts" — incluye lista exacta de adaptaciones)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-21, D-22, D-43)
    - .claude/skills/crm-mutation-tools.md (factory + idempotencyKey contract)
  </read_first>
  <action>
1. Copiar `src/inngest/functions/agent-timers-v3.ts` → `src/inngest/functions/agent-timers-v4.ts` byte-by-byte.

2. Aplicar substituciones mecánicas (Pitfall 10):
   - Inngest function: `id: 'v3-timer'` → `id: 'v4-timer'`
   - `name: 'V3 Agent Timer'` → `name: 'V4 Agent Timer'`
   - Event name TODAS las ocurrencias: `'agent/v3.timer.started'` → `'agent/v4.timer.started'` (listen + emit + chaining)
   - Imports: `from '@/lib/agents/somnio-v3/types'` → `from '@/lib/agents/somnio-v4/types'`
   - Imports: `V3_TIMER_DURATIONS` (si lo importa) → `V4_TIMER_DURATIONS`
   - Exports: `v3Timer` → `v4Timer`; `v3TimerFunctions` → `v4TimerFunctions`
   - Comentarios docstring `V3` → `V4`

3. Reemplazar el bloque de routing por agente (líneas ~308-330 de v3 — `agentModule = 'somnio-v3' | 'godentist' | 'somnio-recompra'`) por dispatch directo a v4:
```typescript
const { processMessage } = await import('@/lib/agents/somnio-v4/somnio-v4-agent')
output = await processMessage(v4Input)
```

4. **Reemplazar el bloque order creation (líneas ~410-434 de v3)** que usa `createProductionAdapters({ agentId: 'somnio-sales-v3' })`:
```typescript
// v4 — D-07/D-22: crm-mutation-tools direct, idempotencyKey por nivel (Pitfall 5)
const { createCrmMutationTools } = await import('@/lib/agents/shared/crm-mutation-tools')
const { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } = await import('@/lib/agents/somnio-v4/config')

const tools = createCrmMutationTools({
  workspaceId: workspaceId ?? SOMNIO_WORKSPACE_ID,
  invoker: SOMNIO_V4_AGENT_ID,
})
const idempotencyKey = `somnio-v4-createOrder-${sessionId}-timer_L${level}`  // Pitfall 5 distinct tag

const result = await tools.createOrder.execute({
  /* fields desde state */,
  idempotencyKey,
})

if (result.status !== 'success') {
  logger.error({ sessionId, level, errorCode: 'error' in result ? result.error?.code : 'unknown' }, 'createOrder timer-driven failed')
  // D-20: NO enviar template post-success. Marcar handoff humano vía session flag.
  return { status: 'failed' as const, action: 'createOrder_failed', errorCode: 'error' in result ? result.error?.code : 'unknown' }
}
```

5. Mantener defensive guard (D-43) intacto:
```typescript
const guardResult = await checkSessionActive(sessionId)
if (!guardResult.ok) {
  return { status: 'skipped' as const, action: 'session_not_active' }
}
```

6. Verificar timer chaining (líneas ~449-481 de v3) — los `inngest.send({ name: 'agent/v3.timer.started', ... })` para encadenar L3 → L4 deben actualizarse a `'agent/v4.timer.started'`.

7. Mantener `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` y `retries: 3`.

**Anti-patterns críticos:**
- NO mantener `id: 'v3-timer'` (Pitfall 10 — colisión)
- NO usar `createProductionAdapters({ agentId: 'somnio-sales-v3' })` (D-07)
- NO compartir idempotencyKey entre 'happy' (Plan 07) y 'timer_L3' / 'timer_L4' (Pitfall 5)
- NO importar desde `@/lib/agents/somnio-v3/*` (D-24)

**Verificación final:**
```bash
grep -E "v3-timer|'agent/v3\.timer" src/inngest/functions/agent-timers-v4.ts
# expect: 0 (excepto comentarios "Cloned from v3")

grep -E "from '@/lib/agents/somnio-v3" src/inngest/functions/agent-timers-v4.ts
# expect: 0
```
  </action>
  <verify>
    <automated>test -f src/inngest/functions/agent-timers-v4.ts && grep -q "id: 'v4-timer'" src/inngest/functions/agent-timers-v4.ts && grep -q "'agent/v4.timer.started'" src/inngest/functions/agent-timers-v4.ts && grep -q "createCrmMutationTools" src/inngest/functions/agent-timers-v4.ts && grep -q "invoker: SOMNIO_V4_AGENT_ID" src/inngest/functions/agent-timers-v4.ts && grep -q "somnio-v4-createOrder-" src/inngest/functions/agent-timers-v4.ts && grep -q "timer_L" src/inngest/functions/agent-timers-v4.ts && grep -q "checkSessionActive" src/inngest/functions/agent-timers-v4.ts && [ "$(grep -E \"id: 'v3-timer'|'agent/v3\\.timer\" src/inngest/functions/agent-timers-v4.ts | grep -v '^//' | wc -l)" = "0" ] && [ "$(grep -E \"createProductionAdapters.*'somnio-sales-v3'\" src/inngest/functions/agent-timers-v4.ts | wc -l)" = "0" ] && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/inngest/functions/agent-timers-v4.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - `id: 'v4-timer'` literal
    - Event name `'agent/v4.timer.started'` literal en TODAS las ocurrencias
    - Cero literal `id: 'v3-timer'` o `'agent/v3.timer'` no-comentario
    - Usa `createCrmMutationTools` con `invoker: SOMNIO_V4_AGENT_ID`
    - idempotencyKey con `timer_L` tag
    - Cero `createProductionAdapters({agentId:'somnio-sales-v3'})`
    - Defensive guard preservado
    - Cero imports somnio-v3
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>v4 timer function clonado y wired a crm-mutation-tools.</done>
</task>

<task type="auto">
  <name>Task 2: Registrar v4Timer en Inngest functions registry</name>
  <files>src/inngest/index.ts</files>
  <read_first>
    - src/inngest/index.ts (registry actual — buscar donde se exportan v3TimerFunctions)
    - src/inngest/functions/agent-timers-v4.ts (acabado de crear)
  </read_first>
  <action>
Editar `src/inngest/index.ts`:
1. Agregar import: `import { v4TimerFunctions } from './functions/agent-timers-v4'`
2. Agregar al array exportado de funciones (típicamente `inngestFunctions` o similar):
```typescript
export const inngestFunctions = [
  // ...existing
  ...v3TimerFunctions,
  ...v4TimerFunctions,  // <— NEW
]
```

Si la estructura del registry es diferente (por ejemplo, exportación nombrada por archivo), seguir el patrón del archivo. Confirmar que Vercel/Inngest lo registra deployando.
  </action>
  <verify>
    <automated>grep -q "v4TimerFunctions" src/inngest/index.ts && grep -q "agent-timers-v4" src/inngest/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `v4TimerFunctions` importado
    - Agregado al export del registry
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>v4 timer registrado en Inngest pipeline.</done>
</task>

<task type="auto">
  <name>Task 3: Commit + push</name>
  <files>(archivos del Plan 08)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
```bash
git add src/inngest/functions/agent-timers-v4.ts src/inngest/index.ts
git commit -m "feat(somnio-v4): plan-08 — Inngest function agent-timers-v4

- Clone de agent-timers-v3.ts con renames Pitfall 10:
  - id: 'v4-timer', name: 'V4 Agent Timer'
  - event: 'agent/v4.timer.started' (listen + emit + chaining)
- Order creation timer-driven INLINE vía crm-mutation-tools (D-07/D-22)
- idempotencyKey: 'somnio-v4-createOrder-{sessionId}-timer_L{level}' (Pitfall 5)
- Defensive guard checkSessionActive preserved (D-43)
- Timer durations idénticas a v3 (D-21)
- Registrado en src/inngest/index.ts

D-24 verificado: cero imports desde @/lib/agents/somnio-v3/*
D-07 verificado: cero createProductionAdapters

Standalone: somnio-sales-v4
Decisions: D-13, D-19, D-20, D-21, D-22, D-24, D-43

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-08"</automated>
  </verify>
  <acceptance_criteria>
    - Commit + push completados
    - Vercel deploy ok
    - Inngest dashboard registra `v4-timer` function (verificar manualmente post-deploy si es posible)
  </acceptance_criteria>
  <done>v4 timer shipped (sin tráfico hasta el flip — Regla 6).</done>
</task>

</tasks>

<verification>
- v4-timer registrado en Inngest sin colisión con v3-timer
- Order creation timer-driven usa crm-mutation-tools
- D-24 + D-07 verificados
</verification>

<success_criteria>
- Cuando llegue el flip (Plan 13) y v4 reciba traffic, sus timers L3/L4 disparan correctamente
- Cero impacto en v3-timer pre-flip
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/08-SUMMARY.md` con:
- Verificación grep Pitfall 10
- Confirmación de registro en Inngest registry
- Hash commit
</output>
