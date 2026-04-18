---
phase: 44-crm-bots
plan: 04
subsystem: crm-bots/reader
tags: [agents, crm-reader, ai-sdk-v6, domain-layer, read-only]
requires:
  - 44-01 (AgentId='crm-reader' extended en observability/types)
  - 44-03 (domain helpers: searchContacts, getContactById, listOrders, getOrderById, listPipelines, listStages, listTags)
provides:
  - processReaderMessage({workspaceId, messages, invoker}) -> ReaderOutput
  - CRM_READER_AGENT_ID = 'crm-reader'
  - crmReaderConfig (auto-registrado en agentRegistry al importar el modulo)
  - createReaderTools(ctx) — 7 tools AI SDK v6
affects:
  - Plan 07 (HTTP route /api/v1/crm-bots/reader) ahora puede importar processReaderMessage directamente
tech-stack:
  added:
    - "@ai-sdk/anthropic usage para generateText con model='claude-sonnet-4-5-20250929'"
  patterns:
    - "Tool handler delegates to domain layer (RESEARCH Pattern 1)"
    - "Discriminated tool return shape: found | not_found_in_workspace | error (Pitfall 5)"
    - "stepCountIs(5) cap on tool-loop (Pitfall 6)"
    - "Self-register on module import (godentist pattern)"
key-files:
  created:
    - src/lib/agents/crm-reader/types.ts
    - src/lib/agents/crm-reader/config.ts
    - src/lib/agents/crm-reader/system-prompt.ts
    - src/lib/agents/crm-reader/index.ts
    - src/lib/agents/crm-reader/tools/index.ts
    - src/lib/agents/crm-reader/tools/contacts.ts
    - src/lib/agents/crm-reader/tools/orders.ts
    - src/lib/agents/crm-reader/tools/pipelines.ts
    - src/lib/agents/crm-reader/tools/tags.ts
  modified: []
decisions:
  - "Reader scope V1 congelado a 7 tools: contactsSearch/Get, ordersList/Get, pipelinesList, stagesList, tagsList. 'tagsEntities' diferido a V1.1 (PLAN revision 2026-04-18)."
  - "Model ID pinned a 'claude-sonnet-4-5-20250929' (no alias) para deterministic routing."
  - "ReaderMessage type es subtipo estructural de ModelMessage; cast seguro via 'as unknown as ModelMessage[]' — input validation upstream en Plan 07 HTTP route."
  - "Tool-call loop capped a 5 steps (stepCountIs). Suficiente para: buscar -> confirmar -> detallar."
metrics:
  duration_minutes: ~12
  completed_at: 2026-04-18
  tasks_completed: 3
  files_created: 9
  lines_total: 535
---

# Phase 44 Plan 04: CRM Reader Agent Summary

Agente AI de SOLO LECTURA sobre CRM con 7 tools AI SDK v6, registrado bajo id `'crm-reader'`, llamable via `processReaderMessage({workspaceId, messages})`. Zero imports directos a Supabase — TODAS las queries pasan por `@/lib/domain/*` (Blocker 1 enforcement).

## Que se construyo

9 archivos nuevos (535 lineas) en `src/lib/agents/crm-reader/`:

| Archivo | Lineas | Proposito |
|---------|--------|-----------|
| types.ts | 55 | ReaderContext, ReaderInput/Output, ToolLookupResult<T>, ToolListResult<T> |
| config.ts | 62 | crmReaderConfig + CRM_READER_AGENT_ID='crm-reader', 7 tools declarados |
| system-prompt.ts | 45 | buildReaderSystemPrompt(workspaceId): PUEDE/NO PUEDE explicitos (agent-scope.md BLOCKING) |
| index.ts | 89 | processReaderMessage() + self-register en agentRegistry |
| tools/index.ts | 24 | createReaderTools(ctx) agrega las 4 categorias |
| tools/contacts.ts | 77 | contactsSearch (ILIKE), contactsGet (detail con tags+custom_fields) |
| tools/orders.ts | 73 | ordersList (filtros pipeline/stage/contact), ordersGet (detail + items) |
| tools/pipelines.ts | 66 | pipelinesList (con stages nested), stagesList (por pipeline) |
| tools/tags.ts | 44 | tagsList (V1 scope; tagsEntities diferido V1.1) |

## Commits

| Hash | Task | Mensaje |
|------|------|---------|
| 03e0292 | 1 | feat(44-04): scaffold crm-reader types, config y system prompt |
| 71b6d99 | 2 | feat(44-04): crm-reader tool files (contacts, orders, pipelines, tags) |
| 24ad7bd | 3 | feat(44-04): crm-reader entry point con generateText y self-register |

## Blocker 1 verification (2026-04-18)

Grep ejecutado al final del Task 2 y repetido en el cierre del plan:

```bash
grep -rEn "^\s*import.*\b(createAdminClient|@supabase/supabase-js|@/lib/supabase/admin)\b" src/lib/agents/crm-reader/tools/
# exit 1, 0 matches
```

Resultado: **0 matches** en imports reales. La unica aparicion de los terminos es un comentario docstring en `contacts.ts` que documenta el invariante.

Lista de imports de dominio en `tools/`:

```
contacts.ts:  from '@/lib/domain/contacts'
contacts.ts:  from '@/lib/domain/types'
orders.ts:    from '@/lib/domain/orders'
orders.ts:    from '@/lib/domain/types'
pipelines.ts: from '@/lib/domain/pipelines'
pipelines.ts: from '@/lib/domain/types'
tags.ts:      from '@/lib/domain/tags'
tags.ts:      from '@/lib/domain/types'
```

**4 archivos con imports de `@/lib/domain/*` — uno por cada categoria de tools.** Blocker 1 cumplido.

## Write-import prohibition verification

```bash
grep -rEn "\b(createContact|updateContact|archiveContact|deleteContact|createOrder|updateOrder|archiveOrder|moveOrderToStage|createNote|updateNote|archiveNote|createTask|updateTask|proposeAction)\b" src/lib/agents/crm-reader/
# exit 1, 0 matches
```

Reader literalmente no importa NINGUN simbolo de escritura. TypeScript no puede inferir este invariante (compile-time pero solo por exclusion), pero el grep es el enforcement determinista.

## System prompt compliance (agent-scope.md)

- `SOLO LECTURA` — 1 ocurrencia
- `PUEDE` / `NO PUEDE` — 3 ocurrencias (encabezados de las secciones + una dentro)
- `not_found_in_workspace` — 2 ocurrencias (una explicando el status, otra en "Reglas criticas")

El system prompt cumple el requisito BLOCKING de agent-scope.md: lista explicita de PUEDE/NO PUEDE, scope por workspace, prohibicion de inventar IDs, indicacion al caller de que contacte al `crm-writer` para mutaciones.

## Tool return shape discrimination (Pitfall 5)

Cada `ToolLookupResult<T>`:
- `{ status: 'found', data: T }`
- `{ status: 'not_found_in_workspace' }`
- `{ status: 'error', message: string }`

Cada `ToolListResult<T>`:
- `{ status: 'ok', count: number, items: T[] }`
- `{ status: 'error', message: string }`

Esto evita que el LLM confunda lista vacia con error de workspace, y fuerza una respuesta explicita cuando el recurso no existe.

## TypeScript compile check

```
npx tsc --noEmit 2>&1 | grep "src/lib/agents/crm-reader" | wc -l
# 0
```

Cero errores en `src/lib/agents/crm-reader/`.

Errores pre-existentes (out of scope):
- `src/lib/agents/somnio/__tests__/block-composer.test.ts` — vitest types no resueltos
- `src/lib/agents/somnio/__tests__/char-delay.test.ts` — vitest types + implicit any

Estos 4 errores pre-existen en el worktree base (e3d85a5) y no estan relacionados con Plan 44-04.

## agentRegistry registration

```typescript
// src/lib/agents/crm-reader/index.ts:24
agentRegistry.register(crmReaderConfig)
```

Ejecutado en module-scope. Consumers solo necesitan `import '@/lib/agents/crm-reader'` para que el agent quede disponible en el registry.

## Deviations from Plan

Ninguna desviacion de las descritas en el plan. Notas menores de implementacion:

1. **TagListItem import**: en `tools/tags.ts` el import es `import { listTags, type TagListItem }` en una sola linea (el plan lo sugeria como dos lineas separadas). Equivalente semanticamente.

2. **Model-ID fallback**: el plan decia "if `MODEL_ID` is not a valid identifier, fall back". Verificado contra `src/lib/observability/pricing.ts:65` que lista `claude-sonnet-4-5-20250929` como id aceptado. No se aplico fallback — el id es valido.

3. **Tool call output aggregation**: uso `Map<toolCallId, output>` para emparejar toolCalls con toolResults en lugar de `.find()` cuadratico. Mejora menor de performance, mismo semantica.

## Dependencias downstream

- **Plan 07 (HTTP route)** puede ahora:
  ```typescript
  import { processReaderMessage } from '@/lib/agents/crm-reader'
  // POST /api/v1/crm-bots/reader → processReaderMessage({ workspaceId, messages, invoker })
  ```

- **Plan 05 (crm-writer)** seguira el mismo patron con `src/lib/agents/crm-writer/` + `proposeAction` en vez de delegar directo al dominio.

## Push order (REGLA 5 + REGLA 6)

NO pushear este plan solo. Coordinar push con:
- Plan 01 Tasks 2-4 (middleware + agent_id extension)
- Plan 03 Tasks 2-5 (domain helpers + archive columns ya aplicados en prod)

Migracion `archived_at` ya aplicada en produccion (confirmada por el usuario — ver 44-03-SUMMARY.md). El `AgentId='crm-reader'` es un tipo TypeScript, no requiere migracion DB.

El reader no afecta a ningun agente en produccion (Regla 6 — el agente Somnio V3 / GoDentist siguen intactos). Reader se expone solo via rutas `/api/v1/crm-bots/reader` que no existen todavia (Plan 07). Safe-to-push despues del merge de Wave 2.

## Self-Check: PASSED

- src/lib/agents/crm-reader/types.ts — FOUND
- src/lib/agents/crm-reader/config.ts — FOUND
- src/lib/agents/crm-reader/system-prompt.ts — FOUND
- src/lib/agents/crm-reader/index.ts — FOUND
- src/lib/agents/crm-reader/tools/index.ts — FOUND
- src/lib/agents/crm-reader/tools/contacts.ts — FOUND
- src/lib/agents/crm-reader/tools/orders.ts — FOUND
- src/lib/agents/crm-reader/tools/pipelines.ts — FOUND
- src/lib/agents/crm-reader/tools/tags.ts — FOUND
- Commit 03e0292 — FOUND
- Commit 71b6d99 — FOUND
- Commit 24ad7bd — FOUND
- Blocker 1 grep — 0 violations
- Write-import grep — 0 violations
- tsc errors in crm-reader/ — 0
