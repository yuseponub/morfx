---
standalone: somnio-sales-v3-pw-confirmation
phase: discuss
date: 2026-04-27
mode: conversational, block-by-block
---

# Discussion Log — somnio-sales-v3-pw-confirmation

## Briefing inicial del usuario

> "quiero crear un nuevo agente de respuesta para P/W, actualmente estan bloqueados por tags pero creamos un routing, y debo crear una version de somniosalesv3 que ya sabe que recibio la orden y esta a la espera de la confirmacion. Debe extraer la info del pedido activo tal como lo hace el agente de recompra (usando el CRM extractor de ia) pero con el pedido activo (el que acaba hacer el cliente, que por lo general se debe encontrar en alguno de estos 3 stages: NUEVO PAG WEB, FALTA INFO o FALTA CONFIRMAR).
>
> El agente debe identificar si los datos estan completos para el envio, y si no pedir los faltantes. Si el cliente responde 'si' significa que esta respondiendo porque por lo general se envian estos templates 'pedido_recibido_v2', 'direccion_entrega', 'confirmar_compra'. Si el cliente hace alguna pregunta, el bot debe utilizar la misma estructura informacional que el somniosalesv3, pero teniendo en cuenta que ya se supone que estamos en la fase de confirmacion. Es una adaptacion de ese agente lo que tenemos que hacer"

---

## Bloque 1 — Identidad y routing

### P1.1 — Nombre del agente
**A:** `somnio-sales-v3-pw-confirmation`

### P1.2 — Cómo entra el cliente al agente
**A:** El routing es responsabilidad del usuario. Lo configura él en `/agentes/routing-editor`. Scope de este standalone = crear el agente y registrarlo para que aparezca como opción seleccionable en el dropdown del editor.

### P1.3 — Coexistencia con somnio-sales-v3
**A:** Opción (a). El agente toma todo el turno (informacionales + sales actions + confirmación). Es duplicar `somnio-sales-v3` y reestructurarlo para fase post-compra.

### P1.4 — Prioridad en el router
**A:** Fuera de scope. El usuario lo configura.

---

## Bloque 2 — Identificación del pedido activo

### P2.1 — Múltiples pedidos en los 3 stages
**A:** Opción (a). Más reciente por `created_at DESC`.

### P2.2 — Sin pedido en los 3 stages
**A:** El routing externo garantiza que el agente solo se activa si hay pedido en uno de los 3 stages. No es preocupación del agente.

### P2.3 — Timing del CRM reader
**A:** El reader corre al crear sesión (mismo dispatch que recompra), pero **a diferencia de recompra**, el agente debe **esperar (bloquear) hasta que el reader termine** antes de responder al cliente. Razón: garantizar que la primera respuesta tenga estado real. Si faltan datos para envío, primera respuesta es pedirlos.

---

## Bloque 3 — Datos para envío

### P3.1 — Campos obligatorios
**A:** Los mismos que `somnio-sales-v3`. Research-phase los inventaría.

### P3.2 — Fuente de verdad
**A:** El CRM reader devuelve los datos del pedido/contacto. El agente lee de la respuesta del reader.

### P3.3 — Quién escribe los datos al pedido
**A inicial:** "crm reader" (interpretado como confusión — el reader es read-only).
**A corregida:** Opción (a). **CRM writer** (propose→confirm). Trazabilidad en `crm_bot_actions`, two-step preservado.

---

## Bloque 4 — Confirmación

### P4.1 — Detección del "sí"
**A:** Opción (a). "Sí" sólo válido como confirmación si el último template enviado fue `confirmar_compra`. Asumir que ya se enviaron los 3 templates pre-activación: `pedido_recibido_v2` + `direccion_entrega` + `confirmar_compra`.

### P4.2 — Acción al confirmar
**A:** (a) + (b). Mover a stage **`CONFIRMADO`** + enviar template de confirmación.

### P4.2.1 — Stage destino
**A:** `CONFIRMADO`.

### P4.2.2 — Template de confirmación
**A:** Mismos que `somnio-sales-v3`, con variación por municipio para tiempo de entrega. Si no existe el template adecuado para PW-confirmation → crear nuevo.

### P4.3 — "No" / cancelación
**A:**
- "No" → primero preguntar **"¿deseas agendarlo para alguna fecha?"**. Si vuelve a decir no → cancelar **sin mover stage** + escalar a humano.
- "Cambiar dirección" → reabrir captura, actualizar pedido vía crm-writer.
- "Editar promo / agregar-quitar producto" → agente edita el pedido vía crm-writer.
- "Espera lo pienso / ya te confirmo" → mover a stage **`FALTA CONFIRMAR`** + enviar template "Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴".

### P4.3.1 — "Editar promo" clarificado
**A:** El **agente** edita el pedido (con crm-writer). Si crm-writer no soporta editar items → escala a humano.

### P4.3.2 — Stage para "espera"
**A:** `FALTA CONFIRMAR`. Template a crear si no existe.

---

## Bloque 5 — Templates

### P5.1 — Catálogo propio
**A:** Opción (a). Catálogo independiente bajo `agent_id='somnio-sales-v3-pw-confirmation'`. Confirma que `somnio-recompra-v1` ya tiene su propio catálogo desde phase `somnio-recompra-template-catalog` shipped 2026-04-23.

### P5.2 — Templates a clonar/crear
**A:**
- **Informacionales**: clonar tal cual de sales-v3.
- **Sales actions**: NO clonar tal cual. Hay que **reestructurar** porque las de sales-v3 son para prospectos; este agente opera post-compra. Research-phase analiza el set actual y propone reestructurado.

### P5.3 — Variación por municipio
**A:** Opción (c). Replicar la lógica que tenga sales-v3 hoy. Research-phase mapea.

---

## Bloque 6 — Scope (PUEDE / NO PUEDE)

### P6.1 — PUEDE
**A:** Confirmado el draft completo. Ver D-17 en CONTEXT.md.

### P6.2 — NO PUEDE
**A:** Confirmado el draft completo. Ver D-18 en CONTEXT.md.

### P6.3 — Workspace + feature flag (Regla 6)
**A:** Workspace = Somnio. **NO se necesita feature flag.** El usuario inició la duda diciendo "creo que la regla 6 no importa porque están por routing — me confirmas". Verifiqué en código:

- `webhook-processor.ts:218-305` invoca `routeAgent()` sólo si `lifecycle_routing_enabled=true`.
- `routing/route.ts:138-148`: sin regla activa para el `agent_id`, retorna `agent_id=null` con `reason='no_rule_matched'`.
- `agentRegistry` se carga vía self-register en imports (`src/lib/agents/registry.ts:117`). El módulo del agente nuevo debe importarse en `src/app/(dashboard)/agentes/routing/editor/page.tsx:25-28` para aparecer en el dropdown.
- Precedente: `somnio-recompra-v1` no usa feature flag de "agente activo"; el flag `somnio_recompra_crm_reader_enabled` solo controla preload del CRM reader.

**Veredicto:** la sola ausencia de regla activa garantiza aislamiento. Caveat: asume `lifecycle_routing_enabled=true` en Somnio (probable desde flip 2026-04-25); si está en `false`, el legacy if/else tampoco conoce el agent_id nuevo, así que el aislamiento se mantiene por razones distintas.

---

## Bloque 7 — Tools y handoff

### P7.1 — Set de tools
**A:** Confirmado el draft. Ver D-20 en CONTEXT.md. Excluir explícitamente `crear_orden` u otros tools de creación de pedidos heredados de sales-v3 (research-phase verifica el set actual).

### P7.2 — Triggers de handoff
**A:** (a) + (b) + (c) + (d). Ver D-21 en CONTEXT.md.

### P7.3 — Mecanismo técnico de handoff
**A:** No se materializa por ahora. Tool real `handoff_human` se construye en standalone futuro. Este agente sólo detecta y registra (observability + posible flag en sesión).

---

## Bloque 8 — Observabilidad y testing

### P8.1 — Eventos de observability
**A:** No fijar lista a priori. Research-phase analiza patrones de `somnio-sales-v3` y `somnio-recompra-v1` (que emite 5 eventos `pipeline_decision:*`) y propone set definitivo.

### P8.2 — Tests automatizados
**A:** Dejarlo abierto. Research-phase analiza primero salestrack y transitions de `somnio-sales-v3` y propone el set definitivo.

### P8.3 — Cobertura de research-phase
**A:** TODOS los puntos del checklist. Ver D-24 en CONTEXT.md.

Aclaración sobre `lifecycle_routing_enabled`: el usuario solo necesita que el agente aparezca como opción para añadirlo a una regla que él cree. Eso depende solo de:
1. Self-register en `agentRegistry`.
2. Import en `routing/editor/page.tsx`.

El estado del flag global se documenta como informativo en research, no bloqueante.

---

## Cierre

Discuss-phase completo. 6 bloques, 24 decisiones lockeadas (D-01..D-24). Standalone listo para research-phase.

**Siguiente paso:** invocar `gsd-phase-researcher` con mandato basado en D-24 (cobertura de research) + análisis de patrones (D-22, D-23) + diseño del CRM reader bloqueante (D-05 — patrón nuevo, no existe en recompra).
