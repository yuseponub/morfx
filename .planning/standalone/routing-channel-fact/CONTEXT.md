# Standalone: Routing Channel Fact - Context

**Gathered:** 2026-05-04
**Status:** Ready for research + planning
**Origin:** Usuario quiere diferenciar el saludo del bot "GoDentist Valoraciones" entre WhatsApp / Facebook / Instagram. Discovery mostro que el `agent-lifecycle-router` (shipped 2026-04-25) NO tiene fact que exponga el canal de la conversacion. Este standalone agrega esa primitiva. La discusion de **como** se aprovecha (agente sibling vs templates por canal) ocurre en una conversacion siguiente.

<domain>
## Phase Boundary

Agregar un nuevo fact `channel` al motor de reglas del `agent-lifecycle-router` que devuelva el canal de la conversacion entrante (`'whatsapp' | 'facebook' | 'instagram' | null`). El fact se resuelve via almanac on-demand, lee `conversations.channel` a traves del domain layer, y queda disponible para que cualquier regla (classifier o router) pueda matchear con operadores existentes (`equal`, `in`, etc).

**En scope:**
- Nuevo domain helper `getConversationChannel(conversationId, workspaceId)` en `src/lib/domain/conversations.ts`
- Extension de `FactContext` (`facts.ts`) para incluir `conversationId?: string | null`
- Extension de `BuildEngineInput` (`engine.ts`) para forwardear `conversationId` al fact context
- Pase de `input.conversationId` desde `route.ts` al `buildEngine` (Layer 1 + Layer 2)
- Registro del nuevo fact `channel` en `registerFacts(...)` (`facts.ts`)
- Inclusion del fact en `FACT_NAMES_TO_SNAPSHOT` (`route.ts:62-74`) para audit log
- Tests unitarios del resolver (canal correcto, null en miss, null en error)
- Test de integracion: regla con `channel` operator `in [facebook, instagram]` matchea end-to-end via `engine.run`

**Fuera de scope (proximas conversaciones / standalones):**
- Crear o modificar reglas en la tabla `routing_rules` que usen el nuevo fact (decision producto, separada).
- Crear agente sibling `godentist-fb` / `godentist-ig` o equivalente.
- Agregar columna `channel` a `agent_templates`.
- Modificar el system prompt o template catalog de `godentist`.
- Cualquier UI de admin para escribir reglas que usen `channel` (la UI actual de routing-editor ya acepta cualquier fact-string, no requiere cambios).
- Otros facts derivados (`isMetaChannel`, `messageContent`, `inboundMessageType`, etc) — explicitamente fuera de scope (D-01).

</domain>

<decisions>
## Implementation Decisions

### Surface del fact

- **D-01:** Exponer **solo** el fact `channel` (string | null). Las reglas usan operadores existentes para agrupar (ej: `{ fact: "channel", operator: "in", value: ["facebook", "instagram"] }`). Razon: mantener el registry minimal (12 facts en vez de 14+); helpers derivados como `isMetaChannel` se pueden agregar en un follow-up si la friccion es real, pero sin evidencia hoy.

### Comportamiento ante error / missing data

- **D-02:** El resolver retorna `null` cuando: (a) la query a Supabase falla, (b) `conversationId` es null/undefined, o (c) la conversacion no existe / fue borrada. Errores de query se loguean con `console.error('[routing.facts] channel failed:', err)` pero NO tumban el engine (Pitfall 4 — fail-safe). Reglas con operadores `equal` / `in` simplemente no matchean cuando el fact es null. Consistente con los 11 facts existentes (`activeOrderStage`, `lastInteractionAt`, etc).

### Audit log

- **D-03:** Incluir `'channel'` en `FACT_NAMES_TO_SNAPSHOT` (`route.ts:62-74`). Cada decision de routing queda con el canal en `routing_audit.facts_snapshot`. Costo: 1 propiedad mas en el JSONB. Beneficio: debug y trazabilidad completa de por que fired una regla X. La tabla `routing_audit` no requiere migracion (es JSONB).

### Claude's Discretion (decisiones tecnicas locked sin gray-area dedicado)

- **D-04 — Domain helper:** Nuevo `getConversationChannel(conversationId, workspaceId)` en `src/lib/domain/conversations.ts`. Firma: `(conversationId: string | null, workspaceId: string) => Promise<'whatsapp' | 'facebook' | 'instagram' | null>`. Retorna `null` si `conversationId` es null/undefined sin tocar DB (short-circuit). Filtra por `workspace_id` (Regla 3). Usa `createAdminClient()` (la unica capa que toca Supabase para mutaciones; aqui es read-only pero respetamos el patron de domain).
- **D-05 — FactContext extension:** Agregar `conversationId?: string | null` a `FactContext` (`facts.ts:103`). El campo es opcional para no romper tests existentes que arman engines sin conversationId (ej: `dry-run.ts`). El resolver verifica `if (!ctx.conversationId) return null` antes de query.
- **D-06 — BuildEngineInput extension:** Agregar `conversationId?: string | null` a `BuildEngineInput` (`engine.ts:12-18`). `buildEngine(...)` lo forwardea a `registerFacts(engine, { contactId, workspaceId, conversationId })`.
- **D-07 — Pase desde `route.ts`:** En las dos llamadas a `buildEngine` (Layer 1 + Layer 2), agregar `conversationId: input.conversationId ?? null`. `RouteAgentInput.conversationId` ya existe (`route.ts:53`).
- **D-08 — Sin caching dedicado:** No agregar cache in-memory por canal. La query es indexada (`conversations.id` es PK), <1ms en p99. El engine evalua lazy: si ninguna regla referencia `channel`, el resolver no se invoca. Si N reglas lo referencian, el almanac cachea por-request automaticamente (json-rules-engine builtin).
- **D-09 — Schema JSON sin cambios:** `rule-v1.schema.json` define `fact: { type: "string", minLength: 1 }` (no whitelist). Acepta el nuevo fact sin migracion ni rebuild de cache de reglas. La UI del routing-editor (`/agentes/routing`) tampoco requiere cambios porque acepta cualquier fact-string.
- **D-10 — Sin migracion DB:** `conversations.channel` ya existe y esta poblado correctamente desde el shipped de manychat-integration. No hay nada que migrar. Se omite la pausa de Regla 5 (no aplica).
- **D-11 — Tests obligatorios:** (a) Unit: resolver retorna 'whatsapp' / 'facebook' / 'instagram' segun fixture; null cuando conversationId es null; null cuando query falla (mock supabase throw). (b) Integration: una regla `{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }` con event `agent_id: 'test-agent'` matchea para una conversacion FB y NO matchea para WhatsApp, usando la pipeline real de `engine.run`. Tests viven en `src/lib/agents/routing/__tests__/`. (c) Audit log: assertion que `facts_snapshot.channel` aparece en el output de `routeAgent` (extension de tests existentes en `route.test.ts`).
- **D-12 — Backward compat:** Cero impacto en reglas existentes. Las reglas que no referencian `channel` no invocan el resolver (lazy eval del almanac). Tests existentes deben seguir pasando sin cambios — los que arman engines manualmente sin pasar `conversationId` siguen funcionando porque el campo es opcional y default `null`.
- **D-13 — Activacion sin feature flag:** El fact se activa con el merge a main. No requiere flag porque (a) no cambia comportamiento de routing existente, (b) Regla 6 no aplica — el fact es una primitiva read-only que solo se usa si una regla lo referencia, y no hay reglas referenciandolo en el ship inicial.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Standalone padre — agent-lifecycle-router (shipped 2026-04-25)
- `.planning/standalone/agent-lifecycle-router/CONTEXT.md` — decisiones de arquitectura del router que este standalone extiende
- `.planning/standalone/agent-lifecycle-router/01-PLAN.md` — schema de routing rules y tabla
- `.planning/standalone/agent-lifecycle-router/04-PLAN.md` — engine integration en webhook-processor

### Codigo del router (locked, este standalone solo extiende)
- `src/lib/agents/routing/facts.ts` — registro de los 11 facts existentes; agregar `channel` aqui
- `src/lib/agents/routing/engine.ts` — `buildEngine` factory; extender `BuildEngineInput`
- `src/lib/agents/routing/route.ts` — `routeAgent` API publico; extender llamadas a `buildEngine` y `FACT_NAMES_TO_SNAPSHOT`
- `src/lib/agents/routing/schema/rule-v1.schema.json` — sin cambios; verificar que `fact` acepta strings arbitrarios
- `src/lib/agents/production/webhook-processor.ts:236-244` — caller de `routeAgent` con `conversationId` ya plumeado

### Domain layer (Regla 3)
- `src/lib/domain/conversations.ts` — agregar `getConversationChannel(conversationId, workspaceId)`; ya tiene la columna `channel` referenciada en line 51

### Reglas del proyecto
- `CLAUDE.md` Regla 0 — GSD completo obligatorio
- `CLAUDE.md` Regla 3 — domain layer es unica fuente de mutacion (aplica al getter aunque sea read-only por consistencia)
- `CLAUDE.md` Regla 5 — migracion antes de deploy (no aplica: no hay migracion en este standalone)
- `CLAUDE.md` Regla 6 — proteger agente en produccion (D-13: el fact no requiere flag)

### Tests existentes a respetar
- `src/lib/agents/routing/__tests__/engine.test.ts`
- `src/lib/agents/routing/__tests__/domain.test.ts`
- `src/lib/agents/routing/__tests__/dry-run.test.ts`
- `src/lib/agents/routing/__tests__/cache.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`registerFacts(engine, ctx)`** (`facts.ts:108`) — patron establecido para registrar facts. Cada fact es un async resolver con try/catch + sentinel. El nuevo `channel` sigue este molde exacto.
- **`FACT_NAMES_TO_SNAPSHOT`** (`route.ts:62-74`) — array readonly que define que facts se persisten en audit log. Solo agregar `'channel'`.
- **`buildEngine(input)`** (`engine.ts:30`) — factory que arma engine fresh per-request (Pitfall 7). Solo extender el input type.
- **`almanac.factValue<T>(name)`** — API de json-rules-engine para leer facts dentro de otros resolvers o post-run; ya usado en `daysSinceLastInteraction`.

### Established Patterns
- **Fact context viaja como segundo argumento de `registerFacts`** — extender `FactContext` agregando `conversationId` mantiene el patron sin invertir el flujo (Pitfall 7).
- **Errors loggean pero no rompen el engine** — todos los facts retornan sentinel (null, false, [], 0) en catch. El nuevo `channel` retorna null (Pitfall 4).
- **Schema permite cualquier fact name** — la validacion JSON solo verifica formato (string non-empty), no whitelist; agregar facts nuevos no requiere bump de schema_version.
- **Audit log via JSONB** — `routing_audit.facts_snapshot` es JSONB, agregar properties no requiere migracion.

### Integration Points
- **Caller principal:** `webhook-processor.ts:236-244` ya pasa `conversationId`; cero cambios aqui.
- **Tests de routing:** Los fixtures en `__tests__/fixtures.ts` posiblemente necesiten extender el factory de engines para pasar `conversationId`. Verificar y extender si rompe tests.
- **UI routing-editor:** `/agentes/routing/page.tsx` permite escribir condiciones con cualquier fact string. El nuevo fact aparecera disponible al usuario sin cambios de UI (puede escribir `channel` en el campo fact). Documentar para el siguiente standalone que cubra reglas concretas.

</code_context>

<specifics>
## Specific Ideas

- **El usuario dijo:** "ok primero hagamos el arreglo del routing, luego discutimos lo de los agentes" → este standalone se mantiene estricto en agregar SOLO la primitiva (fact). Cualquier deriva hacia "y de paso creemos el agente godentist-fb" se rechaza con "eso es la siguiente conversacion".
- **El usuario dijo previamente:** "ya existe un sistema de routing, aunque a este sistema creo que no le hemos agregado diferenciador por canal" → confirma que el alcance es agregar la primitiva, no rediseñar el sistema.
- **Reuso del patron `agent-lifecycle-router`:** este standalone se modela como extension natural del router shipped. Cero rediseño.

</specifics>

<deferred>
## Deferred Ideas

### Para la siguiente conversacion (post-merge de este standalone)
- **Diferenciar saludo de GoDentist por canal:** decision producto entre Opcion A (agente sibling `godentist-fb`/`godentist-ig` con catalogo de templates separado) o Opcion B (columna `channel` en `agent_templates`). Esto es lo que motivo el standalone, pero la decision de como implementarlo se discute en una conversacion separada.
- **Reglas en `routing_rules` que usen `channel`:** una vez decidida la Opcion A o B, escribir las reglas concretas (workspace GoDentist, condicion `channel in [facebook, instagram]`, evento `agent_id: <X>`).

### Posibles facts futuros (no decididos hoy, fuera de scope)
- `isMetaChannel` — helper booleano. Solo si la friccion de escribir `channel in [facebook, instagram]` se vuelve un patron repetido.
- `messageContent` — texto del mensaje entrante para reglas tipo "si dice 'cancelar' rutea a humano". Requiere plumear el mensaje hasta `routeAgent`, que hoy no lo recibe.
- `inboundMessageType` — text / image / audio. Mismo razonamiento que `messageContent`.

### Mejoras al observability (no decididas hoy)
- UI de routing-editor que liste todos los facts disponibles con descripcion (hoy es texto libre, el operador tiene que recordar nombres).

</deferred>

---

*Standalone: routing-channel-fact*
*Context gathered: 2026-05-04*
