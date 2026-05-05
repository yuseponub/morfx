# Standalone: Agent GoDentist FB/IG (Sibling) - Context

**Gathered:** 2026-05-05
**Status:** Ready for research + planning
**Origin:** Usuario quiere diferenciar el saludo del bot "GoDentist Valoraciones" entre WhatsApp (saludo conversacional actual) y FB/Messenger + Instagram (saludo "lead capture" que pide nombre+celular upfront para no perder el contacto si después no responde). Habilitado por el standalone shipped `routing-channel-fact` (2026-05-04, commit `c410085`) que agregó el fact `channel` al motor de reglas.

<domain>
## Phase Boundary

Crear un **agente sibling** del `godentist` actual con `agent_id='godentist-fb-ig'` para atender conversaciones entrantes por **Facebook Messenger** e **Instagram Direct** del workspace "GoDentist Valoraciones" (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`). El sibling reusa **toda** la arquitectura del `godentist` actual (pipeline v3, comprehension Haiku, state machine determinista, ~75 templates) excepto:
1. **Saludo nuevo** (lead-capture: pide nombre+celular + Habeas Data inline)
2. **Lógica del primer turno**: si el cliente responde con datos parciales → enganchar `pedir_datos_parcial` con `{{campos_faltantes}}` automáticamente (la sede crítica se sigue pidiendo, solo que post-saludo)
3. **Catálogo de templates** independiente bajo `agent_id='godentist-fb-ig'` (clon de godentist con saludo distinto)

El agente `godentist` original queda funcionando **sin cambios** como default. La activación del sibling es 100% via routing rule (sin feature flag — Regla 6 satisfecha porque sin regla en `routing_rules` = sin tráfico = aislamiento total).

**En scope:**
- Nuevo agente `godentist-fb-ig` registrado en `agentRegistry` y `agent-catalog.ts`
- Constante `GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig'` en `src/lib/agents/godentist-fb-ig/config.ts`
- Pipeline files (`comprehension.ts`, `comprehension-prompt.ts`, `state.ts`, `transitions.ts`, `sales-track.ts`, `response-track.ts`, `godentist-fb-ig-agent.ts`, etc.) clonados/derivados de `src/lib/agents/godentist/` con `TEMPLATE_LOOKUP_AGENT_ID = 'godentist-fb-ig'`
- Migration SQL que clona los ~75 templates de godentist a `agent_id='godentist-fb-ig'`, sustituyendo el template `saludo` por el nuevo texto lead-capture (D-08)
- Lead-capture parser: lógica que detecta nombre+celular en el primer mensaje del cliente (post-saludo) y pasa al sales action `pedir_datos_parcial` automáticamente (D-09)
- Webhook entry point en `webhook-processor.ts` (branch `agentId === 'godentist-fb-ig'` análogo al branch `'godentist'` existente en línea 765)
- Tests automatizados completos (state machine, comprehension classification, template selection, timer signals, lead-capture parser end-to-end)
- Project skill descubrible: `.claude/skills/godentist-fb-ig.md` (o `src/lib/agent-specs/godentist-fb-ig.md` siguiendo convención existente)
- Actualizar `.claude/rules/agent-scope.md` con scope `### Godentist FB/IG Sibling Agent`
- Actualizar `docs/architecture/06-agent-lifecycle-router.md` mencionando el sibling como ejemplo de uso del fact `channel`

**Fuera de scope:**
- Crear la regla en `routing_rules` (D-15: el usuario la crea manualmente desde `/agentes/routing/editor` post-deploy).
- Modificar el agente `godentist` original (D-04: el sibling es ADITIVO, godentist queda intacto como default).
- Activar el sibling automáticamente (D-14: sin feature flag, sin auto-activation; requiere acción explícita del usuario en routing-editor).
- Habilitar canales adicionales (web chat, otros). Solo FB Messenger + Instagram Direct (D-01).
- Detectar `consentimiento_habeas` como intent nuevo (D-10: mandar datos = consentimiento implícito, sin nuevo intent).
- Crear nuevos estados en el state machine (D-13: el sibling reusa la máquina de godentist sin cambios).
- Cambiar el modelo de comprehension (D-12: sigue siendo Haiku idéntico al godentist).
- Workspace de pruebas separado (D-16: deploy directo a producción del workspace "GoDentist Valoraciones" — el routing rule controla el blast radius).
- Migración de la columna `channel` en alguna tabla (no aplica — `conversations.channel` ya existe, columna `agent_id` en `agent_templates` ya soporta cualquier string).

</domain>

<decisions>
## Implementation Decisions

### Identidad y scope del agente

- **D-01 — Canales atendidos:** El sibling sirve **solo** a `channel in ['facebook', 'instagram']`. "FB Messenger" y "facebook" son la misma superficie (mensajes a la página de FB llegan por Messenger → `conversations.channel='facebook'`). Otros canales (web chat, etc) NO están en scope; si surgen, requieren standalone separado.

- **D-02 — Workspace target:** Solo el workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` ("GoDentist Valoraciones", slug `godentist-valoraciones`, creado 2026-03-18). Diferente del workspace "GoDentist" del agente original. Razón: usuario aclaró explícitamente que no es el mismo. La regla en `routing_rules` se acota a este workspace (Layer 2 router del agent-lifecycle-router ya filtra por workspace).

- **D-03 — Nombre del agente y directorio:**
  - Agent ID: `'godentist-fb-ig'` (escogido por el usuario)
  - Directorio standalone: `.planning/standalone/agent-godentist-fb-ig/`
  - Source code dir: `src/lib/agents/godentist-fb-ig/`
  - Razón: nombre explícito que comunica scope (FB+IG combinados en un solo agente). Si en el futuro divergen FB e IG, se puede splitear en `godentist-fb` y `godentist-ig` sin romper este agente (sería otro standalone).

- **D-04 — Coexistencia con `godentist` original:** El agente `godentist` queda **intacto y funcionando** como default. El sibling es ADITIVO. Patrón idéntico a `somnio-sales-v3-pw-confirmation` vs `somnio-sales-v3` (shipped 2026-04-28): dos agentes coexisten, routing decide cuál se invoca. El branch `agentId === 'godentist'` en `webhook-processor.ts:765` permanece sin cambios; se agrega un branch nuevo `agentId === 'godentist-fb-ig'` paralelo.

### Saludo y captura inicial

- **D-05 — Saludo nuevo (locked verbatim):**
  ```
  👋 ¡Hola! Soy goBot 🤖 de godentist ®️.

  Tu valoración odontológica es totalmente GRATIS 🦷✨
  Déjanos estos datos y reservamos tu cita de inmediato:

  📌 Nombre completo
  📌 Celular

  🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).

  Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?
  ```
  Sustituye el template `saludo` (intent='saludo', visit_type='primera_vez', priority='CORE') del catálogo del sibling. Diferencia clave vs godentist: pide nombre+celular upfront (lead capture) e incluye disclaimer Habeas Data inline.

- **D-06 — Sin disclaimer adicional ni consentimiento explícito:** No se agregan URLs de política de privacidad ni botones de aceptación. El cliente envía sus datos = consentimiento implícito conforme Ley 1581/2011 (D-05 disclaimer informativo es suficiente). Razón: simplicidad operativa + alineado con cómo agentes WhatsApp manejan habeas data hoy (sin disclaimer).

- **D-07 — Comportamiento ante respuesta irrelevante post-saludo:** Si el cliente responde con un mensaje que NO contiene nombre+celular (ej: "hola, cuánto cuestan los brackets?"), el bot:
  1. Responde la pregunta informacional usando el catálogo normal (`precio_servicio`, etc.)
  2. Después del intervalo de timer (mismo timer que godentist actual usa para retomar), reinvitará a agendar — con el flujo ya establecido en `transitions.ts` del godentist (acciones `retoma_post_info`, `invitar_agendar`)
  3. NO insiste maquinalmente en pedir nombre+celular hasta que los dé. La lead capture es OPORTUNISTA, no bloqueante.

  Razón: el comportamiento natural del godentist actual ya cubre este caso vía retomas; el sibling no necesita lógica nueva, solo reusar las transitions existentes.

### Catálogo de templates

- **D-08 — Catálogo independiente bajo `agent_id='godentist-fb-ig'`:** Migración SQL crea ~75 INSERTs clonados de los templates `agent_id='godentist'` con cambio único: el template de intent `saludo` usa el texto de D-05. Razón: aislamiento total — modificaciones futuras al catálogo del sibling NO afectan al godentist original (lección aprendida del fix provisional `cdc06d9` revertido en somnio-recompra-v1, ver `agent-scope.md`).
  - Patrón SQL: `INSERT INTO agent_templates (agent_id, intent, visit_type, priority, orden, content_type, content, delay_s) SELECT 'godentist-fb-ig', intent, visit_type, priority, orden, content_type, CASE WHEN intent='saludo' AND priority='CORE' THEN <D-05 text> ELSE content END, delay_s FROM agent_templates WHERE agent_id='godentist' AND workspace_id IS NULL;`
  - Idempotencia: `DELETE FROM agent_templates WHERE agent_id='godentist-fb-ig'` antes del INSERT (mismo patrón que `20260318100000_godentist_templates.sql`).
  - Templates restantes (precios, horarios, ubicaciones, escape, follow-ups, english_response): **idénticos verbatim** al godentist actual.

- **D-09 — Lead capture: parser del primer mensaje:** El sibling intercepta el primer mensaje del cliente (turn 1, después del saludo bot que es turn 0). Si Haiku clasifica el mensaje como `intent: datos` (ya existe en GD_INTENTS), el sales-track del sibling pasa directo al action `pedir_datos_parcial` con `{{campos_faltantes}}` calculado:
  - Si tiene nombre + telefono pero falta sede → `pedir_datos_parcial` solicita sede.
  - Si tiene solo nombre → `pedir_datos_parcial` solicita celular y sede.
  - Si tiene solo celular → `pedir_datos_parcial` solicita nombre y sede.
  - Si tiene los 3 (nombre + celular + sede) → directo a `pedir_fecha`.
  - Si NO tiene ninguno (mensaje irrelevante) → caer en lógica D-07 (responder informational + retomar via timer).

  La lógica vive en `src/lib/agents/godentist-fb-ig/transitions.ts` o `sales-track.ts`. Reusa el helper de extracción de `nombre/telefono/sede_preferida` que ya existe en `comprehension.ts` del godentist (extracción dentro del `slots`/`datos` payload de Haiku). NO requiere cambios al `comprehension-prompt.ts` (Haiku ya sabe extraer estos campos del godentist actual).

- **D-10 — Sin nuevo intent `consentimiento_habeas`:** Mantener los mismos 23 intents (`GD_INTENTS` en `constants.ts:12-45`). El consentimiento es implícito al enviar datos. Razón: agregar un intent solo para "sí acepto" agrega ruido al clasificador Haiku sin valor (D-06).

### Comprehension y state machine

- **D-11 — Comprehension prompt:** Reusar `comprehension-prompt.ts` del godentist con dos ajustes mínimos:
  1. Agregar 1-2 ejemplos al prompt que muestren al primer turno post-saludo siendo `intent: datos` (ej: "María López, 3001234567" → `primary=datos`, `slots={nombre: "María López", telefono: "3001234567"}`)
  2. NO modificar el listado de intents ni la estructura del schema (D-10)

  El prompt clonado vive en `src/lib/agents/godentist-fb-ig/comprehension-prompt.ts`. Razón: minimizar deriva del prompt original; los 2 ejemplos nuevos refuerzan el flujo de lead capture sin reentrenar la lógica.

- **D-12 — Modelo Haiku:** `CLAUDE_MODELS.HAIKU` para comprehension (mismo que godentist). NO cambiar a Sonnet/Opus. Razón: el sibling es estructuralmente idéntico al godentist; cambiar modelo introduce variable confusa para debug.

- **D-13 — State machine sin cambios:** Reusar la máquina de godentist verbatim:
  ```
  nuevo → conversacion | captura | handoff
  conversacion → captura | handoff
  captura → captura_fecha | handoff
  captura_fecha → mostrando_disponibilidad | handoff
  mostrando_disponibilidad → confirmacion | handoff
  confirmacion → cita_agendada | captura | handoff
  cita_agendada → handoff
  handoff → []
  ```
  El estado inicial sigue siendo `nuevo`. La transición `nuevo → captura` ya existe (godentist `validTransitions.nuevo: ['conversacion', 'captura', 'handoff']` en `config.ts:57`), así que el lead capture del sibling pasa directo `nuevo → captura` cuando el primer mensaje del cliente trae datos. Razón: cero deuda de schema en `agent_observability_events.state` o tablas relacionadas.

### Activación y rollout

- **D-14 — Sin feature flag:** El sibling se activa 100% via routing rule en `routing_rules`. Sin regla = sin tráfico = aislamiento Regla 6 satisfecho sin flag (mismo patrón que `somnio-sales-v3-pw-confirmation` shipped 2026-04-28). Razón: agregar flag para un agente sibling es ceremonia sin valor — el routing engine YA es el control point.

- **D-15 — Routing rule la crea el usuario manualmente:** Post-deploy, el usuario va a `/agentes/routing/editor` y crea una regla:
  ```json
  {
    "workspace_id": "f0241182-f79b-4bc6-b0ed-b5f6eb20c514",
    "rule_type": "router",
    "priority": <a definir por usuario>,
    "active": true,
    "conditions": {
      "all": [
        { "fact": "channel", "operator": "in", "value": ["facebook", "instagram"] }
      ]
    },
    "event": { "type": "route", "params": { "agent_id": "godentist-fb-ig" } }
  }
  ```
  La migración NO crea esta regla. Razón: control humano + permite al usuario escoger priority correcto evitando colisiones con otras reglas existentes (Pitfall 1 del agent-lifecycle-router: UNIQUE INDEX `uq_routing_rules_priority WHERE active=true`).

- **D-16 — Deploy directo a producción del workspace "GoDentist Valoraciones":** No hay workspace de pruebas separado. El blast radius está controlado por D-15 (sin regla = sin tráfico). Una vez el código + migración están en main, el agente `godentist` original sigue siendo el default; el sibling solo se activa cuando el usuario crea la regla manualmente. Razón: simplicidad operativa + aislamiento garantizado por el routing engine.

### Tests y verificación

- **D-17 — Suite de tests automáticos completa para el sibling:** Escribir todos los tests necesarios para que el agente funcione bien sin depender de los tests del godentist original. Cobertura mínima:
  1. **State machine tests** (`transitions.test.ts`): valida todas las transitions del sibling, incluyendo `nuevo → captura` directo cuando hay datos en turn 1.
  2. **Comprehension tests** (`comprehension.test.ts`): valida que Haiku clasifica correctamente los 23 intents + el caso lead-capture (mensaje "Juan Pérez, 3001234567" → `intent=datos, slots={nombre, telefono}`).
  3. **Response track tests** (`response-track.test.ts`): valida que el saludo se dispara en turn 0 con el texto de D-05 verbatim, y que `pedir_datos_parcial` se selecciona cuando los datos están parciales.
  4. **Sales track tests** (`sales-track.test.ts`): valida la lógica de D-09 (parser de primer mensaje + cálculo de campos faltantes).
  5. **Lead capture E2E test** (`godentist-fb-ig-agent.test.ts`): integra todo el pipeline — recibe primer mensaje del cliente con nombre+celular parciales → comprehension → sales track → response track → output incluye `pedir_datos_parcial` con `{{campos_faltantes}}` correctos.
  6. **Template selection tests**: valida que el `TemplateManager` lookup usa `agent_id='godentist-fb-ig'` y NO cae al catálogo de godentist por error (anti-regresión D-08).

  Razón: tests automáticos blindan la implementación contra refactors futuros. El sibling reusa patrones del godentist pero la suite separada permite iteración independiente.

- **D-18 — Validación manual end-to-end por el usuario:** Después del deploy, el usuario hará pruebas manuales reales mandando mensajes a la página FB y al perfil IG del workspace "GoDentist Valoraciones". El equipo de desarrollo NO mantiene un script E2E automatizado contra Meta APIs (costo + flakiness alta).

### Documentación y reglas del proyecto

- **D-19 — Project skill + agent-scope:** Crear `src/lib/agent-specs/godentist-fb-ig.md` con scope PUEDE/NO PUEDE/Validación/Consumidores siguiendo el patrón de `godentist.md` y `somnio-sales-v3.md`. Actualizar `.claude/rules/agent-scope.md` con sección `### Godentist FB/IG Sibling Agent (godentist-fb-ig — webhook FB/IG inbound)`. Actualizar `CLAUDE.md` si aplica (no se espera que aplique — los scopes detallados viven en `.claude/rules/agent-scope.md`).

- **D-20 — Documentar el patrón "agente sibling para canal alterno":** En `LEARNINGS.md` del standalone (al cierre), documentar el pattern como reusable: cómo crear un sibling de un agente existente que reusa arquitectura completa pero con saludo/comportamiento distinto, lead capture upfront, catálogo independiente, activación 100% via routing fact `channel`. Este standalone es el primer caso de uso real del fact `channel` shipped en `routing-channel-fact` (2026-05-04) y debería servir como template para futuros siblings (ej: `somnio-fb-ig`, `agent-X-canal-Y`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Standalone padre — agent-godentist (shipped antes de 2026-05-04)
- `src/lib/agents/godentist/` — TODO el codigo del agente original que el sibling clona/deriva
- `src/lib/agents/godentist/config.ts` — `GODENTIST_AGENT_ID = 'godentist'`, `godentistConfig`, validTransitions, confidenceThresholds, tokenBudget
- `src/lib/agents/godentist/constants.ts` — `GD_INTENTS` (23), `INFORMATIONAL_INTENTS` (11), `ESCAPE_INTENTS` (4), `CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida']`, `ACTION_TEMPLATE_MAP`, `SEDES`, `SEDE_ALIASES`, timers
- `src/lib/agents/godentist/comprehension.ts` + `comprehension-prompt.ts` + `comprehension-schema.ts` — pipeline Haiku
- `src/lib/agents/godentist/godentist-agent.ts` — `processMessage` entrypoint, sistema-event path, user-message path
- `src/lib/agents/godentist/sales-track.ts` — sales action resolver
- `src/lib/agents/godentist/response-track.ts` — template manager + `TEMPLATE_LOOKUP_AGENT_ID`-equivalent (usa `GODENTIST_AGENT_ID` en lines 201, 507)
- `src/lib/agents/godentist/transitions.ts` — state machine rules
- `src/lib/agents/godentist/state.ts` — serialize/deserialize state, mergeAnalysis, computeGates
- `src/lib/agent-specs/godentist.md` — spec completo del agente (template para `godentist-fb-ig.md`)

### Standalone padre — routing-channel-fact (shipped 2026-05-04, commit `c410085`)
- `.planning/standalone/routing-channel-fact/CONTEXT.md` — D-01..D-13 del fact `channel`
- `.planning/standalone/routing-channel-fact/01-PLAN.md` + `01-SUMMARY.md` + `VERIFICATION.md` + `LEARNINGS.md`
- `src/lib/agents/routing/facts.ts` — fact `channel` registrado en `registerFacts`, line 262 (`engine.addFact('channel', async () => { ... })`)
- `src/lib/agents/routing/route.ts` — `FACT_NAMES_TO_SNAPSHOT` ahora incluye `'channel'` (line 74)
- `src/lib/domain/conversations.ts` — helper `getConversationChannel(conversationId, workspaceId)` (line 394)

### Standalone hermano — somnio-sales-v3-pw-confirmation (shipped 2026-04-28)
- `.planning/standalone/somnio-sales-v3-pw-confirmation/` — patrón ya validado para "agente sibling con catálogo propio + activación via routing rule sin feature flag"
- `src/lib/agents/somnio-pw-confirmation/` — referencia de cómo estructurar un sibling completo
- `src/lib/agent-specs/somnio-sales-v3-pw-confirmation.md` (si existe) o sección equivalente en `agent-scope.md`

### Routing engine
- `src/lib/agents/routing/engine.ts` — `BuildEngineInput.conversationId?: string | null` (line 23)
- `src/lib/agents/routing/route.ts` — caller principal de `buildEngine` (Layer 1 line 95, Layer 2 line 118)
- `src/lib/agents/production/webhook-processor.ts:236-244` — invocación de `routeAgent({ contactId, workspaceId, conversationId })`
- `src/lib/agents/production/webhook-processor.ts:765` — branch `agentId === 'godentist'` (template para agregar branch `'godentist-fb-ig'` en paralelo)

### Domain layer (Regla 3)
- `src/lib/domain/conversations.ts` — `getConversationChannel` (helper read-only)
- `src/lib/domain/contacts.ts` — patrón canonical de read helper (`getContactIsClient` lines 665-688)
- Domain helpers para `agent_templates` lookups (TemplateManager)

### Migrations / DB schema
- `supabase/migrations/20260318100000_godentist_templates.sql` — TEMPLATE de migración para clonar (~75 INSERTs); copiar estructura completa cambiando `agent_id` y reemplazando texto de `saludo`
- Tabla `agent_templates` columnas: `id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s`
- Tabla `routing_rules` (no se modifica en este standalone — D-15 manual)
- Tabla `routing_audit_log` ya tiene `facts_snapshot.channel` desde standalone routing-channel-fact

### Reglas del proyecto
- `CLAUDE.md` Regla 0 — GSD completo obligatorio
- `CLAUDE.md` Regla 1 — push a Vercel después de cada cambio
- `CLAUDE.md` Regla 2 — timezone America/Bogota (no aplica directamente — el agente reusa el manejo de timezone del godentist)
- `CLAUDE.md` Regla 3 — domain layer es única fuente de mutación (aplica a TODO acceso a DB del sibling)
- `CLAUDE.md` Regla 4 — documentación siempre actualizada (afecta `docs/architecture/06-agent-lifecycle-router.md` + `docs/analysis/04-estado-actual-plataforma.md` + LEARNINGS)
- `CLAUDE.md` Regla 5 — migración antes de deploy (aplica a la migración de templates: PAUSAR pre-deploy, esperar confirmación del usuario, después push)
- `CLAUDE.md` Regla 6 — proteger agente en producción (D-04 + D-14: el agente godentist original NO se modifica; el sibling se activa 100% via routing rule)
- `.claude/rules/agent-scope.md` — agregar sección `### Godentist FB/IG Sibling Agent` (D-19)

### Tests existentes a respetar
- `src/lib/agents/godentist/__tests__/` (si existe — revisar antes de plan-phase) — referencia para tests del sibling
- Tests de routing existentes (`src/lib/agents/routing/__tests__/`) NO se modifican

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Pipeline v3 completo del godentist**: comprehension Haiku + state machine determinista. El sibling reusa toda la arquitectura cambiando `agent_id` + saludo + 1 lógica del primer turno (D-09).
- **`processMessage` entrypoint** (`godentist-agent.ts:37`): clonar como `godentistFbIgAgent.processMessage` con cambio mínimo (`agent: 'godentist-fb-ig'` en observability events).
- **`TemplateManager.getTemplatesForIntents(agent_id, intent, ...)`**: ya parametrizado por agent_id; el sibling solo cambia el primer argumento.
- **Catálogo `agent_templates`**: schema soporta cualquier `agent_id` string. Migración SQL clona ~75 templates con UNA línea de cambio (CASE WHEN intent='saludo' THEN <D-05 text> ELSE content END).
- **`webhook-processor.ts:765` branch pattern**: el dispatch del agente se hace por `agentId === '<id>'`. Agregar nuevo branch en paralelo es el patrón establecido (mismo que sales-v3-pw-confirmation usa).
- **Agent registry / agent-catalog**: `src/lib/agents/registry.ts` + `src/lib/agents/agent-catalog.ts` ya soportan registro N-agentes. Agregar entry para `godentist-fb-ig` siguiendo patrón existente.

### Established Patterns
- **Sibling agent con catálogo propio** (D-08): `somnio-sales-v3-pw-confirmation` (shipped 2026-04-28) y `somnio-recompra-v1` (catálogo independiente desde 2026-04-23) son los precedentes. La regla "no compartir catálogo entre siblings" está locked en `agent-scope.md` por la regresión del commit `cdc06d9` revertido.
- **Activación via routing rule sin feature flag** (D-14): patrón validado por `somnio-sales-v3-pw-confirmation`. Sin regla en `routing_rules` = sin tráfico = aislamiento Regla 6 sin flag.
- **Cold-lambda race fix**: el `webhook-processor` pre-importa los agentes via `Promise.all([import('@/lib/agents/godentist'), ...])` ANTES de `routeAgent` call (commit post-rollout 2026-04-27). El sibling debe agregarse al array de pre-import para evitar `route.ts:138 → unregistered agent_id` en lambdas frescas.
- **Template `pedir_datos_parcial` con `{{campos_faltantes}}`**: ya existe en el catálogo del godentist actual (line 275 del seed). El sibling lo reusa via D-09.
- **Lead capture vía intent `datos`**: el intent `datos` ya existe en `GD_INTENTS` (line 28 de constants.ts) — Haiku ya sabe extraer nombre/telefono/sede del slot payload. D-09 solo agrega la lógica de "si es turn 1 y intent=datos → pasar directo a pedir_datos_parcial con campos_faltantes calculados".

### Integration Points
- **Webhook entry**: `src/lib/agents/production/webhook-processor.ts` — agregar branch `agentId === 'godentist-fb-ig'` análogo a línea 765. Pre-importar el módulo del sibling para evitar cold-lambda race.
- **Agent registry**: `src/lib/agents/registry.ts` — registrar `'godentist-fb-ig'`.
- **Agent catalog**: `src/lib/agents/agent-catalog.ts` — agregar entry con id='godentist-fb-ig' (template aparece en dropdown del routing-editor).
- **Routing rule** (D-15 manual): el operador escribe la regla; el agent-id `'godentist-fb-ig'` aparece en el dropdown de event.params.agent_id porque está en agent-catalog.
- **Observability**: agente loggea `agent_id='godentist-fb-ig'` en `agent_observability_events` automáticamente vía `getCollector()?.recordEvent` que el sibling invocará (clonado del godentist).

### Anti-patterns to avoid (lecciones aprendidas)
- **NO compartir catálogo de templates entre siblings** (regresión `cdc06d9` revertido en somnio-recompra). El sibling DEBE tener su propio `TEMPLATE_LOOKUP_AGENT_ID` constant + sus propios INSERTs en migration.
- **NO modificar el agente godentist original** (D-04). Cualquier cambio que se "filtre" al godentist viola Regla 6.
- **NO crear feature flag para el sibling** (D-14). El routing engine es el control point.
- **NO crear migración que inserte la routing rule** (D-15). El usuario la crea manualmente para evitar colisión de priority.
- **NO cambiar el modelo de comprehension** (D-12). Variable confusa para debug.

</code_context>

<specifics>
## Specific Ideas

- **El usuario dijo:** "ok opcion A agente sibling, editamos el agente actual y creamos una NUEVA VERSION (se crea otro agente desde 0 con otros template y demas)" → confirma D-04 (agente independiente) y D-08 (catálogo propio).
- **El usuario dijo:** "se reusa practicamente todo, solo hay que tener en cuenta que al inicio se pide nombre y cel, y si da eso si da eso se pide lo faltante, si no da eso completo se pide todo lo que falte" → locked en D-09 (lead capture parser + cálculo de campos faltantes).
- **El usuario dijo:** "el saludo pide datos unicamente para contactar por wpp si depsues no responde" → razón estratégica del lead capture (asegurar contacto WhatsApp post-FB/IG donde el cliente puede perderse). Documentar en LEARNINGS para futuros agentes Meta-channel.
- **El usuario dijo:** "haz los tests que necesites para que funcione bien" → locked en D-17 (suite completa, no minimalista). Da libertad al implementador para cubrir lo que considere necesario.
- **El usuario dijo:** "yo hago mis pruebas manuales" → locked en D-18 (validación E2E manual, no script automatizado contra Meta APIs).
- **El usuario dijo:** "se activa es con el routing, el agente actual queda funcionando igual como default" → confirma D-14 + D-04 + D-15.
- **Reuso del patrón establecido por somnio-sales-v3-pw-confirmation**: el approach está validado en producción (shipped 2026-04-28). Cero rediseño — solo aplicar el patrón a godentist con el nuevo fact `channel`.
- **Primer caso de uso real del fact `channel`** (shipped 2026-05-04). Este standalone valida la primitiva end-to-end y debería convertirse en pattern reusable para futuros siblings por canal.

</specifics>

<deferred>
## Deferred Ideas

### Para conversaciones futuras (post-merge de este standalone)

- **Splitear `godentist-fb-ig` en `godentist-fb` y `godentist-ig`**: si en el futuro el saludo o el flujo difiere entre Facebook e Instagram, crear dos agentes separados. Hoy se mantienen unidos porque el comportamiento esperado es idéntico (D-01).

- **Sibling para WhatsApp con lead capture**: si el patrón "lead capture en saludo" prueba ser efectivo en FB/IG, considerar aplicarlo a un sibling de WhatsApp para cierto tipo de campañas (ej: ads que mandan a WhatsApp). Por ahora WhatsApp mantiene el saludo conversacional cálido del godentist actual.

- **`pedir_sede` template explícito**: hoy la sede se pide como parte de `pedir_datos_parcial` con `{{campos_faltantes}}`. Si el flujo se vuelve confuso (ej: cliente envía nombre+celular y el bot responde "Para completar te falta: sede" — texto seco), considerar template dedicado `pedir_sede` con wording más amable.

- **Métricas de conversión FB/IG vs WhatsApp**: una vez ambos agentes corren en paralelo, comparar tasa de captura de datos en saludo vs tasa post-conversación. Sirve para decidir si el patrón lead-capture se aplica a más canales.

### Posibles features futuros (no decididos hoy, fuera de scope)

- **Disclaimer Habeas Data con URL de política de privacidad**: hoy el disclaimer es inline; si el equipo legal pide URL formal, agregar como variable `{{politica_privacidad_url}}` en template del sibling.
- **Detección de "no acepto" / opt-out explícito**: si el cliente responde "no autorizo" al saludo, manejar como `intent: rechazar` (ya existe). Si requiere flujo dedicado, considerar nuevo intent `opt_out_habeas` (D-10 lo descartó por ahora).
- **Auto-creación de routing rule via UI wizard del routing-editor**: hoy el operador construye la regla manualmente. Una mejora futura es un wizard "Agregar agente Meta" que pre-popula la regla con `channel in [facebook, instagram]`.

### Mejoras al observability (no decididas hoy)

- **Dashboard de comparativa godentist vs godentist-fb-ig**: panel en `/observability` que compare tasa de cita-agendada, tiempo promedio de captura, drop-off por turno. Útil post-deploy para validar el patrón lead-capture.

</deferred>

---

*Standalone: agent-godentist-fb-ig*
*Context gathered: 2026-05-05*
*Habilitado por: routing-channel-fact (shipped 2026-05-04, commit c410085)*
*Patrón base: agent-godentist (in-prod) + somnio-sales-v3-pw-confirmation (shipped 2026-04-28)*
