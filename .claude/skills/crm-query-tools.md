# Project Skill: crm-query-tools

**Module:** `src/lib/agents/shared/crm-query-tools/`
**Standalone:** `.planning/standalone/crm-query-tools/` (shipped 2026-04-29)
**UI configuracion:** `/agentes/crm-tools`
**Status:** Listo, sin consumidores activos hasta los standalones follow-up.

Modulo compartido de query tools deterministas (sin LLM intermedio) que cualquier agente conversacional puede registrar para consultar contactos y pedidos directamente desde domain layer. Reemplaza el patron preload Inngest bloqueante por on-demand tool-call dentro del loop del agente.

---

## Tools (PUEDE — solo lectura)

| Tool | Input | Return type | Notas |
|------|-------|-------------|-------|
| `getContactByPhone` | `{ phone: string }` | `CrmQueryLookupResult<ContactWithDuplicates>` con `status: 'found' \| 'not_found' \| 'error'` | D-08: si 2+ contactos comparten phone, retorna el `created_at` mas reciente + `duplicates_count` + `duplicates: string[]`. Phone normalizado a E.164 dentro de la tool (D-09). |
| `getLastOrderByPhone` | `{ phone: string }` | `CrmQueryLookupResult<OrderDetail>` con `status: 'found' \| 'not_found' \| 'no_orders' \| 'error'` | D-10: distingue phone desconocido (`not_found`) vs cliente sin compras (`no_orders`). Incluye items + shipping + stage. |
| `getOrdersByPhone` | `{ phone: string, limit?: number, offset?: number }` | `CrmQueryListResult<OrderListItem>` con `status: 'found' \| 'not_found' \| 'no_orders' \| 'error'` | Historial paginado. Default limit/offset definidos en helpers. |
| `getActiveOrderByPhone` | `{ phone: string, pipelineId?: string }` | `CrmQueryLookupResult<OrderDetail>` con `status: 'found' \| 'not_found' \| 'no_orders' \| 'no_active_order' \| 'multiple_active' \| 'config_not_set' \| 'error'` | D-15: multi-active retorna newest + `other_active_orders_count > 0`. D-16: `pipelineId` param override config. D-17: `no_active_order` puede traer `last_terminal_order`. **D-27: `config_not_set` = workspace nunca configuro stages activos via UI.** |
| `getOrderById` | `{ orderId: string }` | `CrmQueryLookupResult<OrderDetail>` con `status: 'found' \| 'not_found' \| 'error'` | Espejo de `crm-reader.ordersGet`. |

**Factory:** `createCrmQueryTools(ctx)` retorna las 5 tools listas para registrar.

---

## NO PUEDE

- **Mutar NADA.** Toda escritura (crear/editar/archivar contactos, pedidos, notas, tareas) pasa por `crm-writer` two-step propose→confirm. Si un agente necesita mutar, importa crm-writer; NO de aqui.
- **Acceder a otros workspaces.** `workspaceId` SOLO viene del `ctx` del agente (header `x-workspace-id` o session_state, segun el adapter). NUNCA del input/body de la tool. Domain filtra por `workspace_id` en cada query (Regla 3, D-05).
- **Cachear resultados.** Cada tool-call llega a domain layer fresh (D-19). Latencia esperada ~50-150ms RTT Supabase desde Vercel — aceptable para 1-2 calls por turn. Cache eliminaria clase de bugs de stale data (critico cuando pw-confirmation muta stages mid-turn).
- **Escribir keys legacy** `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` en `session_state.datos_capturados` (D-21). Las tools son puro return value — el caller decide si persiste algo. El cleanup de esas keys lo hacen los standalones de integracion por agente.
- **Hardcodear nombres de stages.** La lista de "stages activos" se lee runtime de `crm_query_tools_config` + `crm_query_tools_active_stages` (D-11/D-13 config-driven UUID). Si el operador no configuro, `getActiveOrderByPhone` retorna `config_not_set` (D-27) — el agente debe distinguir esto de `no_active_order` y escalar/guiar diferente.
- **Importar `createAdminClient` o `@supabase/supabase-js`.** BLOCKER invariant — verificable via:

  ```bash
  grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/
  ```

  Esperado: 0 matches en imports (solo apariciones validas son doc-comments del header de cada archivo documentando la regla). Si aparece un import real → es un BLOCKER bug, fix antes de mergear.

---

## Wiring

Desde un agente futuro (por ejemplo `somnio-recompra-v1` post-migracion):

```typescript
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { generateText, tool } from 'ai'

const result = await generateText({
  model: anthropic('claude-haiku-4-5-20251001'),
  tools: {
    ...createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'somnio-recompra-v1' }),
    // ...otras tools del agente (e.g. crm-writer) si aplica
  },
  // ...
})
```

`ctx.workspaceId` MUST come from authenticated execution context (header validated by middleware, session_state, etc.) — NEVER from user input.

---

## Configuration prerequisite

`getActiveOrderByPhone` depende de configuracion persistente por workspace:

1. **Operador entra a `/agentes/crm-tools`** (admin-gated server action).
2. Selecciona pipeline scope (opcional, null = todas las pipelines del workspace).
3. Multi-select de stages "activos" (UUIDs de `pipeline_stages`).
4. Save → server action escribe a `crm_query_tools_config` (singleton row) + `crm_query_tools_active_stages` (junction).

Hasta que un operador configure stages, `getActiveOrderByPhone` retorna `{ status: 'config_not_set', contact: ContactDetail }`. El agente debe interpretar esto como "el operador necesita configurar el modulo" — distinto de `no_active_order` que significa "config existe pero ningun pedido del contacto esta en stages activos".

---

## Observability

Cada tool-call emite 3 eventos `pipeline_decision:*` con structured logs:

| Evento | Cuando | Payload |
|--------|--------|---------|
| `crm_query_invoked` | inicio del execute() | `queryName`, `workspaceId`, `actorAgentId`, `phoneRedacted` (last 4 digits only) |
| `crm_query_completed` | success path | `queryName`, `latencyMs`, `resultStatus`, `workspaceId`, `actorAgentId` |
| `crm_query_failed` | error path | `queryName`, `errorCode`, `latencyMs`, `workspaceId`, `actorAgentId` |

**PII redaction:** raw phone NUNCA se loggea. Solo last-4-digits o hash. Aplica al modulo entero — verificable por inspeccion de los emisores en `helpers.ts`.

---

## Validation

- Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/shared/crm-query-tools/**` (BLOCKER 1; grep verification arriba).
- Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3).
- Configuracion persistente: tabla `crm_query_tools_config` (PK `workspace_id`, FK CASCADE a `workspaces`, FK SET NULL a `pipelines`) + `crm_query_tools_active_stages` (junction `workspace_id + stage_id`, FK CASCADE a `pipeline_stages` para D-13 stale UUID prevention).
- 5 tools registradas en factory `createCrmQueryTools(ctx)`. Test invariant: factory retorna keys `{ getContactByPhone, getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById }` (sin extras).
- Phone normalizado a E.164 inside cada tool antes de query — invalid format retorna `{ status: 'error', error: { code: 'invalid_phone' } }`.
- Test coverage: 35/35 unit tests (mocked domain) + 3 integration tests env-gated (`TEST_WORKSPACE_ID` + `TEST_API_KEY` requeridos) + 1 Playwright E2E spec con runner endpoint hardened (NODE_ENV gate + secret header + workspace from env + 5-tool allowlist).

---

## Consumers

(Pendientes — ningun consumidor activo en produccion al momento de ship.)

Los siguientes agentes seran migrados en standalones follow-up dedicados — cada uno con cleanup propio de state machine, prompts, dispatch, y scope rules ademas de simplemente borrar el preload Inngest viejo:

- **`somnio-recompra-v1`** → standalone `crm-query-tools-recompra-integration` (TBD). Cleanup: borra `src/inngest/functions/recompra-preload-context.ts`, drop keys legacy `_v3:crm_context*` de `session_state.datos_capturados`, swap a in-loop tool calls, update CLAUDE.md scope.
- **`somnio-sales-v3-pw-confirmation`** → standalone `crm-query-tools-pw-confirmation-integration` (TBD). Cleanup: simplifica `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (drop step 1 preload, mantiene step 2 agent invocation), drop key legacy `_v3:active_order`, swap a in-loop tool calls, update CLAUDE.md scope.

Hasta esos standalones, el modulo esta listo pero NO se invoca desde ningun agente en produccion.

---

## References

- **Standalone:** `.planning/standalone/crm-query-tools/`
- **Integration handoff:** `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` (tool inventory completo con JSON examples + recetas de migracion)
- **Learnings:** `.planning/standalone/crm-query-tools/LEARNINGS.md` (bug log + patterns)
- **CLAUDE.md scope section:** "Module Scope: crm-query-tools" (sub-seccion de Scopes por Agente)
- **Cross-reference:** `.claude/rules/agent-scope.md` — Module Scope: crm-query-tools
- **Source:** `src/lib/agents/shared/crm-query-tools/{index,types,contacts,orders,helpers}.ts`
- **Domain:** `src/lib/domain/crm-query-tools-config.ts` (`getCrmQueryToolsConfig` + `updateCrmQueryToolsConfig`)
- **UI:** `src/app/(dashboard)/agentes/crm-tools/{page,_actions,_components/{ConfigEditor,MultiSelectStages}}.tsx`
- **Migration applied:** `supabase/migrations/20260429172905_crm_query_tools_config.sql`
- **Test runner:** `src/app/api/test/crm-query-tools/runner/route.ts` (NODE_ENV+secret+env-workspace+allowlist gates)
- **E2E spec:** `e2e/crm-query-tools.spec.ts`
