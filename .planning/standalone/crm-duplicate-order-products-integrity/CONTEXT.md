# Standalone: CRM Duplicate Order Products Integrity - Context

**Gathered:** 2026-05-26
**Status:** Ready for research + planning
**Origin:** Bug productivo confirmado el 2026-05-25 — caso Doralba Echavarria (workspace Somnio). Order Standard $119.900 (sku=002 "2 X ELIXIR") fue duplicada automáticamente al pipeline Logística por la automation `Tag C confirmado` (`0683baa0-30d3-49ec-83fa-d3e112bd6416`) usando `duplicateOrder` de `src/lib/domain/orders.ts`. La duplicada quedó SIN productos (el INSERT silenciosamente no se materializó). Un operador (sergiosomnio@gmail.com) la editó manualmente y agregó 3× ELIXIR $169.900 (producto incorrecto). El cliente recibió SMS+WhatsApp con valor erróneo y guía Coordinadora `53180511308` generada por $169.900.

**Audit retroactivo 60 días** sobre la misma automation reveló **52 mismatches en 825 ejecuciones (6.3%)**:
- **41** destinations vacías (productos NUNCA se copiaron)
- **11** destinations editadas a mano por operadores (probablemente "completando" datos faltantes con datos incorrectos)
- **35 de 41** son de abril 2026 (spike — coincide con deploy de `crm-stage-integrity` que introdujo concurrencia per-orderId)

**Causa raíz confirmada experimentalmente:** `src/lib/domain/orders.ts:959` ejecuta `await supabase.from('order_products').insert(productsToInsert)` **sin destructurar/chequear `{error}`**. Los 4 modos de fallo (FK 23503, CHECK 23514, NOT NULL 23502, FK order_id race) son detectables (retornan `error.code` + `status: 400/409`) pero el código los descarta silenciosamente. La automation reporta `status: success, duration_ms: 609` y `error_message: null`. Cero rastro.

<domain>
## Phase Boundary

Fix forward del bug silencioso en `duplicateOrder` (`src/lib/domain/orders.ts`). Cuando el INSERT de `order_products` falla:

1. **Capturar el error** del cliente Supabase (no descartar)
2. **NO hacer rollback** de la order destino — queda creada pero vacía (decisión D-01)
3. **Persistir el error** en `orders.custom_fields.duplicate_error` (JSONB, sin migración nueva)
4. **Retornar `success: false`** desde `duplicateOrder` con el error code y mensaje del Postgres, para que `automation_executions.actions_log[].status` registre `'failed'` y `error_message` quede populado
5. **Surface visual** en UI Kanban (`/crm/pedidos`): badge rojo en la card cuando `custom_fields.duplicate_error` exists, con popover mostrando los productos del source + link a la source order
6. **Resolución manual** via botón "Marcar resuelto" que limpia el flag de `custom_fields`

**En scope:**
- Fix en `duplicateOrder` (orders.ts:835-955)
- Schema: usar `orders.custom_fields.duplicate_error` (JSONB existente — sin migración nueva)
- UI: badge + popover + botón "Marcar resuelto" en card del Kanban
- Tests: unit (mock domain con 4 modos de fallo) + integration (DB real con orders.contact_id válido + product_id inválido para forzar FK violation)
- Server action: `clearOrderDuplicateError(orderId)` para el botón de la UI

**Fuera de scope (decisiones explícitas del usuario):**
- ❌ **NO retry transient** (D-02: fail fast)
- ❌ **NO rollback de la order destino** (D-01: mantener vacía)
- ❌ **NO backfill de los 41 casos históricos** (D-03: solo fix forward)
- ❌ **NO resolver el caso Doralba en código** (D-04: equipo lo arregla manualmente con la cliente + cancela/regenera guía Coordinadora)
- ❌ **NO tocar `recompraOrder`** ni otros callers del patrón (scope creep — auditarlos en standalone futuro si surge necesidad)
- ❌ **NO alerta operacional Slack/email** (el error queda en `automation_executions.error_message` + visible en Kanban)
- ❌ **NO arreglar bug colateral de timezone en `order_stage_history.changed_at`** (deferido — ver Deferred Ideas)
- ❌ **NO migración DB nueva** — `custom_fields` JSONB ya existe

</domain>

<decisions>
## Implementation Decisions

### Pre-discussion (locked antes de discuss-phase)

- **D-pre-01:** Fix vive en `src/lib/domain/orders.ts` (función `duplicateOrder`, líneas 835-955). Mismo archivo del bug. No mover lógica.
- **D-pre-02:** Tests obligatorios cubriendo los 4 modos de fallo experimentalmente confirmados:
  - FK violation `product_id` (code 23503, status 409) — `product_id` no existe en `products`
  - FK violation `order_id` (code 23503, status 409) — race condition donde la order destino fue borrada antes del INSERT
  - CHECK violation `quantity > 0` (code 23514, status 400)
  - NOT NULL violation `sku` (code 23502, status 400)
- **D-pre-03:** Regla 3 absoluta — la lógica del fix vive completamente dentro de `src/lib/domain/orders.ts`. Server action de "marcar resuelto" llama domain layer; UI llama server action.
- **D-pre-04:** Scope acotado a `duplicateOrder`. NO tocar `crm-writer`, NO tocar `crm-mutation-tools`, NO tocar `recompraOrder` (aunque podría tener el mismo patrón — auditarlo en standalone futuro si aplica).
- **D-pre-05:** SIN feature flag — el fix es backwards-compatible. El comportamiento actual (success silencioso con order vacía) era un bug, nadie depende de él. El nuevo comportamiento (success false + error visible) es estrictamente mejor.
- **D-pre-06:** Storage del error en `orders.custom_fields.duplicate_error` (JSONB existente). **NO migración nueva** — el campo `custom_fields` ya está en el schema (línea 12 de la migración original 20260129000003).
- **D-pre-07:** Branching strategy `none` (work directly on main). Push después de cada plan vía `git push origin main`.

### Rollback strategy (de discuss-phase)

- **D-01:** **Mantener vacía + marcar error en UI**. Cuando el INSERT de productos falla:
  - La order destino YA fue creada (línea 893 de orders.ts) — **NO se borra**.
  - Se persiste en `orders.custom_fields.duplicate_error` un objeto:
    ```typescript
    {
      duplicate_error: {
        errorCode: string,          // pg code: '23503', '23514', '23502', etc.
        errorMessage: string,       // mensaje completo de Postgres
        failedAt: string,           // ISO timestamp
        sourceOrderId: string,      // ya está en orders.source_order_id pero duplicamos por accesibilidad
        attemptedProducts: Array<{  // snapshot de lo que se intentó insertar
          sku: string,
          title: string,
          unit_price: number,
          quantity: number,
        }>,
      }
    }
    ```
  - `duplicateOrder` retorna `{ success: false, error: 'Error al copiar productos: ${errorCode} - ${errorMessage}' }`.
  - El `executeDuplicateOrder` wrapper (action-executor.ts:646) ya hace `throw new Error(result.error)` si `!success`, así que la automation execution registra `actions_log[i].status: 'failed'` + `error_message` populado.
- **Razón D-01:** Rollback total perdería la trazabilidad (no quedaría rastro de que algo pasó). Mantener huérfana visible permite al operador completar manualmente sin perder la conexión al source via `source_order_id`.

### Retry strategy (de discuss-phase)

- **D-02:** **Sin retry — fail fast**. Cualquier error del INSERT mata la operación inmediatamente y persiste el error.
- **Razón D-02:** Simplicidad + predictibilidad. Si el error es transient (network blip), el operador puede reintentar manualmente. Si es lógico (FK, CHECK, NOT NULL), retry no ayudaría. La complejidad de discriminar transient vs lógico no compensa el beneficio marginal.

### Backfill retroactivo (de discuss-phase)

- **D-03:** **Skip backfill — solo fix forward**. Las 41 orders huérfanas históricas (35 de abril + 5 de mayo + 1 de marzo) NO se tocan en este standalone.
- **Razón D-03:** El equipo Somnio ya las resolvió operativamente (orders ya completaron su ciclo de entrega). Auto-copiar productos del source podría sobrescribir decisiones operacionales legítimas. El reporte de los 41 casos queda como audit pero sin auto-fix.

### Caso Doralba específico (de discuss-phase)

- **D-04:** **No se incluye en el standalone**. El equipo Somnio resolverá manualmente con Doralba (llamada/Whatsapp para reconciliar valor + cancelar/regenerar guía Coordinadora `53180511308`).
- **Razón D-04:** Es un caso operacional (decisión comercial con la cliente), no técnico. El standalone solo previene futuros casos.

### UI: limpieza del flag (de discuss-phase)

- **D-05:** **Manual — botón "Marcar resuelto"** en la card del Kanban. El operador completa la order (agrega productos vía UI normal) y luego clickea el botón para limpiar `custom_fields.duplicate_error`.
- **Server action:** `clearOrderDuplicateError(orderId)` en `src/app/actions/orders.ts` (o equivalente) que llama `domain.updateOrderCustomFields(orderId, { duplicate_error: null })`. La eliminación del flag se hace borrando la key del JSONB (vs setear a null).
- **Razón D-05:** Auto-clear al agregar el 1er producto sería tentador pero peligroso — un operador podría agregar productos erróneos sin querer y perder el contexto del error. Botón explícito da control + visibilidad: el operador VERIFICA que los productos son correctos antes de limpiar el flag.

### UI: información en el badge (de discuss-phase)

- **D-06:** **Productos + link al source order (sin botón "Copiar ahora")**. El popover del badge muestra:
  - Header: "⚠ Productos no se copiaron al duplicar"
  - Timestamp del fallo
  - Error code + mensaje (truncado a 80 chars)
  - Lista de productos que el source tenía: `[quantity]× [title] — $[unit_price]`
  - Link "Ver pedido origen →" que navega al `source_order_id` en el otro pipeline (Standard)
  - Botón "Marcar resuelto" (D-05)
- **Razón D-06:** "Copiar ahora" sería un attractive nuisance — si los productos del source eran inválidos (la razón del fallo inicial), el botón seguiría fallando. El operador debe entender el contexto antes de actuar. Link al source + lista visible es suficiente soporte.

### Claude's Discretion

- Estructura interna del fix en `duplicateOrder` (try/catch, flujo de control, naming de helpers).
- Diseño visual exacto del badge en la card del Kanban (tamaño, color exacto, icono — debe seguir convenciones del editorial inbox v2 / dashboard tokens).
- Estructura del popover (Radix Tooltip vs HoverCard vs Popover — escoger el que ya use el card).
- Nombre exacto de la server action y del wrapper en domain (`updateOrderCustomFields` vs algo más específico).
- Si el reporte CSV de los 41 casos históricos se commitea al repo o se entrega out-of-band (research decide).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source code del bug
- `src/lib/domain/orders.ts:835-955` — Función `duplicateOrder` completa (origen del bug en línea 959).
- `src/lib/domain/orders.ts:1067-...` — Función `recompraOrder` (referencia: usa `duplicateOrder` internamente — VERIFICAR si nuestro fix la afecta sin querer).
- `src/lib/automations/action-executor.ts:646-695` — Wrapper `executeDuplicateOrder` (consumer crítico — verifica que el `throw new Error(result.error)` propaga correctamente al `automation_executions.error_message`).
- `src/lib/automations/action-executor.ts:182` — Dispatch del action_type `duplicate_order`.

### Schema DB
- `supabase/migrations/20260129000003_orders_foundation.sql:CREATE TABLE orders` — Schema base de `orders` (campo `custom_fields JSONB DEFAULT '{}'`).
- `supabase/migrations/20260129000003_orders_foundation.sql:CREATE TABLE order_products` — Schema de `order_products` (incluye `quantity CHECK > 0`, `sku NOT NULL`, FK a `products` y `orders`).
- `supabase/migrations/20260129000003_orders_foundation.sql:CREATE TRIGGER order_products_update_total` — Trigger que recalcula `orders.total_value` después de cada INSERT/UPDATE/DELETE en `order_products` (relevante para el comportamiento esperado tras el fix).

### Evidencia del audit
- `scripts/debug-doralba-audit-historic.mjs` — Script que generó el audit de 60d (825 ejecuciones, 52 mismatches).
- `scripts/debug-doralba-pattern.mjs` — Análisis de patrones de los 41 casos vacíos (distribución temporal, deltas, SKU patterns).
- `scripts/debug-doralba-silent-fail.mjs` — Reproducción experimental de los 4 modos de fallo (FK, CHECK, NOT NULL).
- `scripts/debug-doralba-reproduce.mjs` — Prueba positiva (insert correcto funciona — confirma que el bug es el missing error-check, no el INSERT en sí).

### Convenciones del proyecto
- `CLAUDE.md` — Reglas 1-6, scopes por agente (anti-creep).
- `.planning/standalone/crm-mutation-tools/CONTEXT.md` §`<decisions>` — Patrón de status enum + observability emit (referencia para si emitimos algún evento adicional aquí).
- `.planning/standalone/crm-stage-integrity/` — Standalone que introdujo concurrencia per-orderId en abril (posible factor contributing al spike de 35 casos en abril). Leer para entender el contexto de la concurrencia automation runner.

### UI Kanban
- `src/app/(authenticated)/crm/pedidos/**` — Implementación actual del Kanban (verificar dónde renderizar el badge).
- `.planning/standalone/ui-redesign-conversaciones/` (shipped 2026-04-22) — Tokens y patrones visuales editorial inbox v2 que el badge debe seguir si el workspace tiene `ui_inbox_v2.enabled=true`.
- `.planning/standalone/ui-redesign-dashboard-retrofit/` — Patrón R-RETRO-01..05 para mantener consistencia visual.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`custom_fields JSONB`** en tabla `orders` — Ya existe, sin migración requerida. Otros standalones (Bigin migration) ya escriben aquí (`bigin_id`, `bigin_callbell`). El patrón es: leer JSONB completo, hacer merge, escribir completo.
- **`source_order_id`** en tabla `orders` — Ya existe (agregada en migración `20260213000000_automations.sql`). El link al source ya está disponible para el badge UI sin necesidad de duplicar.
- **`automation_executions.actions_log`** — Ya soporta `status: 'failed'` + `error_message`. El wrapper `executeDuplicateOrder` ya `throw`ea si `!result.success`. Solo necesitamos hacer que `duplicateOrder` retorne `success: false` cuando el INSERT falle — el resto del pipeline ya funciona.
- **Domain pattern `updateOrder`** (existe en orders.ts) — Para implementar `clearOrderDuplicateError`, podemos extender `updateOrder` con un nuevo param opcional `clearDuplicateError?: boolean`, o crear un wrapper helper `clearOrderDuplicateError(orderId)`.

### Established Patterns

- **Regla 3**: domain layer único responsable de mutaciones. El fix vive 100% en domain — la server action solo es wrapper que llama domain.
- **JSONB merge pattern**: para evitar race conditions al escribir `custom_fields`, hacer `SELECT custom_fields → spread → set new key → UPDATE` en una sola transacción o usar `jsonb_set()` para sobrescribir solo la key específica.
- **PostgrestError shape**: cuando un INSERT falla, Supabase JS v2 retorna `{ data: null, error: { code, message, details, hint } }`. El `code` es el SQLSTATE (`23503`, etc.).
- **Trigger update_order_total**: si el INSERT de productos NO ocurre, `orders.total_value` queda en 0 (default). Esto es OK con D-01 — la card en Kanban mostrará "$0" + badge rojo, lo cual es señal visual clara de "esta order está incompleta".

### Integration Points

- **`executeDuplicateOrder`** (`src/lib/automations/action-executor.ts:646`): consumer crítico. Después del fix, si `duplicateOrder` retorna `{success: false}`, el wrapper hace `throw new Error()` que propaga al `automation_executions.actions_log[i] = { status: 'failed', result: undefined, error: ... }`. Verificar que el shape de `actions_log` permite `error` cuando `status='failed'` (debería — ver schema `actions_log JSONB`).
- **UI Kanban card** (`src/app/(authenticated)/crm/pedidos/...`): nuevo badge condicional `order.custom_fields?.duplicate_error` truthy → render badge rojo. El popover Radix puede ser Tooltip/HoverCard/Popover según convención existente.
- **Server action** (`src/app/actions/orders.ts` o equivalente): nueva `clearOrderDuplicateError(orderId)` que valida auth + workspace ownership + llama domain helper.
- **revalidatePath(`/crm/pedidos`)**: necesario tras `clearOrderDuplicateError` para refrescar el Kanban.

</code_context>

<specifics>
## Specific Ideas

- **Caso Doralba como evidencia narrativa** en LEARNINGS.md (al cerrar el standalone): documentar timeline completo (orders, users, automation, error) como caso canónico para futuros standalones similares.
- **Estructura del JSONB `duplicate_error`** debe ser estable y versionada implícitamente. Si en futuro queremos cambiar el shape, agregar `version: 1` para permitir migration.
- **Texto del badge:** "⚠ Sin productos" o "⚠ Error de duplicación" — research decide la wording más clara para operadores Somnio.
- **El botón "Marcar resuelto"** debe pedir confirmación (dialog modal) — accidentalmente clickearlo perdería el contexto del error.

</specifics>

<deferred>
## Deferred Ideas

### Bug colateral de timezone en `order_stage_history`
**Encontrado durante el debug**: la columna `changed_at` de `order_stage_history` guarda hora local Bogotá pero etiquetada como `+00:00` (offset UTC). Esto causa que reportes consuman timestamps con 5h de desfase. La causa raíz es `DEFAULT timezone('America/Bogota', NOW())` en columna `timestamptz` (la función retorna `timestamp WITHOUT time zone` que Postgres luego asume UTC al insertar).

**Por qué deferido:** scope distinto (afecta a `order_stage_history`, no `order_products`). Requiere migración + backfill de timestamps históricos. Standalone aparte recomendado: `crm-timezone-stage-history-fix`.

### Auditoría sistémica de patrones similares `await ... insert(...)` sin error check
**Encontrado durante el debug**: `duplicateOrder` no es el único caller potencial del patrón vulnerable. `recompraOrder` (líneas 1067+) usa `duplicateOrder` internamente — podría heredar el bug pero el path es indirecto. Posiblemente hay más en el codebase.

**Por qué deferido:** auditar todo `src/lib/domain/**` requiere su propio scope. Standalone aparte: `domain-error-handling-audit`. Por ahora, el fix de `duplicateOrder` mitiga el caso productivo conocido.

### Alerta operacional en tiempo real (Slack/email)
**Considerado**: emitir Inngest event `order.duplicate_failed` que dispare notificación a canal interno. Usuario decidió que con el badge en UI + `automation_executions.error_message` es suficiente.

**Por qué deferido:** se puede agregar después si surge volumen suficiente para justificar la complejidad. Standalone futuro si aplica: `operational-alerts-duplicate-failures`.

### Backfill retroactivo de los 41 casos vacíos
**Considerado**: script idempotente que copia productos del source si `dst.updated_at == dst.created_at`. Usuario decidió skip — esas orders ya completaron ciclo operacional.

**Por qué deferido:** si futuro surge necesidad de reconciliar audit/reportes históricos, el script se puede escribir en menos de 1 día. Por ahora innecesario.

### Caso Doralba — corrección en código de la order $169.900
**Decidido fuera de scope**: el equipo Somnio resuelve con la cliente. Si requiere intervención técnica (revertir `total_value`, cambiar productos en DB, cancelar guía Coordinadora vía API), se hace ad-hoc fuera de standalone.

</deferred>

---

*Standalone: crm-duplicate-order-products-integrity*
*Context gathered: 2026-05-26*
