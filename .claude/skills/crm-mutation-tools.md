# Project Skill: crm-mutation-tools

**Module:** `src/lib/agents/shared/crm-mutation-tools/`
**Standalone:** `.planning/standalone/crm-mutation-tools/` (shipped 2026-04-29)
**UI configuracion:** ninguna — activacion es per-agente via factory registration en `tools={...}`.
**Status:** Listo, sin consumidores activos hasta los standalones follow-up (D-08).

Modulo compartido de mutation tools deterministas (sin LLM intermedio, sin two-step propose+confirm) que cualquier agente conversacional puede registrar para mutar CRM directamente desde domain layer. Coexiste con `crm-writer` (D-01) — no lo reemplaza. Espejo del sibling `crm-query-tools` (mismo dia ship) pero con verbo opuesto (mutate vs read).

---

## PUEDE — 15 mutation tools deterministas (latencia 50-150ms in-loop)

Toda mutacion pasa por `@/lib/domain/*` (Regla 3 / D-pre-02). Tools NUNCA importan `createAdminClient` ni `@supabase/supabase-js` directo — verificable via grep.

### Contactos (3)

| Tool | Input | Return type | Notas |
|------|-------|-------------|-------|
| `createContact` | `{ name, phone?, email?, address?, city?, department?, customFields?, tagIds?, idempotencyKey? }` | `MutationResult<ContactDetail>` con `status: 'executed' \| 'duplicate' \| 'validation_error' \| 'error'` | Idempotency-eligible (D-03). Phone normalizado a E.164 inside la tool. Re-hidrata via `getContactById` (D-09). |
| `updateContact` | `{ contactId, name?, phone?, email?, address?, city?, department?, customFields?, tagIds? }` | `MutationResult<ContactDetail>` con `status: 'executed' \| 'resource_not_found' \| 'validation_error' \| 'error'` | Pre-check via `getContactById` → short-circuit `resource_not_found` si null. Update parcial — solo campos presentes se mutan. |
| `archiveContact` | `{ contactId }` | `MutationResult<ContactDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | Soft-delete via `archived_at` (D-pre-04). Idempotente — segundo call sobre archived row retorna `executed` con misma timestamp. |

### Pedidos (5)

| Tool | Input | Return type | Notas |
|------|-------|-------------|-------|
| `createOrder` | `{ contactId, pipelineId, stageId?, items, shippingAddress?, shippingCity?, shippingDepartment?, idempotencyKey? }` | `MutationResult<OrderDetail>` con `status: 'executed' \| 'duplicate' \| 'resource_not_found' \| 'validation_error' \| 'error'` | Idempotency-eligible. `resource_not_found.missing.resource` discrimina entre `pipeline` y `stage` (regex priority — Plan 03 fix). Re-hidrata `OrderDetail` con items + shipping. |
| `updateOrder` | `{ orderId, shippingAddress?, shippingCity?, shippingDepartment?, ... }` (NO `products`) | `MutationResult<OrderDetail>` con `status: 'executed' \| 'resource_not_found' \| 'validation_error' \| 'error'` | **NO incluye `products` en V1** — V1.1 deferred. Si cliente pide cambiar items, agente escala a handoff humano. |
| `moveOrderToStage` | `{ orderId, stageId }` | `MutationResult<OrderDetail>` con `status: 'executed' \| 'resource_not_found' \| 'stage_changed_concurrently' \| 'validation_error' \| 'error'` | **CAS-protected (Pitfall 1).** Propaga `stage_changed_concurrently` verbatim del domain SIN retry — agent loop / caller decide que hacer. `error.actualStageId` viene del domain refetch (puede ser null). Caller-friendly param `stageId` se mapea a `domain.newStageId` internamente. |
| `archiveOrder` | `{ orderId }` | `MutationResult<OrderDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | Soft-delete via `archived_at`. Pre-check + re-hydration usan `includeArchived: true` para soportar idempotencia sobre rows ya archivadas. |
| `closeOrder` | `{ orderId }` | `MutationResult<OrderDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | **D-11 Resolución A:** soft-close via `closed_at` (NO `archived_at`). Distinct semantics: closed = "pedido finalizado, sigue visible historico"; archived = "soft-delete, oculto del UI por defecto". Campos independientes — pedido puede estar simultaneamente closed Y archived. Re-hidrata via `getOrderById({ includeArchived: true })`. |

### Notas (4)

| Tool | Input | Return type | Notas |
|------|-------|-------------|-------|
| `addContactNote` | `{ contactId, body, idempotencyKey? }` | `MutationResult<ContactNoteDetail>` con `status: 'executed' \| 'duplicate' \| 'resource_not_found' \| 'validation_error' \| 'error'` | Idempotency-eligible. `body` se persiste FULL en DB (column `content` — adaptación domain field name); en observability `inputRedacted.body` se trunca a 200 chars (T-04-01 PII mitigation). `createdBy` inyectado desde `ctx.invoker`. |
| `addOrderNote` | `{ orderId, body, idempotencyKey? }` | `MutationResult<OrderNoteDetail>` con `status: 'executed' \| 'duplicate' \| 'resource_not_found' \| 'validation_error' \| 'error'` | Idempotency-eligible. Mismo body-truncate pattern que `addContactNote`. |
| `archiveContactNote` | `{ noteId }` | `MutationResult<ContactNoteDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | Soft-delete via `archived_at`. Best-effort body rehydrate post-archive (try/catch wrapped — non-fatal). |
| `archiveOrderNote` | `{ noteId }` | `MutationResult<OrderNoteDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | Mismo pattern que `archiveContactNote`. |

### Tareas (3)

| Tool | Input | Return type | Notas |
|------|-------|-------------|-------|
| `createTask` | `{ title, body?, dueDate?, contactId? \| orderId? \| conversationId?, idempotencyKey? }` | `MutationResult<TaskDetail>` con `status: 'executed' \| 'duplicate' \| 'validation_error' \| 'error'` | Idempotency-eligible. **Exclusive arc:** zod refine + defense-in-depth en domain — solo uno de `contactId/orderId/conversationId` puede estar presente. Schema usa `dueDate` (NO `dueAt` — alineado con DB column `due_date`). |
| `updateTask` | `{ taskId, title?, body?, dueDate? }` | `MutationResult<TaskDetail>` con `status: 'executed' \| 'resource_not_found' \| 'validation_error' \| 'error'` | Pre-check via `getTaskById` → short-circuit `resource_not_found`. |
| `completeTask` | `{ taskId }` | `MutationResult<TaskDetail>` con `status: 'executed' \| 'resource_not_found' \| 'error'` | Toggle `completed_at = NOW()`. Idempotente — second call sobre task ya completada = no-op (preserva timestamp original). Emite trigger `task.completed`. |

**Factory:** `createCrmMutationTools(ctx)` retorna las 15 tools listas para registrar — exactamente 15 keys, sin extras (D-02 closed list, smoke test enforced).

---

## NO PUEDE

- **Mutar recursos base** (tags, pipelines, stages, templates, usuarios) — fuera de scope absoluto (D-pre-05). Si una tool requiere un recurso inexistente, retorna `{ status: 'resource_not_found', error: { missing: { resource, id } } }` y el agente avisa al operador (NUNCA auto-crea).
- **Hard-DELETE de NADA.** Toda eliminacion es soft-delete via `archived_at` / `closed_at` / `completed_at` (D-pre-04). Patron heredado de crm-writer (Phase 44).
- **Retry implicito en `stage_changed_concurrently` (Pitfall 1).** El error se propaga verbatim del domain layer al agent loop. La decision de re-proponer la mutacion es del caller — el modulo NO intenta reintentos. Mismo contract que crm-writer (Standalone `crm-stage-integrity` D-06).
- **Acceder a otros workspaces.** `ctx.workspaceId` SOLO viene del execution context del agente (header validated por middleware, session_state, etc.). NUNCA del input/body de la tool. Domain filtra por `workspace_id` en cada query (Regla 3, D-pre-03). Verificable: `grep -E "workspaceId.*z\.string|workspaceId.*\.uuid" src/lib/agents/shared/crm-mutation-tools/{contacts,orders,notes,tasks}.ts` → 0 matches (Pitfall 2).
- **Cachear resultados.** Cada tool-call llega a domain layer fresh + re-hidrata via `getXxxById` post-mutacion (D-09). Costo: 1 RTT extra (~50-100ms). Beneficio: agente recibe state fresh sin segunda call, evita race conditions.
- **Editar items de un pedido (`updateOrder.products`)** — V1.1 deferred. En V1, si cliente pide cambiar items, agente escala a handoff humano. Verificable: `updateOrder.inputSchema` no contiene field `products`.
- **Importar `createAdminClient` o `@supabase/supabase-js`.** BLOCKER invariant — verificable via:

  ```bash
  grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/
  ```

  Esperado: 0 matches en imports (apariciones validas son solo doc-comments del header de cada archivo). Si aparece un import real → BLOCKER bug, fix antes de mergear.
- **Importar tipos desde `@/lib/agents/crm-writer`** (Pitfall 10). `ResourceType` esta duplicado en este modulo a proposito (mantener independencia per D-01 coexistencia). Cross-module type unification es deferred standalone.

---

## Validation (gates verificables)

- Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/shared/crm-mutation-tools/**` (BLOCKER 1; grep verification arriba).
- Todas las mutaciones pasan por domain layer que filtra por `workspace_id` (Regla 3 / D-pre-02).
- Cero `workspaceId` field en cualquier `inputSchema` — verificable via grep (Pitfall 2 / D-pre-03).
- Cero hard-DELETE imports — verificable: `grep -E "deleteContact|deleteOrder|deleteTask|deleteNote\b" src/lib/agents/shared/crm-mutation-tools/` retorna 0 matches (Pitfall 4 / D-pre-04).
- Cero retry en `stage_changed_concurrently` — verificable: `grep -E 'while.*stage_changed_concurrently|for.*stage_changed_concurrently|retry.*moveOrderToStage' src/lib/agents/shared/crm-mutation-tools/orders.ts` retorna 0 matches (Pitfall 1).
- Idempotencia persistente en tabla `crm_mutation_idempotency_keys` (PK `workspace_id, tool_name, key`); TTL 30 dias via cron Inngest `crm-mutation-idempotency-cleanup` (`TZ=America/Bogota 0 3 * * *` — off-peak diario).
- Audit trail emite 3 eventos `pipeline_decision:crm_mutation_*` (`invoked` / `completed` / `failed`) a `agent_observability_events` con PII redaction (phone last 4, email local-part masked, body truncated 200 chars).
- 15 tools registradas en factory `createCrmMutationTools(ctx)`. Test invariant `__tests__/index.test.ts` enumera los 15 nombres exactos — agregar/quitar tool sin update del test = scope creep guard fail.
- Test coverage: 67/67 unit tests (mocked domain) + 14 integration tests env-gated (`TEST_WORKSPACE_ID` + `TEST_WORKSPACE_ID_2` + `SUPABASE_SERVICE_ROLE_KEY` requeridos) + 4 Playwright E2E scenarios via runner endpoint hardened (NODE_ENV gate + `x-test-secret` header + workspace from env + 15-tool allowlist).

---

## Configuration

**No UI configuration today** — el modulo se activa per-agente via factory registration en `tools={...}` del agent loop. No hay flags de operador. No hay config persistente por workspace (a diferencia del sibling `crm-query-tools` que requiere stages activos en `crm_query_tools_config`).

Activacion runtime es 100% controlada por:

1. El agente importa `createCrmMutationTools` desde `@/lib/agents/shared/crm-mutation-tools`.
2. Agente llama el factory con `{ workspaceId: ctx.workspaceId, invoker: 'agent-id' }`.
3. Spread del result en `tools: { ... }` del `generateText`/`streamText` call.

Sin esos 3 pasos = agente no tiene acceso al modulo (D-08 sin feature flag = aislamiento total via no-registration).

---

## Wiring

Desde un agente futuro (ningun agente registrado en V1 — D-08):

```typescript
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// ctx.workspaceId DEBE venir del execution context del agente
// (header validated by middleware, session_state, etc.) — NUNCA del user input.
const mutationTools = createCrmMutationTools({
  workspaceId: ctx.workspaceId,
  invoker: 'my-agent-v1', // string para observability — se loggea en cada tool-call
})

const result = await generateText({
  model: anthropic('claude-haiku-4-5-20251001'),
  tools: {
    ...mutationTools,
    ...createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'my-agent-v1' }),
    // ...otras tools del agente si aplica
  },
  // ...
})
```

`createCrmMutationTools(ctx)` retorna **exactamente 15 keys** (3 contacts + 5 orders + 4 notes + 3 tasks) — sin extras. Spread directamente.

Patron `factory(ctx)` evita module-scope state — cada agente que llama el factory recibe instancias frescas con su propio `workspaceId` capturado en closure.

---

## Coexistence with crm-writer (D-01)

`crm-writer` (two-step propose+confirm + tabla `crm_bot_actions` + Inngest expire cron) sigue VIVO sin cambios. `crm-mutation-tools` es alternativa NUEVA, no reemplazo. Ambos coexisten en produccion.

**Cuando usar cada uno:**

| Aspecto | `crm-mutation-tools` | `crm-writer` |
|---------|----------------------|--------------|
| Patron | In-loop tool calls deterministas | Two-step propose → confirm |
| Latencia | ~50-150ms (1 RTT mutate + 1 RTT rehydrate) | ~150-300ms (2 RTT propose + confirm) |
| Audit trail | `agent_observability_events` (3 eventos `pipeline_decision:crm_mutation_*`) | `crm_bot_actions` table + structured payload |
| Operator preview | NO — mutacion inmediata | SI — sandbox UI muestra propose antes de confirm |
| Idempotencia | Opt-in via `idempotencyKey?` (tabla `crm_mutation_idempotency_keys`, TTL 30 dias) | Implicita (optimistic UPDATE WHERE status='proposed' — segundo confirm = `already_executed`) |
| TTL del intent | n/a (sin intent intermedio) | 5min (Inngest cron `crm-bot-expire-proposals` con 30s grace) |
| Default para... | Agentes nuevos in-loop sin humano (e.g. agente automatico que muta sin preview) | Flujos sandbox UI con preview operador antes de commit |
| Migracion crm-writer → mutation-tools | Standalones follow-up dedicados por agente (e.g. `crm-mutation-tools-pw-confirmation-integration`) | n/a |

**Pitfall 11 — coexistencia race:** un workspace NO debe tener simultaneamente Agent A usando crm-writer + Agent B usando mutation-tools mutando la misma clase de entidades — los audit trails quedan en tablas distintas (`crm_bot_actions` vs `agent_observability_events`) y forensics requiere UNION manual. Documentado como known limitation en `INTEGRATION-HANDOFF.md` § Pitfall 11.

---

## Idempotency contract

5 tools de creacion aceptan `idempotencyKey?: string` opcional en input (D-03):

- `createContact`, `createOrder`, `createTask`
- `addContactNote`, `addOrderNote`

Operaciones de update / archive / close / complete son **idempotentes por naturaleza** (mismo input → mismo state) y NO requieren key.

**Storage:** tabla `crm_mutation_idempotency_keys (workspace_id UUID, tool_name TEXT, key TEXT, result_id UUID, result_payload JSONB, created_at TIMESTAMPTZ, PRIMARY KEY (workspace_id, tool_name, key))`. RLS-protected (member SELECT, admin INSERT/DELETE — NO UPDATE: idempotency rows son immutables).

**Race semantics (D-09 + Pattern 4):** N llamadas concurrentes con misma `(workspace_id, tool_name, key)` resultan en exactamente 1 mutacion + N-1 retornos `duplicate`. La carrera la gana la primera que `INSERT` (gracias a `ON CONFLICT DO NOTHING`); las demas re-leen el winner via `getIdempotencyRow` y rehidratan via `rehydrate(winner.resultId)`. Verificable en `idempotency.test.ts` (5 calls Promise.all → 1 contact row + 4 duplicates).

**Re-hydration siempre fresh (Pitfall 6 / D-09):** el `result_payload` es tombstone para crash-recovery; el live state SIEMPRE se relee via `getXxxById(resultId)`. Si rehydrate retorna null (entity orphan tras TTL sweep), fallback al `result_payload` cacheado.

**TTL 30 dias:** cron Inngest `crm-mutation-idempotency-cleanup` (TZ=America/Bogota 0 3 * * *) ejecuta `DELETE FROM crm_mutation_idempotency_keys WHERE created_at < NOW() - INTERVAL '30 days'` workspace-agnostic. Off-peak para evitar contencion con otros crons.

**Cuando proporcionar `idempotencyKey`:**
- Caller paths con retry (network flake, agent re-invocation tras timeout, webhook redelivery).
- Agentes que persisten la key en `session_state` para reuso cross-turn.

**Cuando NO proporcionar:**
- Update / archive / close / complete (idempotentes por naturaleza).
- One-shot calls sin retry (e.g. user-initiated action en UI con confirmacion).

---

## Error contract `stage_changed_concurrently` (Pitfall 1)

`moveOrderToStage` propaga el error verbatim del domain layer SIN retry. Forma del result:

```typescript
{
  status: 'stage_changed_concurrently',
  error: {
    code: 'stage_changed_concurrently',
    expectedStageId: '<the-stageId-the-tool-was-called-with>',
    actualStageId: '<from-domain-data.currentStageId>' | null,
  }
}
```

`actualStageId` puede ser `null` si el domain refetch fallo (caso edge — el pedido pudo haberse archivado entre el SELECT y el UPDATE). El caller debe manejar ambos casos.

**Mismo contract que crm-writer** (Standalone `crm-stage-integrity` D-06) — `crm_bot_actions.error.code === 'stage_changed_concurrently'` significa lo mismo. La sandbox UI lo consume para mostrar toast "pedido stale / movido por otra fuente".

**Decision del caller:**
- Re-llamar `getOrderById` para obtener stage actual fresh.
- Re-proponer mutacion con stage actualizado (si tiene sentido).
- Escalar a handoff humano (e.g. `somnio-sales-v3-pw-confirmation` D-21 trigger c).
- NO retry automatico — eso introduciria loops infinitos en escenarios de carrera persistente.

---

## Observability emit contract

Cada tool-call emite **3 eventos** `pipeline_decision:*` con structured payloads. Los eventos van por el `ObservabilityCollector` del agente caller (sin escribir tabla propia — comparten `agent_observability_events`).

| Evento | Cuando | Payload |
|--------|--------|---------|
| `crm_mutation_invoked` | Inicio de `execute()` (antes de domain call) | `{ tool, workspaceId, invoker?, inputRedacted }` |
| `crm_mutation_completed` | Path success (`executed` o `duplicate`) | `{ tool, workspaceId, invoker?, latencyMs, resultStatus, resultId?, idempotencyKeyHit }` |
| `crm_mutation_failed` | Path error (`resource_not_found` / `stage_changed_concurrently` / `validation_error` / `error`) | `{ tool, workspaceId, invoker?, latencyMs, errorCode }` |

**PII redaction (D-23 / Pattern 5):**
- `phoneSuffix(raw)` — last 4 digits only.
- `emailRedact(raw)` — `'ali…@example.com'` (first 3 chars local-part + masked domain).
- `bodyTruncate(s, 200)` — note body truncado a 200 chars + ellipsis (T-04-01 mitigation).
- `idSuffix(uuid)` — last 8 chars de UUID para log readability.

Raw phone / full body / full email NUNCA se loggean. Verificable por inspeccion de los emisores en `helpers.ts`.

`idempotencyKeyHit: boolean` es campo nuevo unico de mutation-tools (query-tools no tiene idempotencia) — `true` cuando `status='duplicate'` retornado via key lookup.

---

## Consumers

(Pendientes — ningun consumidor activo en produccion al momento de ship — D-08 sin feature flag.)

Los siguientes agentes podrian migrar de `crm-writer` a `crm-mutation-tools` en standalones follow-up dedicados:

- **`somnio-sales-v3-pw-confirmation`** → standalone `crm-mutation-tools-pw-confirmation-integration` (TBD). Cleanup esperado: borra `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts`, swap `proposeAction + confirmAction` por tool calls in-loop deterministas, update CLAUDE.md scope.
- **Sandbox / agentes con preview UI** → permanecen en crm-writer (sandbox necesita el preview-flow que mutation-tools no provee). Coexistencia D-01 indefinida.
- **Agentes nuevos** → eligen mutation-tools por defecto (no requieren preview operador in-the-loop).

Hasta esos standalones, el modulo esta listo pero NO se invoca desde ningun agente en produccion. Verificable: `grep -rE "createCrmMutationTools|crm-mutation-tools" src/lib/agents/{somnio-*,crm-writer,crm-reader,sandbox}/` retorna 0 matches.

---

## References

- **Standalone:** `.planning/standalone/crm-mutation-tools/` (CONTEXT.md + RESEARCH.md + 6 PLANs + 6 SUMMARYs + INTEGRATION-HANDOFF.md + LEARNINGS.md + SUMMARY.md)
- **Integration handoff:** `.planning/standalone/crm-mutation-tools/INTEGRATION-HANDOFF.md` (full handoff con 15-tool inventory, error contract, observability SQL, Pitfall 11 coexistence)
- **Learnings:** `.planning/standalone/crm-mutation-tools/LEARNINGS.md`
- **CLAUDE.md scope section:** "Module Scope: crm-mutation-tools" (sub-seccion de Scopes por Agente)
- **Cross-reference:** `.claude/rules/agent-scope.md` — Module Scope: crm-mutation-tools
- **Source:** `src/lib/agents/shared/crm-mutation-tools/{index,types,helpers,contacts,orders,notes,tasks}.ts`
- **Domain (mutation):** `src/lib/domain/{contacts,orders,notes,tasks,crm-mutation-idempotency}.ts`
- **Migration applied:** `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql` + `supabase/migrations/20260429180001_orders_closed_at.sql`
- **Inngest cron:** `src/inngest/functions/crm-mutation-idempotency-cleanup.ts` (TZ=America/Bogota 0 3 * * *)
- **Test runner:** `src/app/api/test/crm-mutation-tools/runner/route.ts` (NODE_ENV+secret+env-workspace+15-tool-allowlist gates)
- **Integration tests:** `src/__tests__/integration/crm-mutation-tools/{cross-workspace,idempotency,soft-delete,stage-change-concurrent}.test.ts`
- **E2E spec:** `e2e/crm-mutation-tools.spec.ts`
- **Sibling skill:** `.claude/skills/crm-query-tools.md` (mismo dia ship, verbo opuesto)
