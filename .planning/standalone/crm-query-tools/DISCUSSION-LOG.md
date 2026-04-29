# Standalone: CRM Query Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Standalone:** crm-query-tools
**Areas discussed:** Error handling + duplicados, Definición de 'pedido activo', Output schema + cache, Cleanup Inngest + observability

---

## Pre-discussion (capturada en conversación previa antes de invocar /gsd-discuss-phase)

| Decision | Resolution |
|----------|------------|
| Crm-reader, ¿reemplazar o coexistir? | **Coexistir** — crm-reader sigue vivo para otros usos |
| ¿Cuántas tools iniciales? | **5**: getContactByPhone, getLastOrderByPhone, getOrdersByPhone, getActiveOrderByPhone, getOrderById |
| Reemplazo del preload Inngest | Sí, pero cleanup deferido a follow-ups |
| Estructura del módulo | **Compartido** en `src/lib/agents/shared/crm-query-tools/` |
| Workspace isolation | Vía `ctx.workspaceId`, phone del input |
| Scope CLAUDE.md de agentes Somnio | Actualizar (deferido a follow-ups) |

---

## Área 1: Error handling + duplicados

### Forma del resultado de las tools cuando hay error o not_found

| Option | Description | Selected |
|--------|-------------|----------|
| Typed result espejo crm-reader | `{status:'found'\|'not_found'\|'error', data?, error?}`. Agente conoce el shape. | ✓ |
| Throw exceptions | Errores tipados, AI SDK los captura. Idiomático TS pero rompe turn si no se maneja. | |
| Null para not_found, throw para error | Simple. Pierde campo `reason` del not_found. | |

**User's choice:** Typed result espejo crm-reader (Recommended)
**Notes:** Consistente con crm-reader/crm-writer existentes. Evita decisiones de manejo dispar entre tools.

### Si 2+ contactos comparten el mismo phone

| Option | Description | Selected |
|--------|-------------|----------|
| Primero por created_at DESC + flag | Retorna más reciente + `duplicates_count > 0` / `duplicates: [otherIds]`. Pragmático. | ✓ |
| Status 'multiple_matches' typed | `{status:'multiple_matches', candidates:[...]}` y agente decide. Más explícito. | |
| El que tenga último pedido más reciente | Heurística: contacto activo. Query más complicada. | |

**User's choice:** Primero por created_at DESC + flag (Recommended)

### Normalización del phone

| Option | Description | Selected |
|--------|-------------|----------|
| Tool normaliza a E.164 internamente | Acepta cualquier formato, normaliza con helper existente. Resilencia máxima. | ✓ |
| Agent pasa E.164 exacto | Tool valida estricto. Disciplina del caller. | |
| Tool intenta múltiples variantes | N queries por intento. Overhead. | |

**User's choice:** Tool normaliza a E.164 internamente (Recommended)

### Si contacto existe pero sin pedidos

| Option | Description | Selected |
|--------|-------------|----------|
| Status 'no_orders' + contact info | Distingue 'no existe' vs 'existe sin historial'. Útil para saludo personalizado. | ✓ |
| Status 'not_found' uniforme | Más simple, pierde info útil. | |
| Null | Pierde la distinción. | |

**User's choice:** Status 'no_orders' + contact info (Recommended)

---

## Área 2: Definición de 'pedido activo'

### Cómo define la tool qué stages cuentan como 'activo'

| Option | Description | Selected |
|--------|-------------|----------|
| Param `excludeStageNames` opcional | Default `['ENTREGADO','CANCELADO','DEVOLUCION','PERDIDO']`. Caller customiza. Heurística por nombre. | |
| Columna `is_terminal` en pipeline_stages | Migración + UI para marcar. Más limpio semánticamente. | |
| Param `includeStageIds` (whitelist) | Whitelist explícita de UUIDs. Frágil. | |
| **(User free text)** Configuración persistente UI en /agentes | El operador configura qué stages cuentan como activos en una sección nueva en /agentes. Tool lee de DB. | ✓ |

**User's choice (free text):** "en agentes agregar un apartado para la configuracion de estas tools. en este apartado se pueden escoger estos stages que definen un peidod como activo o no"
**Notes:** Pivot importante — config persistente per-workspace via UI, no hardcoded ni param-based. Disparó sub-discusión sobre granularidad/ruta UI/almacenamiento de stages.

### Si 2+ pedidos en stages activos simultáneamente

| Option | Description | Selected |
|--------|-------------|----------|
| Más reciente por created_at + flag | Coherente con D-08 contactos duplicados. `other_active_orders_count > 0`. | ✓ |
| Array de todos los activos | Rompe semántica 'active' singular. | |
| Status 'multiple_active' typed | Forces agente a manejar. | |

**User's choice:** Más reciente por created_at + flag (Recommended)

### Pipeline scope

| Option | Description | Selected |
|--------|-------------|----------|
| Todas por default + param pipelineId opcional | Búsqueda amplia, override fino. | |
| Solo pipeline 'default' del workspace | Requiere concepto 'default pipeline' inexistente hoy. | |
| Caller siempre debe especificar pipelineId | Acopla agente a UUID de pipeline. | |
| **(User free text)** Configurable en /agentes | Pipeline scope se selecciona desde la misma UI de config. | ✓ |

**User's choice (free text):** "en las configuraciones que te dije se puede escoger"
**Notes:** Pipeline scope se decide desde UI, mismo lugar que stages activos. Fold en config table.

### Si NO hay pedido activo

| Option | Description | Selected |
|--------|-------------|----------|
| Status 'no_active_order' + last_terminal_order opcional | Útil para post-venta. Una sola call. | ✓ |
| Status 'no_active_order' simple | Más simple, agente pide history aparte si necesita. | |
| Fallback al último pedido cualquiera | Frágil, viola semántica. | |

**User's choice:** Status 'no_active_order' + last_terminal_order opcional (Recommended)

### Sub-discusión: granularidad de la config

| Option | Description | Selected |
|--------|-------------|----------|
| Por workspace (compartida) | Una config por workspace. Simple. | ✓ |
| Por agente registrado en routing | Cada agent_id su config. Más UI/tablas. Sobre-ingeniería hoy. | |
| Por workspace + override por agente | Default + override. Más complejo. | |

**User's choice:** Por workspace (compartida) (Recommended)

### Sub-discusión: ubicación UI

| Option | Description | Selected |
|--------|-------------|----------|
| Nueva página `/agentes/configuracion` | Página dedicada. Sidebar item nuevo. | |
| Sección en `/configuracion` | Mezcla con WhatsApp/canales. | |
| Tab en `/agentes` (página existente) | Tab adicional. | |
| **(User free text)** Junto con router/auditoria en /agentes | Sección/tab nuevo dentro de /agentes. | ✓ |

**User's choice (free text):** "Agentes tiene 'router','auditoria',x ahi mismo"
**Notes:** UI vive como sección nueva en /agentes alongside existing router y auditoría sections. Slug exacto deferido al planner.

### Sub-discusión: almacenamiento de stages

| Option | Description | Selected |
|--------|-------------|----------|
| UUIDs de pipeline_stages | Stable contra renames. UI muestra nombre, guarda ID. | ✓ |
| Nombres en MAYUSCULA | Frágil con renames. Legible debug. | |
| Ambos (UUID primary, nombre cached) | Redundante. | |

**User's choice:** UUIDs de pipeline_stages (Recommended)

### Sub-discusión: scope timing

| Option | Description | Selected |
|--------|-------------|----------|
| Todo en este standalone | Migration + tools + UI + integración + cleanup, todo junto. | ✓ (luego revertido) |
| Tools primero con config sembrada SQL, UI después | Tools ship rápido, UI follow-up. | |
| Standalone solo tools, NO Inngest cleanup. UI + cleanup después | Decoupling fuerte, riesgo tools sin uso. | |

**User's choice:** Todo en este standalone (Recommended) — pero más adelante en Área 4 el usuario revisó y decidió excluir la integración a agentes Somnio del standalone.

---

## Área 3: Output schema + cache

### Shape del JSON

| Option | Description | Selected |
|--------|-------------|----------|
| Espejo crm-reader | Reusan `OrderDetail`/`ContactDetail`. Tests/types compartidos. | ✓ |
| Shape nuevo compacto | Tokens-eficiente. Nueva interface a mantener. | |
| Espejo + flag verbose=false default | Lo mejor de ambos. Más API surface. | |

**User's choice:** Espejo crm-reader (Recommended)

### Cache de resultados intra-sesión

| Option | Description | Selected |
|--------|-------------|----------|
| Siempre fresh | Sin cache. ~50-150ms RTT. Elimina bugs stale. | ✓ |
| Cache en session_state TTL 60s | Stale data si stage cambia mid-turn. | |
| Cache en memoria por turn | Mapa intra-invocation. Inmune entre turns. | |

**User's choice:** Siempre fresh (Recommended)

### Verbosidad de campos pesados

| Option | Description | Selected |
|--------|-------------|----------|
| Por default todo, opt-out con param | Default útil, customización opcional. | |
| Solo core por default, opt-in pesados | Tokens-eficiente. Forces 2 calls. | |
| Todo siempre | Máxima simplicidad. Más tokens. | ✓ |

**User's choice:** Todo siempre
**Notes:** Usuario priorizó simplicidad de API sobre ahorro de tokens.

### Tools y cache legacy de Inngest

| Option | Description | Selected |
|--------|-------------|----------|
| Tools NO escriben legacy keys | Solo retornan, cleanup en follow-ups. | ✓ |
| Tools también escriben legacy keys | Backwards compat. Perpetúa cruft. | |
| Tools leen legacy keys como cache | Confunde origen de la data. | |

**User's choice:** Tools NO escriben legacy keys (Recommended)

---

## Área 4: Cleanup Inngest + observability

### Cómo se elimina el preload Inngest viejo

| Option | Description | Selected |
|--------|-------------|----------|
| Borrar en plan final tras integración | Plan integración → plan cleanup. Verificable post-deploy. | ✓ |
| Feature flag temporal `USE_CRM_QUERY_TOOLS` | Soak 1-2 semanas. Acumula deuda. | |
| Big bang en mismo plan que integración | Atómico. Rollback completo si falla. | |

**User's choice:** Borrar en plan final del standalone tras integración exitosa (Recommended)
**Notes:** Resultado efectivo: cleanup deferido a standalones follow-up por agente (ver Q1 abajo, donde el usuario reformuló el rollout).

### Eventos de observability

| Option | Description | Selected |
|--------|-------------|----------|
| `pipeline_decision:crm_query_*` + structured logs | Consistente con Somnio existente. | ✓ |
| Solo structured logs | Pierde panel observability. | |
| Nada | AI SDK loggea tool-error. Mínimo viable. | |

**User's choice:** pipeline_decision:crm_query_* + structured logs (Recommended)

### Cobertura de tests

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + Integration | Patrón actual del proyecto. | |
| Solo unit tests de tools | Deja sin probar config flow. | |
| Unit + Integration + E2E completo | Robusto. Setup más caro. | ✓ |

**User's choice:** Unit + Integration + E2E completo
**Notes:** E2E luego clarificado como Playwright UI completo (operador → UI → DB → tool).

### Orden de migración a agentes Somnio

| Option | Description | Selected |
|--------|-------------|----------|
| Recompra primero, pw-confirmation después | Recompra non-blocking → menor riesgo. | |
| Ambos en mismo plan (atomic) | Rollback dual. | |
| pw-confirmation primero | Más riesgo, más aprendizaje. Impacto cliente real. | |
| **(User free text)** Crear tools, integración por aparte | Standalone NO migra agentes. Follow-ups dedicados con context handoff. | ✓ |

**User's choice (free text):** "creamos las tools, luego yo las configuro por aparte me das todo el contexto de esta, porque tambien tenemos que limpiar codigo en cada uno de estos agentes"
**Notes:** Pivot mayor — standalone se reduce a infraestructura. Integración por agente queda como standalone separado con su propia discuss-phase.

### Sub-discusión: scope final del standalone

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, confirmo scope reducido | Solo infra (tools+config+UI+tests+handoff). | ✓ |
| Agregar UN agente como dogfooding | Migrar recompra como prueba. | |
| Modificar scope: agrega cosas | Otra interpretación. | |

**User's choice:** Sí, confirmo (Recommended) — con add-on: "al final crear un contexto para la edicion de cada agente, que tambien incluya ese preload cleanup"
**Notes:** El handoff debe incluir el cleanup del preload por agente (snippet de qué borrar/modificar).

### Sub-discusión: tipo de E2E

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright UI: usuario configura → tool retorna correcto | Cubre flow operador completo. | ✓ |
| Integration DB-only: seed config → tool query | Más rápido, sin browser. | |
| Ambos | Más mantenimiento. | |

**User's choice (después de explicación plain):** A — Playwright UI E2E
**Notes:** Usuario inicialmente dijo "no entendi bien que es el e2e", se le explicó plain y luego eligió A.

### Sub-discusión: handoff doc

| Option | Description | Selected |
|--------|-------------|----------|
| INTEGRATION-HANDOFF.md + project skill | Snapshot + descubrible. | ✓ |
| Solo LEARNINGS.md | No descubrible automáticamente. | |
| Solo project skill | Pierde snapshot al actualizar. | |

**User's choice:** INTEGRATION-HANDOFF.md en standalone dir + project skill (Recommended)

---

## Claude's Discretion

Áreas explícitamente delegadas al builder/research/planner:
- Slug exacto de la ruta UI bajo `/agentes` (ej. `crm-tools`, `configuracion-tools`, `herramientas`).
- Nombre exacto de la tabla DB (ej. `crm_query_tools_config`, `agent_query_config`, `workspace_crm_config`).
- Nombre exacto de la project skill (`crm-query-tools` por default).
- Estructura interna del módulo `src/lib/agents/shared/crm-query-tools/` (un archivo por tool vs. uno solo).
- Naming de eventos `pipeline_decision:crm_query_*` (sufijos exactos).
- Decidir tabla nueva dedicada vs columna JSONB en tabla existente — research-phase evalúa.

## Deferred Ideas

- Migración de `somnio-recompra-v1` + cleanup `recompra-preload-context.ts` → standalone follow-up `crm-query-tools-recompra-integration`.
- Migración de `somnio-sales-v3-pw-confirmation` + cleanup step 1 de `pw-confirmation-preload-and-invoke.ts` → standalone follow-up `crm-query-tools-pw-confirmation-integration`.
- Borrado de keys legacy `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` — en standalones de integración por agente.
- Tools adicionales (`getOrdersByEmail`, `getContactByCustomField`, `getOrdersByDateRange`, `getActiveOrderByContactId`) — backlog.
- Refactor crm-reader para importar del módulo compartido si shapes convergen — evaluación futura.
- Override per-agente de la config — agregar param opcional cuando un agente futuro lo requiera.
- Tools de mutación / escritura — fuera de scope absoluto (crm-writer es el path de mutación).
