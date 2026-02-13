# Phase 18: Domain Layer Foundation - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Crear `src/lib/domain/` como unica fuente de verdad para TODAS las mutaciones del sistema. Unificar server actions, tool handlers, action executor, webhooks y adapters en una sola capa que siempre emita triggers de automatizacion. Crear todos los tool handlers faltantes. Activar triggers muertos.

**NO incluido:** Nuevos tipos de automatizacion, nuevos triggers mas alla de los ya definidos, cambios de UI, nuevas features. Solo reorganizacion interna + completitud de tool handlers.

</domain>

<decisions>
## Implementation Decisions

### Organizacion del Domain Layer
- Agrupar funciones **por entidad**: `domain/contacts.ts`, `domain/orders.ts`, `domain/tasks.ts`, etc. (~8-10 archivos)
- **Claude's Discretion** en naming: Claude elige la convencion de nombres que mejor encaje con el codebase existente
- Incluir `domain/types.ts` para tipos compartidos (DomainContext, DomainResult)
- Domain layer vive en `src/lib/domain/`

### Auth y Supabase Client
- Domain SIEMPRE usa `createAdminClient()` (bypass RLS, un solo code path)
- Workspace isolation via filtro manual `workspace_id` en cada query
- Cada caller (server action, tool handler, automation, webhook) valida auth ANTES de llamar domain
- RLS se mantiene en la DB como defensa en profundidad — no se elimina
- Server actions: `getAuthContext()` verifica user + workspace membership
- Tool handlers: `context.workspaceId` pre-validado por sesion de agente
- Automations: `workspaceId` del evento Inngest (originado por trigger verificado)
- Webhooks: validacion HMAC + workspace del integration config

### Safety Net: DB Audit
- Incluir trigger ligero de Postgres en tablas criticas (contacts, orders, tasks, messages, etc.)
- Registra tabla + operacion + row_id + workspace_id en tabla `mutation_audit`
- Cron semanal (Inngest) compara mutaciones registradas vs eventos emitidos
- Detecta si algun codigo bypasea el domain layer

### Estrategia de Migracion
- **Incremental por entidad**, en orden de mayor duplicacion:
  1. Orders (4 code paths duplicados)
  2. Contacts + Tags (3 code paths)
  3. Messages/WhatsApp (3 code paths)
  4. Tasks
  5. Notes
  6. Custom fields
  7. Conversations
- **Coexistencia limpia**: codigo viejo funciona igual hasta que se migra, sin breaking changes, sin deprecation warnings
- **Todo migrado** al final de la fase — las ~8 entidades completas
- Cada paso es independientemente deployable y testeable

### Reglas de Triggers
- **TODA mutacion en domain/ emite su trigger correspondiente** — sin excepciones
- Triggers muertos **activados**:
  - `whatsapp.keyword_match`: wiring en webhook handler
  - `task.overdue`: cron Inngest que busca tareas vencidas periodicamente
- **Bulk operations**: por-item (50 contactos = 50 eventos). Precision enterprise sobre eficiencia de eventos.
- **Shopify webhook**: emite triggers (contact.created, order.created) al crear registros — permite automatizaciones reactivas
- **Cascade depth**: mantener MAX_CASCADE_DEPTH=3 (Claude's Discretion — probado en Fase 17, suficiente para casos reales)

### Scope de Tool Handlers Nuevos
- Crear TODOS los tool handlers faltantes junto con la migracion de cada entidad (Claude's Discretion: junto con migracion, no al final — cada entidad queda 100% completa antes de pasar a la siguiente, minimizando bugs)
- Tool handlers nuevos necesarios:
  - **Tasks**: create, update, complete, list
  - **Orders extendido**: update (campos), delete, duplicate, list
  - **Notes**: create, list, delete
  - **Custom fields**: update, read
  - **Conversations**: assign, close, list
- **Permisos del bot**: sin operaciones destructivas (DELETE). El bot puede crear, leer, actualizar. Delete solo desde UI por humano.
- Automatizaciones SI pueden ejecutar deletes

### Regla Permanente CLAUDE.md
- Agregar a CLAUDE.md: "TODA mutacion de datos DEBE pasar por `src/lib/domain/`. Nunca escribir directo a Supabase desde server actions, tool handlers, action executor o webhooks."

</decisions>

<specifics>
## Specific Ideas

- Investigacion exhaustiva completa: 6 agentes (3 internos + 3 online) analizaron el codebase y patrones de la industria
- Patron unanime recomendado: **Domain/Service Layer** — score 59/60 en evaluacion de 6 criterios
- Referencia: Dust, Composio, Relevance AI, Vercel AI SDK, LangChain todos usan el mismo patron
- Alternativas evaluadas y descartadas: Postgres DB triggers (contexto pobre), Outbox pattern (Supabase no soporta txns), Enhanced Tool Handlers (API awkward para server actions), Use Cases 1-per-file (94 archivos = overkill), Middleware/wrappers (solucion parcial)
- El patron es: adapters thin (server actions, tool handlers, executor, webhooks) → domain functions (logica + triggers) → DB

### Datos del codebase actual
- 94 funciones de mutacion en 32 archivos
- 16 tool handlers — ninguno emite triggers
- 12+ tool handlers faltantes
- 10 funciones emit en trigger-emitter.ts
- 2 triggers muertos (keyword_match, task.overdue)
- 3 code paths separados para WhatsApp messaging
- Action executor duplica logica CRM directa en vez de reusar tool handlers

</specifics>

<deferred>
## Deferred Ideas

None — discusion se mantuvo dentro del scope de la fase.

</deferred>

---

*Phase: 18-domain-layer-foundation*
*Context gathered: 2026-02-13*
