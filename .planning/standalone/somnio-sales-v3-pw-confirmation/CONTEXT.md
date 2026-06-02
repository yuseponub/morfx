---
standalone: somnio-sales-v3-pw-confirmation
status: plan-complete
created: 2026-04-27
phase_type: new-agent
agent_id: somnio-sales-v3-pw-confirmation
workspace: Somnio (a3843b3f-c337-4836-92b5-89c58bb98490)
upstream_agent: somnio-sales-v3
related_agents: somnio-recompra-v1, somnio-sales-v3, agent-lifecycle-router
---

# Standalone: somnio-sales-v3-pw-confirmation

## Goal

Crear un agente AI nuevo, variante de `somnio-sales-v3`, especializado en la **fase post-orden / pre-confirmación** para pedidos creados desde la página web de Somnio (P/W). El agente atiende a clientes cuyos pedidos están en uno de los 3 stages de entrada y los lleva hasta confirmación efectiva (`CONFIRMADO`) o handoff humano si cancelan, manejando captura de datos de envío faltantes y preguntas informacionales con framing post-compra.

## Stages de entrada (resolución del pedido activo)

El agente opera sobre clientes con pedido activo en uno de:
- `NUEVO PAG WEB`
- `FALTA INFO`
- `FALTA CONFIRMAR`

Si el contacto tiene 2+ pedidos en estos stages: tomar el más reciente por `created_at DESC`.

El sistema de routing (`agent-lifecycle-router`) garantiza que el agente NO se invoca si no hay pedido en estos stages — no es preocupación interna del agente.

## Templates pre-activación (asunción)

Cuando este agente recibe el primer mensaje del cliente, asumimos que ya se enviaron los siguientes 3 templates desde el flujo previo (web → CRM):

1. `pedido_recibido_v2` — saludo + items + total + envío gratis
2. `direccion_entrega` — confirmación de dirección
3. `confirmar_compra` — pregunta directa de confirmación

> **Research-phase debe localizar y documentar el contenido exacto de estos 3 templates.**

## Decisiones lockeadas (D-01..D-N)

### D-01: agent_id final
`somnio-sales-v3-pw-confirmation`

Importa para: `agentRegistry`, `sessions`, `observability` agentId, `whatsapp_templates.agent_id`, rate-limit bucket.

### D-02: Routing y aislamiento
- Routing es controlado por el usuario vía UI `/agentes/routing-editor` (fuera de scope de este standalone).
- **NO se necesita feature flag** para Regla 6: la sola ausencia de regla activa en `routing_rules` que mencione el agent_id garantiza aislamiento (verificado en `webhook-processor.ts:218-305` y `routing/route.ts:138-148`).
- Scope técnico: el agente debe **aparecer como opción seleccionable** en el dropdown del routing-editor, lo cual depende de:
  - Self-register en `agentRegistry` (`src/lib/agents/registry.ts:117`)
  - Importar el módulo en `src/app/(dashboard)/agentes/routing/editor/page.tsx`

### D-03: Coexistencia con somnio-sales-v3
El agente **toma todo el turno** cuando el routing lo activa: informacionales + sales actions + confirmación. Es un duplicado de sales-v3 reestructurado para fase post-compra. NO delega a sales-v3 internamente.

### D-04: Pedido activo — selección
Más reciente por `created_at DESC` cuando hay múltiples pedidos en los 3 stages.

### D-05: CRM Reader timing — BLOQUEANTE (distinto a recompra)
- CRM reader corre **al crear sesión** (mismo dispatch via Inngest que recompra).
- **DIFERENCIA CLAVE**: el agente **espera (bloquea) hasta que el reader termine** antes de responder al cliente.
- Razón: necesitamos garantizar que la primera respuesta ya tenga estado real del pedido para detectar datos faltantes vs. completos.
- Si el reader detecta datos faltantes → primera respuesta del agente es pedirlos.
- Implementación: requiere repensar el patrón async de recompra (que NO bloquea saludo); aquí se necesita un mecanismo de espera con timeout.

### D-06: Datos obligatorios para envío
Mismos campos que `somnio-sales-v3` requiere hoy. Research-phase debe inventariar el set exacto.

### D-07: Fuente de datos de envío
El CRM reader devuelve los datos del pedido y/o contacto. El agente lee de la respuesta del reader; no consulta DB directamente.

### D-08: Mutación de datos del pedido — vía CRM Writer
Cuando el cliente provee datos faltantes (dirección, teléfono, etc.) o pide editar el pedido, el agente invoca `crm-writer` (two-step propose→confirm) para mutar `orders`. NUNCA mutación directa al domain ni a Supabase.

### D-09: Detección del "sí" de confirmación
Heurística estricta: **"sí" (y variantes: si, dale, ok, confirmo, listo, correcto, 👍, etc.) sólo cuenta como confirmación válida si el último template saliente fue `confirmar_compra`** (asunción del flujo pre-activación).

### D-10: Acción al confirmar
- **Stage destino**: `CONFIRMADO`.
- **Templates**: mismos que `somnio-sales-v3` envía al confirmar pedido (con variación por municipio para tiempo de entrega). Research-phase debe identificar el set y la lógica de variación.
- Templates clonados bajo `agent_id='somnio-sales-v3-pw-confirmation'` (D-04 lección recompra).

### D-11: Manejo del "no" / cancelación
1. Primera respuesta del agente al "no" del cliente: enviar template **"¿deseas agendarlo para alguna fecha?"** (a crear si no existe).
2. Si cliente confirma "no" de nuevo: **cancelar sin mover stage** + escalar a humano (handoff).

### D-12: Manejo de "cambiar dirección"
Reabrir captura de datos. Cliente provee nueva dirección. Agente invoca crm-writer para actualizar `orders.shipping_address` (o equivalente). NO crea pedido nuevo.

### D-13: Manejo de "agregar/quitar producto" (editar promo)
Agente edita items/promo del pedido vía crm-writer. Research-phase debe verificar si crm-writer soporta edición de items/productos. Si NO los soporta → escala a humano y se documenta como gap.

### D-14: Manejo de "espera lo pienso / ya te confirmo"
- **Stage destino**: `FALTA CONFIRMAR` (uno de los 3 stages de entrada — esto significa que el agente puede mover pedidos entre los stages de entrada).
- **Template**: "Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴". Crear si no existe bajo `agent_id='somnio-sales-v3-pw-confirmation'`.

### D-15: Catálogo de templates — propio (D-04 lección recompra)
- Catálogo independiente bajo `agent_id='somnio-sales-v3-pw-confirmation'`.
- **Informacionales**: clonar tal cual de `somnio-sales-v3` (saludo, precio, envío, ubicación, contraindicaciones, dependencia, tiempo de entrega, registro sanitario, pago, etc.). Research-phase identifica el set completo.
- **Sales actions**: NO clonar tal cual. Las de sales-v3 son para prospectos (lead → venta); aquí se necesita un set **reestructurado** para post-compra (orden creada → confirmar). Research-phase analiza sales-v3 y propone set adaptado.
- **Templates nuevos**: crear los faltantes (`agendar_pregunta`, `claro_que_si_esperamos`, etc.).

### D-16: Variación por municipio (tiempo de entrega)
Replicar la lógica que tenga `somnio-sales-v3` hoy. Research-phase identifica si es:
- (a) un template con variable `{{tiempo_entrega}}` que se calcula del municipio
- (b) múltiples templates por región
- (c) otro patrón

### D-17: Scope PUEDE
- Responder a clientes Somnio con pedido activo en `NUEVO PAG WEB` / `FALTA INFO` / `FALTA CONFIRMAR`.
- Emitir templates del catálogo propio bajo `agent_id='somnio-sales-v3-pw-confirmation'`.
- Invocar **CRM reader** al crear sesión (bloqueante).
- Invocar **CRM writer** (propose→confirm) para: actualizar dirección/datos de envío, editar items/promo, mover stage a `CONFIRMADO`, mover stage a `FALTA CONFIRMAR`.
- Escalar a humano (handoff stub — sin materialización CRM, ver D-21).

### D-18: Scope NO PUEDE
- Operar fuera del workspace Somnio.
- Compartir catálogo de templates con sales-v3 u otros agentes.
- Crear pedidos nuevos (scope de sales-v3).
- Mutar pedidos directamente sin pasar por crm-writer.
- Crear/editar tags, pipelines, stages, templates, usuarios.
- Acceder a templates de otros agentes.
- Mover pedidos a stages fuera de los contemplados (`CONFIRMADO`, `FALTA CONFIRMAR`).

### D-19: Workspace
Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`).

### D-20: Set de tools (draft, validar en research)
- `crm_reader.*` (read-only, dispatch al crear sesión, BLOQUEANTE)
- `crm_writer.propose` + `crm_writer.confirm`
- `send_template` (filtrado por agent_id)
- `handoff_human` (stub — solo registra evento, ver D-21)
- Excluir explícitamente: `crear_orden` y cualquier otro tool de creación de pedidos heredado de sales-v3.

### D-21: Handoff a humano — sin materialización (deuda diferida)
Triggers de handoff:
- (a) Cliente cancela definitivo tras pregunta de agendamiento.
- (b) Cliente pide cambio fuera de scope (devolución, reclamo, cambios que crm-writer no soporta).
- (c) Error técnico irrecuperable (crm-writer falla, `stage_changed_concurrently`, etc.).
- (d) Cliente expresa frustración explícita ("hablar con humano", "asesor", "operador").

**Materialización técnica**: por ahora NO se cambia `assigned_to`, NO se aplica tag, NO se mueve a pipeline humana. El agente sólo **detecta y registra** (observability event + posible flag en sesión `requires_human=true`). Tool real `handoff_human` se construirá en standalone futuro.

### D-22: Observability
Patrones a replicar de `somnio-sales-v3` y `somnio-recompra-v1` (que emite 5 eventos `pipeline_decision:*`). Research-phase analiza ambos y propone set definitivo de eventos a emitir en RESEARCH.md.

### D-23: Tests automatizados — set abierto
Research-phase debe analizar primero los tests/structures de `somnio-sales-v3` (transitions, response-track, etc.) y proponer en RESEARCH.md el set definitivo de test suites para PW-confirmation. Draft tentativo (validar/ajustar):
- `transitions.test.ts` — máquina de estados, intent classification, regla del "sí".
- `response-track.test.ts` — selección de templates por estado.
- `crm-writer-integration.test.ts` — mocks propose/confirm.
- `shipping-completeness.test.ts` — lógica de completitud de datos.

### D-24: Cobertura de research-phase (TODOS estos puntos son obligatorios)
1. Inventario completo del catálogo actual de `somnio-sales-v3` (informacionales + sales actions, con cuerpos y variables).
2. Lógica actual de variación de tiempo de entrega por municipio en sales-v3.
3. Set de tools actual de sales-v3 (para herencia / exclusión).
4. Schema exacto de `orders.shipping_address` y/o `contacts.address` en Somnio (para validación de completitud).
5. Stages exactos del pipeline Somnio: nombres oficiales, IDs, transiciones permitidas, automatizaciones disparadas por cambio de stage.
6. Verificación de que `crm-writer` soporta editar items del pedido (no solo dirección).
7. Estado actual de `lifecycle_routing_enabled` en Somnio (informativo, no bloqueante).
8. Localizar y documentar contenido de `pedido_recibido_v2`, `direccion_entrega`, `confirmar_compra`.
9. Patrón actual de testing en sales-v3 (carpeta `__tests__/`, suites, mocks).
10. Patrón de observability events en sales-v3 (qué emite hoy).
11. Mecánica del CRM reader bloqueante: ¿existe ya este patrón en algún agente? ¿O hay que diseñarlo nuevo? (recompra es non-blocking; esto es nuevo).

### D-25: Arquitectura técnica del agente (post-research)
**State-machine pura** (sin AI SDK loop), clonando la arquitectura de `somnio-recompra-v1` (que es la misma de `somnio-v3`). Estructura de archivos a crear:

```
src/lib/agents/somnio-sales-v3-pw-confirmation/
├── __tests__/
├── comprehension.ts          # LLM clasifica intent
├── comprehension-prompt.ts
├── comprehension-schema.ts
├── config.ts                 # AgentConfig con agent_id
├── constants.ts              # Templates, stages, intents
├── engine-pw-confirmation.ts # Orquestador
├── guards.ts
├── index.ts                  # Self-register en agentRegistry
├── phase.ts                  # Fase actual del flujo
├── response-track.ts         # Selección de templates informacionales
├── sales-track.ts            # Acciones post-compra (REESTRUCTURADO vs sales-v3)
├── somnio-pw-confirmation-agent.ts  # Entry point
├── state.ts                  # State machine
├── transitions.ts            # Reglas de transición
└── types.ts
```

Integraciones:
- **CRM reader bloqueante** en creación de sesión (patrón nuevo, ver D-05 + research §B).
- **CRM writer adapter** (importar `proposeAction + confirmAction` directo, igual que sales-v3/recompra adapter pattern).
- Sin generateText / streamText / tool-loop de AI SDK.

### D-26: Asunción del estado inicial — los 3 templates pre-activación se asumen enviados
Cuando el routing activa el agente, se **asume por contrato** que el sistema externo (web → CRM) ya envió los 3 templates:
1. `pedido_recibido_v2`
2. `direccion_entrega`
3. `confirmar_compra`

Por tanto, el cliente entra al agente con **estado inicial de la máquina = "esperando confirmación"**. La regla D-09 ("sí" sólo válido si último template fue `confirmar_compra`) se reinterpreta como:

- **Implementación:** El estado inicial de la máquina es `awaiting_confirmation`. Cuando el primer mensaje del cliente es afirmativo (sí/dale/ok/correcto/listo/confirmo/👍), la máquina lo interpreta como confirmación válida si y sólo si el estado actual es `awaiting_confirmation` o `awaiting_confirmation_post_data_capture`.
- **NO se consulta `messages.template_name`** — esa columna es informativa pero NO se usa como guard.
- Si Wave 0 audit revela que el sistema externo NO siempre envía los 3 templates antes de la activación → tratado como **bug del flujo externo**, no de este agente. Se documenta en LEARNINGS pero no bloquea.

### D-27: Copy de templates informacionales = idéntico a `somnio-sales-v3`
Para todos los templates informacionales clonados, el copy es **idéntico al de sales-v3**, incluido el `registro_sanitario` = `"INVIMA / PHARMA SOLUTIONS SAS"`. Si recompra-v1 tiene copy divergente (`"FDA / BDE NUTRITION LLC"`), eso es problema separado de recompra; no se replica acá.

## Standalone artifacts esperados

```
.planning/standalone/somnio-sales-v3-pw-confirmation/
├── CONTEXT.md            ← este archivo (discuss-phase output)
├── DISCUSSION-LOG.md     ← Q&A completo
├── RESEARCH.md           ← research-phase output (siguiente)
├── 01-PLAN.md            ← (...)
├── ...
└── LEARNINGS.md          ← al cerrar
```

## Estado

- [x] discuss-phase complete
- [x] research-phase complete (RESEARCH.md, 1084 líneas)
- [x] plan-phase complete (13 plans en 8 waves)
- [ ] execute-phase
- [ ] verify-work
- [ ] LEARNINGS.md
