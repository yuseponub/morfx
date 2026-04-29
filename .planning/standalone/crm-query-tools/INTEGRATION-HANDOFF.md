# crm-query-tools — Integration Handoff (snapshot 2026-04-29)

**Modulo:** `src/lib/agents/shared/crm-query-tools/`
**Standalone:** `.planning/standalone/crm-query-tools/`
**Ship date:** 2026-04-29 (Plan 07 — Wave 6 cierra el standalone)
**Living doc:** `.claude/skills/crm-query-tools.md` (descubrible por tooling y agentes futuros)
**Status:** READY — sin consumidores en produccion. Los 2 standalones follow-up (`crm-query-tools-recompra-integration` y `crm-query-tools-pw-confirmation-integration`) heredan este documento como input principal.

> **Snapshot del momento de ship — no cambia post-merge.** Si el modulo evoluciona (nueva tool, breaking en types, etc.) es responsabilidad del PR autor actualizar el project skill `.claude/skills/crm-query-tools.md`, NO este archivo. El INTEGRATION-HANDOFF queda como referencia historica de la API en el momento del ship (D-26).

---

## TL;DR — Lo que cambio

1. **Nuevo modulo compartido:** `src/lib/agents/shared/crm-query-tools/` exporta `createCrmQueryTools(ctx)` que retorna 5 tools deterministas para consultar CRM directamente desde domain layer (sin LLM intermedio, sin preload Inngest).
2. **Nueva tabla de configuracion por workspace:** `crm_query_tools_config` (singleton) + `crm_query_tools_active_stages` (junction). Aplicada en prod 2026-04-29 via migration `20260429172905_crm_query_tools_config.sql`.
3. **Nueva UI de operador:** `/agentes/crm-tools` permite escoger pipeline scope + multi-select de stages activos. Sin esa configuracion, `getActiveOrderByPhone` retorna `config_not_set`.
4. **Domain layer extendido:** `ContactDetail.department` y `OrderDetail.shippingAddress / shippingCity / shippingDepartment` ahora son first-class — antes solo vivian dentro del reader.
5. **Test infra hardened:** runner endpoint `POST /api/test/crm-query-tools/runner` (NODE_ENV gate + secret header + workspace from env + tool allowlist), seed/cleanup fixtures Playwright, 35/35 unit tests + 3 integration env-gated + 1 Playwright spec.

---

## Tool inventory

Todas las tools son **read-only** (Regla 3 cero-mutacion). Toda query pasa por domain layer que ya filtra por `workspace_id`. Phone se normaliza a E.164 dentro de la tool (D-09 — invalid → `error.code='invalid_phone'`).

### `getContactByPhone`

```typescript
inputSchema: z.object({ phone: z.string() })
returns: CrmQueryLookupResult<ContactWithDuplicates>
```

**Status enum:** `'found' | 'not_found' | 'error'`

**Notas:**
- Si 2+ contactos comparten el mismo telefono normalizado en el workspace, retorna el `created_at DESC` mas reciente (D-08).
- `data.duplicates_count` y `data.duplicates: string[]` (IDs de los OTROS contactos) — utilizado por agentes para advertir al operador.
- `data` reutiliza `ContactDetail` del domain (`src/lib/domain/contacts.ts`) extendido con `department` (Plan 02).

**JSON examples:**

```jsonc
// status=found (caso comun)
{
  "status": "found",
  "data": {
    "id": "c-uuid",
    "name": "Maria Lopez",
    "phone": "+573009998888",
    "email": "maria@example.com",
    "tags": [{ "id": "t1", "name": "Cliente" }],
    "customFields": { "ciudad_lead": "Bogota" },
    "address": "Calle 100 #50-20",
    "city": "Bogota",
    "department": "Cundinamarca",
    "duplicates_count": 0,
    "duplicates": []
  }
}

// status=found con duplicados (D-08)
{
  "status": "found",
  "data": {
    "id": "c-newest-uuid",
    "name": "Pedro Rivera",
    "phone": "+573009999222",
    "duplicates_count": 2,
    "duplicates": ["c-older-1", "c-older-2"]
  }
}

// status=not_found (telefono desconocido en workspace)
{ "status": "not_found" }

// status=error (DB error o telefono invalido)
{ "status": "error", "error": { "code": "invalid_phone", "message": "phone must be E.164" } }
{ "status": "error", "error": { "code": "db_error" } }
```

---

### `getLastOrderByPhone`

```typescript
inputSchema: z.object({ phone: z.string() })
returns: CrmQueryLookupResult<OrderDetail>
```

**Status enum:** `'found' | 'not_found' | 'no_orders' | 'error'`

**Notas:**
- D-10: distingue `not_found` (telefono desconocido) vs `no_orders` (contacto existe pero zero pedidos). Esto es lo que `crm-reader` no diferenciaba claramente; aqui el agente puede ramificar bot logic sin parsear texto.
- `data.shippingAddress / shippingCity / shippingDepartment` poblados desde el ultimo pedido (no del contacto — D-22 los pedidos llevan su propia direccion para no-cambiar-cuando-cliente-actualiza-perfil).
- Incluye `data.items: OrderItem[]` con `titulo`, `cantidad`, `unitPrice`.

**JSON examples:**

```jsonc
// status=found
{
  "status": "found",
  "data": {
    "id": "o-uuid",
    "orderName": "Pedido 1234",
    "stageId": "stage-confirmado",
    "stageName": "CONFIRMADO",
    "pipelineId": "p-uuid",
    "totalValue": 99000,
    "createdAt": "2026-04-15T12:30:00.000Z",
    "items": [
      { "titulo": "Elixir del Sueno 30ml", "cantidad": 1, "unitPrice": 99000 }
    ],
    "shippingAddress": "Calle 100 #50-20",
    "shippingCity": "Bogota",
    "shippingDepartment": "Cundinamarca",
    "archivedAt": null
  }
}

// status=no_orders (contacto existe, sin pedidos)
{
  "status": "no_orders",
  "contact": { "id": "c-uuid", "name": "Lead Curioso", "phone": "+573009998888" }
}

// status=not_found (telefono desconocido)
{ "status": "not_found" }

// status=error
{ "status": "error", "error": { "code": "db_error" } }
```

---

### `getOrdersByPhone`

```typescript
inputSchema: z.object({
  phone: z.string(),
  limit: z.number().optional(),    // default 10
  offset: z.number().optional(),   // default 0
})
returns: CrmQueryListResult<OrderListItem>
```

**Status enum:** `'ok' | 'not_found' | 'no_orders' | 'error'`

**Notas:**
- Lista paginada — usa `OrderListItem` (no `OrderDetail`) para no traer items completos por pedido. Si el agente necesita detalle, llama `getOrderById` despues.
- `count` total de pedidos ANTES de paginacion (no items.length) — util para "tienes 12 pedidos" UX.
- Usa el status `'ok'` (no `'found'`) porque retorna lista. Si la lista es vacia para un contacto existente sin orders, retorna `'no_orders'` con el contacto adjunto.

**JSON examples:**

```jsonc
// status=ok (con paginacion)
{
  "status": "ok",
  "count": 12,
  "items": [
    {
      "id": "o-1",
      "orderName": "Pedido 1234",
      "stageName": "ENTREGADO",
      "totalValue": 99000,
      "createdAt": "2026-04-15T12:30:00Z",
      "archivedAt": null
    }
  ]
}

// status=no_orders
{
  "status": "no_orders",
  "contact": { "id": "c-uuid", "name": "Lead", "phone": "+573009998888" }
}

// status=not_found
{ "status": "not_found" }

// status=error
{ "status": "error", "error": { "code": "db_error" } }
```

---

### `getActiveOrderByPhone`

```typescript
inputSchema: z.object({
  phone: z.string(),
  pipelineId: z.string().optional(),  // override config (D-16)
})
returns: CrmQueryLookupResult<OrderDetail>
```

**Status enum:** `'found' | 'not_found' | 'no_orders' | 'no_active_order' | 'multiple_active' | 'config_not_set' | 'error'`

**Notas — la tool mas rica del set:**
- **D-27 `config_not_set`:** si el workspace nunca configuro stages activos via `/agentes/crm-tools`, retorna `{ status: 'config_not_set', contact: ContactDetail }`. El agente DEBE distinguir esto de `no_active_order` — escalar al operador "configura el modulo" vs "el cliente no tiene pedido activo".
- **D-15 `multiple_active`:** si 2+ pedidos del contacto estan en stages activos, retorna el mas reciente como `data` + `data.other_active_orders_count > 0`. NO falla — devuelve el mejor candidato.
- **D-17 `no_active_order` con last_terminal_order:** cuando hay pedidos del contacto pero ninguno en stage activo, opcionalmente trae el ultimo terminal (entregado/cancelado/etc) para dar contexto al agente ("tu ultimo pedido fue entregado el X").
- **D-16 `pipelineId` override:** permite acotar busqueda a UNA pipeline especifica (caso multi-pipeline workspace). Sin override, usa el `pipelineId` configurado en `crm_query_tools_config` (puede ser null = "todas las pipelines del workspace").
- Lee `crm_query_tools_active_stages` runtime — JAMAS hardcodea nombres de stages.

**JSON examples:**

```jsonc
// status=found (caso happy path)
{
  "status": "found",
  "data": {
    "id": "o-active-uuid",
    "orderName": "Pedido 5678",
    "stageId": "stage-falta-info",
    "stageName": "FALTA INFO",
    "totalValue": 99000,
    "items": [{ "titulo": "Elixir 30ml", "cantidad": 1, "unitPrice": 99000 }],
    "shippingAddress": null,
    "shippingCity": null,
    "shippingDepartment": null,
    "archivedAt": null
  }
}

// status=multiple_active (D-15)
{
  "status": "found",
  "data": {
    "id": "o-newest-active-uuid",
    "stageName": "NUEVO PAG WEB",
    "other_active_orders_count": 2
  }
}

// status=no_active_order (D-17 con last terminal)
{
  "status": "no_active_order",
  "contact": { "id": "c-uuid", "name": "Cliente Recurrente", "phone": "+573009998888" },
  "last_terminal_order": {
    "id": "o-old",
    "stageName": "ENTREGADO",
    "createdAt": "2026-02-01T00:00:00Z"
  }
}

// status=config_not_set (D-27 — operador no configuro stages)
{
  "status": "config_not_set",
  "contact": { "id": "c-uuid", "name": "Algun Cliente", "phone": "+573009998888" }
}

// status=no_orders (contacto existe, zero pedidos)
{
  "status": "no_orders",
  "contact": { "id": "c-uuid", "name": "Lead Curioso", "phone": "+573009998888" }
}

// status=not_found (telefono desconocido)
{ "status": "not_found" }

// status=error
{ "status": "error", "error": { "code": "db_error" } }
```

---

### `getOrderById`

```typescript
inputSchema: z.object({ orderId: z.string() })
returns: CrmQueryLookupResult<OrderDetail>
```

**Status enum:** `'found' | 'not_found' | 'error'`

**Notas:**
- Espejo de `crm-reader.ordersGet`. La tool mas simple del set.
- Util cuando el agente ya tiene un `orderId` de turno previo y quiere refrescar shipping/items sin reconsultar por phone.
- Filtra por `workspace_id` del context — un orderId valido pero de otro workspace retorna `not_found` (D-05 isolation).

**JSON examples:**

```jsonc
// status=found
{
  "status": "found",
  "data": {
    "id": "o-uuid",
    "orderName": "Pedido 5678",
    "stageId": "stage-confirmado",
    "stageName": "CONFIRMADO",
    "totalValue": 99000,
    "items": [{ "titulo": "Elixir 30ml", "cantidad": 1, "unitPrice": 99000 }],
    "shippingAddress": "Calle 100 #50-20",
    "shippingCity": "Bogota",
    "shippingDepartment": "Cundinamarca",
    "archivedAt": null
  }
}

// status=not_found
{ "status": "not_found" }

// status=error
{ "status": "error", "error": { "code": "db_error" } }
```

---

## Wiring example

```typescript
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// ctx.workspaceId DEBE venir del execution context del agente
// (header validated by middleware, session_state, etc.) — NUNCA del user input.
const queryTools = createCrmQueryTools({
  workspaceId: ctx.workspaceId,
  invoker: 'somnio-recompra-v1', // string para observability — se loggea en cada tool-call
})

const result = await generateText({
  model: anthropic('claude-haiku-4-5-20251001'),
  tools: {
    ...queryTools,
    // ...otras tools (e.g. crm-writer two-step) si aplica
  },
  // ...
})
```

`createCrmQueryTools(ctx)` retorna `{ getContactByPhone, getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById }` — **exactamente 5 keys**, sin extras. Spread directamente.

Patron `factory(ctx)` evita module-scope state (Pitfall 6) — cada agente que llama el factory recibe instancias frescas con su propio `workspaceId` capturado en closure.

---

## Divergences from crm-reader

| Aspecto | crm-reader (HTTP API) | crm-query-tools (in-process) |
|---------|----------------------|------------------------------|
| **Status enum** | `not_found_in_workspace` | `not_found` (workspace implicito en ctx — Open Q7) |
| **Distincion zero-orders** | Mezclado en `not_found` | `no_orders` separado de `not_found` (D-10) |
| **Active order semantics** | No expone tool dedicada | `getActiveOrderByPhone` con 6 status enum (D-15/D-17/D-27) |
| **Configuracion de stages** | Hardcodeado por agente / via prompt | Config-driven UUIDs en `crm_query_tools_config` (D-11/D-13) |
| **Error shape** | `{ message: string }` (flat) | `{ error: { code: string; message?: string } }` (nested — switch sobre `code` sin parsear strings) |
| **Throw vs return** | Throws en algunos paths | NUNCA throws — todo expected outcome es return value (D-07) |
| **LLM intermediario** | Si — agente Haiku con 5 tools | NO — domain layer call directa |
| **Latencia tipica** | 5-25s (Haiku + N tool-calls) | 50-150ms (RTT Supabase) |
| **Caching** | n/a (per-request stateless) | Sin cache (D-19) — cada call llega a DB fresh |
| **Workspace propagation** | Header `x-workspace-id` validado por middleware | `ctx.workspaceId` capturado en closure del factory |

**Implicaciones para agentes:**
- Los agentes que migran de `processReaderMessage(...)` a `createCrmQueryTools(...)` deben switchearse de "leer texto sintetico, parsearlo" a "ramificar sobre `result.status` typed".
- El `not_found` aqui significa "no existe en este workspace" — workspace ya esta capturado, no hay ambiguedad sobre que workspace.
- El error shape nested permite codigo tipo:
  ```typescript
  if (result.status === 'error') {
    if (result.error.code === 'invalid_phone') return askForPhone()
    if (result.error.code === 'config_not_set') return escalateToOperator()
    return retryOrFail()
  }
  ```
  vs el `crm-reader` flat `{ message: 'phone is invalid' }` que requeriria string-matching.

---

## Configuration prerequisite (operator setup)

`getActiveOrderByPhone` REQUIERE configuracion previa por workspace:

1. Operador admin entra a **`/agentes/crm-tools`** (page protegida via session — admin gating defense-in-depth en server action).
2. Selecciona **Pipeline scope** (opcional — empty = todas las pipelines del workspace).
3. Multi-select de **Stages activos** (UUIDs de `pipeline_stages` filtrados por pipeline scope si esta seteado).
4. Click **Guardar** → server action escribe a tabla `crm_query_tools_config` (singleton row con PK `workspace_id`) + `crm_query_tools_active_stages` (junction `workspace_id + stage_id`).
5. Toast `Configuracion guardada` → la siguiente invocacion de `getActiveOrderByPhone` lee la nueva config (D-19 sin cache, refleja inmediato).

**Hasta que un operador haga ese setup**, `getActiveOrderByPhone` retorna `'config_not_set'` con el contacto adjunto. El agente debe distinguir esto de `'no_active_order'`:
- `config_not_set` → escalar al operador / handoff humano / responder "el modulo no esta configurado".
- `no_active_order` → respuesta diferente ("tu ultimo pedido fue entregado, quieres recomprar?" con `last_terminal_order`).

**FK behavior (D-13/D-16):**
- Borrar un `pipeline_stages` → CASCADE en `crm_query_tools_active_stages.stage_id` (la junction row desaparece). Operador no se entera, pero su seleccion ya no incluye ese stage en runtime.
- Borrar el `pipelines` referenciado → SET NULL en `crm_query_tools_config.pipeline_id` (config queda en "todas las pipelines del workspace").
- Verificado en `src/__tests__/integration/crm-query-tools/config-driven.test.ts` con admin client real.

---

## Observability emit contract

Cada tool-call emite **3 eventos** `pipeline_decision:*` con structured payloads. Los eventos van por el `ObservabilityCollector` del agente caller (sin escribir tabla propia — comparten `agent_observability_events`).

| Evento | Cuando | Payload |
|--------|--------|---------|
| `crm_query_invoked` | Inicio de `execute()` (antes de query DB) | `{ queryName, workspaceId, actorAgentId, phoneRedacted: string }` (last 4 digits) |
| `crm_query_completed` | Path success | `{ queryName, workspaceId, actorAgentId, latencyMs, resultStatus }` (resultStatus = el `status` enum del resultado) |
| `crm_query_failed` | Path error | `{ queryName, workspaceId, actorAgentId, latencyMs, errorCode }` |

**PII redaction:** raw phone NUNCA se loggea. Solo `phoneRedacted` (last 4 digits) o hash en pino. Aplica al modulo entero (verificable en `helpers.ts`).

**actorAgentId:** viene de `ctx.invoker` (e.g. `'somnio-recompra-v1'`). Si el caller no lo pasa, queda `undefined` y se loggea como tal — recomendado pasarlo siempre para audit trail.

---

## Env requirements

### Para invocacion runtime (in-process desde agentes)

| Var | Donde se lee | Por que |
|-----|--------------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient()` en domain layer (NO en el modulo crm-query-tools — el modulo usa domain unicamente) | Bypass RLS para queries cross-table |
| `NEXT_PUBLIC_SUPABASE_URL` | `createAdminClient()` | Endpoint Supabase |

El modulo en si **no lee env vars directamente** — todo va por domain layer. Esta limpieza es un BLOCKER invariant verificable via:

```bash
grep -rn "process\\.env\\." src/lib/agents/shared/crm-query-tools/
```

Esperado: 0 matches en archivos de produccion (apariciones validas son solo en `__tests__/`).

### Para integration tests env-gated

| Var | Donde se lee | Acceptable values |
|-----|--------------|-------------------|
| `TEST_WORKSPACE_ID` | `src/__tests__/integration/crm-query-tools/*.test.ts` (3 suites) | UUID valido de un workspace de testing dedicado |
| `TEST_WORKSPACE_ID_2` | `cross-workspace.test.ts` (D-05 isolation) | UUID valido de un SEGUNDO workspace para verificar que el modulo nunca cruza el limite |
| `SUPABASE_SERVICE_ROLE_KEY` | tests integration usan admin client directo para seed/cleanup | Service role key del proyecto |
| `NEXT_PUBLIC_SUPABASE_URL` | tests integration | URL del proyecto Supabase |

Sin estas vars, los tests usan `describe.skipIf(skip)` y producen output limpio `↓ skipped` (NO failure). Pre-condicion para CI verde sin secretos.

### Para Playwright E2E + runner endpoint

| Var | Donde se lee | Acceptable values |
|-----|--------------|-------------------|
| `PLAYWRIGHT_TEST_SECRET` | `src/app/api/test/crm-query-tools/runner/route.ts` (header guard) | Random 32+ chars; el spec pasa esto como `x-test-secret` header |
| `TEST_WORKSPACE_ID` | runner route lee de env (NUNCA del body — T-W5-03 mitigation) | UUID workspace de testing |
| `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` | `e2e/fixtures/auth.ts` (Plan 01) | Credenciales de un usuario admin del workspace de testing |

**Hardening del runner endpoint** (4 layers, ordenadas por attack-surface priority):
1. **NODE_ENV gate FIRST:** `if (process.env.NODE_ENV === 'production') return 404` — incluso si el secret leak en prod.
2. **Header secret:** strict equality `x-test-secret === PLAYWRIGHT_TEST_SECRET`; mismatch → 403.
3. **Workspace from env:** `workspaceId = process.env.TEST_WORKSPACE_ID` — body NUNCA lo carga.
4. **Tool allow-list:** `ALLOWED_TOOLS = Set(5 names)` — request a tool fuera de la lista → 400 con la lista en el error.

Verificable: `grep -c "NODE_ENV === 'production'" src/app/api/test/crm-query-tools/runner/route.ts` = 1.

---

## Migration recipes para los 2 standalones follow-up

Ambos siguen el mismo shape: discuss → research → plan → execute, con cleanup completo (no solo borrar el preload Inngest).

### Recipe A — `crm-query-tools-recompra-integration`

**Objetivo:** migrar `somnio-recompra-v1` de preload Inngest non-blocking + polling a in-loop tool calls.

**Files involucrados:**
- `src/inngest/functions/recompra-preload-context.ts` (DELETE — no se va a llamar mas)
- `src/inngest/route.ts` (remove function from spread)
- `src/lib/agents/somnio-recompra/` (modify — agregar tool calls in-loop)
- `src/lib/agents/somnio-recompra/response-track.ts` (modify — drop polling helper)
- `src/lib/agents/webhook-processor.ts` (modify — remove `inngest.send('recompra/preload-context', ...)` dispatch)
- `CLAUDE.md` scope section de `somnio-recompra-v1` (modify — remove referencias a `processReaderMessage`/`recompra-preload-context.ts`, agregar lista de tools de crm-query-tools)

**Pasos sugeridos (recipe — el plan real lo elabora `/gsd:plan-phase`):**

1. **Identificar todos los puntos en el agente** que actualmente leen las keys legacy:
   ```bash
   grep -rn "_v3:crm_context\\|_v3:crm_context_status" src/lib/agents/somnio-recompra/
   ```
   Cada uno se reemplaza por una llamada a `getContactByPhone` + `getLastOrderByPhone` (segun lo que el path concreto necesite).

2. **Modificar el factory de tools del agente:**
   ```typescript
   // src/lib/agents/somnio-recompra/factory.ts (o donde agregue tools)
   import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

   const queryTools = createCrmQueryTools({
     workspaceId: ctx.workspaceId,
     invoker: 'somnio-recompra-v1',
   })

   return { tools: { ...queryTools, /* ...otras */ } }
   ```

3. **Drop polling helper:** `response-track.ts` actualmente espera `_v3:crm_context_status='ok'|'empty'|'error'` antes de continuar. Eliminar ese wait — ahora el agente arranca sin contexto pre-cargado y llama tools on-demand cuando los necesita.

4. **Drop legacy keys de session_state:** correr SQL update sobre `agent_sessions` activas para limpiar `_v3:crm_context*` de `datos_capturados` (no es estrictamente necesario — keys ya no se leen — pero limpia el state):
   ```sql
   UPDATE agent_sessions
   SET datos_capturados = datos_capturados
       - '_v3:crm_context'
       - '_v3:crm_context_status'
   WHERE workspace_id = '<somnio>'
     AND datos_capturados ?| ARRAY['_v3:crm_context', '_v3:crm_context_status'];
   ```

5. **Eliminar dispatch en `webhook-processor.ts`:** localizar el `inngest.send('recompra/preload-context', ...)` y borrarlo. Ahora el webhook NO pre-llena nada — agente lo hace on-demand.

6. **Eliminar Inngest function:** borrar el archivo `src/inngest/functions/recompra-preload-context.ts` y el spread en `src/inngest/route.ts` que la registra (`recompraPreloadContextFunctions`).

7. **Update CLAUDE.md scope `somnio-recompra-v1`:** reemplazar el bloque "**Consumidores upstream:** Inngest function `recompra-preload-context`..." por:
   ```markdown
   - **Tools registradas (read-only):** `getContactByPhone`, `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone` (opcional segun branches), `getOrderById` — via `createCrmQueryTools({ workspaceId, invoker: 'somnio-recompra-v1' })`. Modulo: `src/lib/agents/shared/crm-query-tools/`.
   ```
   Y borrar las referencias a `processReaderMessage` + dispatch Inngest.

8. **Configuracion del workspace Somnio:** verificar que ya tiene config en `crm_query_tools_config` ANTES de ship — sino `getActiveOrderByPhone` (si se usa en alguna branch) retorna `config_not_set`. El integration plan debe incluir un step de verificacion.

9. **Tests:** unit tests del agente deberian usar mocks del factory `createCrmQueryTools` (no mockear `processReaderMessage`).

10. **Feature flag rollback opcional:** `platform_config.somnio_recompra_crm_reader_enabled` queda obsoleto post-migracion. Borrar la row + cleanup en code que la lee. (NO es bloqueante para el ship.)

11. **Smoke test produccion:** enviar mensaje real al numero somnio-recompra-v1 en preview/staging, verificar en logs que las tools se llaman in-loop (no hay dispatch Inngest), turno termina exitoso.

12. **Push final + LEARNINGS.md** del standalone follow-up.

### Recipe B — `crm-query-tools-pw-confirmation-integration`

**Objetivo:** simplificar `pw-confirmation-preload-and-invoke.ts` (BLOCKING 2-step) — el agente ya no necesita `_v3:active_order` precargado, llama `getActiveOrderByPhone` on-demand.

**Files involucrados:**
- `src/inngest/functions/pw-confirmation-preload-and-invoke.ts` (modify — drop step 1 reader preload, mantiene step 2 agent invocation, opcionalmente refactorizar a invocacion sincrona si toda la latencia ya viene del agente)
- `src/lib/agents/somnio-pw-confirmation/state.ts` (modify — drop `extractActiveOrder()` helper, swap a tool call)
- `src/lib/agents/somnio-pw-confirmation/state-machine.ts` (modify — el guard que lee `_v3:active_order` ahora llama tool)
- `src/lib/agents/somnio-pw-confirmation/prompts.ts` (modify — drop instruccion de "lee `_v3:active_order` JSON")
- `CLAUDE.md` scope section de `somnio-sales-v3-pw-confirmation` (modify analogo a recipe A)

**Pasos sugeridos:**

1. **Identificar puntos donde `_v3:active_order` se lee:**
   ```bash
   grep -rn "_v3:active_order\\|extractActiveOrder" src/lib/agents/somnio-pw-confirmation/
   ```

2. **Decision arquitectonica clave:** la funcion Inngest BLOCKING 2-step (`pw-confirmation-preload-and-invoke.ts`) se construyo porque el agente no podia funcionar sin contexto pre-cargado (el state machine empieza en `'awaiting_confirmation'` que asume pedido conocido). Post-migracion:
   - **Opcion 1 (recomendada):** drop step 1 entirely. El agente arranca, llama `getActiveOrderByPhone({ phone })` como primera tool en su loop AI SDK. Si retorna `not_found`/`no_orders`/`config_not_set` → state machine transiciona a `'error_no_active_order'` con su template apropiado. La funcion Inngest queda simplemente como dispatch (1 step) — o mejor: webhook llama runner directamente (sin Inngest).
   - **Opcion 2:** mantener Inngest pero sin step 1 — solo step 2 invoke-agent. Aporta retry logic + concurrency limit per-sessionId (deduplicacion de mensajes en <5s).

3. **Migrar state machine:** el initial state `'awaiting_confirmation'` cambia para incluir un `'loading_order'` previo donde el agente aun no tiene contexto. El guard de "si" del cliente NO se evalua hasta que `getActiveOrderByPhone` termine. Alternativa: pre-call la tool antes de generateText (manual outside loop), mantener state machine inicial igual.

4. **Drop legacy keys:** `_v3:active_order`, `_v3:crm_context`, `_v3:crm_context_status` de `session_state.datos_capturados` (SQL update analogo a recipe A).

5. **Eliminar `extractActiveOrderJson` helper** (50+ lines defensivos en `pw-confirmation-preload-and-invoke.ts`) — todo eso lo reemplaza la tool call a `getActiveOrderByPhone` que devuelve `OrderDetail` directamente sin reparse.

6. **Update `prompts.ts`:** el system prompt actualmente instruye al agente "lee `_v3:active_order` para conocer el pedido". Reemplazar por "llama `getActiveOrderByPhone` al inicio del turno para obtener el pedido activo del cliente".

7. **Update CLAUDE.md scope `somnio-sales-v3-pw-confirmation`:** swap el bloque `**Consumidores upstream:** Inngest function pw-confirmation-preload-and-invoke (...)` por una version simplificada que solo mencione tools. Y borrar referencias a `processReaderMessage`.

8. **Configuracion Somnio:** `getActiveOrderByPhone` necesita config — verificar que `crm_query_tools_config` para Somnio incluye los stages `'NUEVO PAG WEB'`, `'FALTA INFO'`, `'FALTA CONFIRMAR'` como activos. Si no, configurar via `/agentes/crm-tools` antes del ship.

9. **Tests:** unit tests del state machine + agente con mock del factory crm-query-tools.

10. **Smoke test produccion:** activar la regla en `routing_rules` (estaba inactiva post-ship 2026-04-28 — D-02), enviar mensaje desde un pedido stage `NUEVO PAG WEB` real, verificar que el agente responde correctamente.

11. **Push final + LEARNINGS.md** del standalone follow-up.

---

## CLAUDE.md scope template (snippet para los follow-ups)

Cuando los standalones follow-up actualicen CLAUDE.md, swappear los bloques `Consumidores upstream` por:

```markdown
- **Tools registradas (read-only — modulo `src/lib/agents/shared/crm-query-tools/`):**
  - `getContactByPhone` — contacto + tags + custom_fields + duplicates flag
  - `getLastOrderByPhone` — ultimo pedido del contacto + items + direccion
  - `getOrdersByPhone` — historial paginado
  - `getActiveOrderByPhone` — pedido en stage activo (config-driven; retorna `config_not_set` si workspace nunca configuro stages)
  - `getOrderById` — pedido especifico con items + shipping
  Via `createCrmQueryTools({ workspaceId, invoker: '<agent-id>' })`.
- **Configuracion prerequisita:** operador admin debe escoger pipeline scope + stages activos en `/agentes/crm-tools` antes del primer turno productivo. Sin config, `getActiveOrderByPhone` retorna `config_not_set` (vs `no_active_order`).
```

Y eliminar las referencias historicas a `processReaderMessage`, `recompra-preload-context.ts`, o `pw-confirmation-preload-and-invoke.ts` step 1.

---

## Backlog items (del propio standalone — opcional para los follow-ups)

Items con disposicion `accept` en el threat model — recomendados de revisitar despues:

1. **Optimistic concurrency en `updateCrmQueryToolsConfig`** — actual: last-write-wins. Riesgo: dos operadores admin guardando simultaneamente sobreescriben uno al otro. Mitigacion: agregar `version` column + WHERE version=? en UPDATE.
2. **Defense-in-depth: `is_workspace_admin` server-side check en server action body** — actual: solo gate via UI session. Bajo costo, alto valor para audit.
3. **Zod cap `activeStageIds.max(500)`** — actual: array sin tope. Riesgo: payload enorme. Workspaces reales tienen <50 stages activos.
4. **Cross-workspace stage-id validation en server action** — actual: confiamos en que UI solo muestra stages del workspace. Defense-in-depth: validar en server que cada `stage_id` enviado pertenece al workspace.
5. **5-30s LRU cache para config reads** — actual: D-19 firme sin cache. Si latencia se vuelve issue (medible via observability), considerar cache TTL micro.
6. **Hoist crm-reader types to shared module** — si las shapes de `OrderDetail` / `ContactDetail` divergen futuras, considerar consolidacion. Deferred salvo dolor concreto.
7. **`getOrdersByEmail`, `getContactByCustomField`** — solo cuando un agente futuro lo requiera.
8. **Override per-agente de la config (D-12 alternativa rechazada)** — solo si un agente futuro necesita stages distintos al default del workspace.

---

## Known divergences from RESEARCH.md / plan (deviaciones documentadas)

- **Plan 05** uso un MultiSelect inline (`MultiSelectStages.tsx`) en vez de refactorizar el componente del routing-editor — decision para evitar standalone refactor cross-feature. Componente queda en `src/app/(dashboard)/agentes/crm-tools/_components/`.
- **Plan 06** no genero el commit "wrap-up" final que el plan literal pedia (Task 6.7 step 6) — los 6 task commits atomicos cubren todo. Documentado en `06-SUMMARY.md` "Decisions outside plan literal".
- **Plan 07 Tasks 7.1-7.3** (este plan) requirieron orchestrator-level file ops porque subagents no pueden escribir a `.claude/skills/` ni `.claude/rules/` (sandbox restriction). Patron documentado en `LEARNINGS.md` para futuros plans que toquen esos paths.

---

## References

- **PLAN files:** `01-PLAN.md` ... `07-PLAN.md` en `.planning/standalone/crm-query-tools/`
- **SUMMARY files:** `01-SUMMARY.md` ... `06-SUMMARY.md` (`07-SUMMARY.md` cierra el ship)
- **Project skill (living):** `.claude/skills/crm-query-tools.md`
- **Cross-reference rules:** `.claude/rules/agent-scope.md` (Module Scope: crm-query-tools)
- **CLAUDE.md scope:** seccion "Module Scope: crm-query-tools" (sub-seccion de Scopes por Agente)
- **LEARNINGS:** `.planning/standalone/crm-query-tools/LEARNINGS.md`
- **MEMORY entry pendiente:** se actualiza tras completar los 2 standalones follow-up (no en este standalone)
- **Source modulo:** `src/lib/agents/shared/crm-query-tools/{index,types,contacts,orders,helpers}.ts`
- **Domain layer:** `src/lib/domain/crm-query-tools-config.ts` + `src/lib/domain/contacts.ts` + `src/lib/domain/orders.ts`
- **Migration:** `supabase/migrations/20260429172905_crm_query_tools_config.sql`
- **UI:** `src/app/(dashboard)/agentes/crm-tools/{page,_actions,_components/{ConfigEditor,MultiSelectStages}}.tsx`
- **Test runner endpoint:** `src/app/api/test/crm-query-tools/runner/route.ts`
- **Integration tests:** `src/__tests__/integration/crm-query-tools/{cross-workspace,config-driven,duplicates}.test.ts`
- **Playwright spec:** `e2e/crm-query-tools.spec.ts`
- **Seed fixture:** `e2e/fixtures/seed.ts`
