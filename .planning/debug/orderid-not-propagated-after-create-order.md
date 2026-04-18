---
status: in_progress
trigger: "Shopify automation con create_order + assign_tag(order) falla con 'No orderId available in trigger context' en la accion #3."
created: 2026-04-17T18:20:00-05:00
updated: 2026-04-17T18:20:00-05:00
---

## Current Focus

hypothesis: CONFIRMED — el orderId creado por la accion create_order nunca se propaga al triggerContext para las acciones siguientes. executeAction muta context.orderId dentro de un step.run de Inngest, y esas mutaciones no sobreviven entre step.run boundaries (cada replay es un lambda fresco).
test: Aplicar fix en processAutomation (automation-runner.ts) que mergea result.orderId al triggerContext + variableContext en el scope padre tras cada step.run exitoso.
expecting: Acciones assign_tag(order), change_stage, duplicate_order referenciando la orden recien creada en la misma automatizacion ahora funcionan.
next_action: Implementar fix.

## Symptoms

expected: Automatizacion Shopify "order created" ejecuta 3 acciones: (1) create_order, (2) assign_tag contact, (3) assign_tag order. Las 3 completan OK y la orden queda con su tag.
actual: Accion #3 falla con "No orderId available in trigger context" (25ms). La orden queda creada pero sin el tag de orden.
errors: Error: No orderId available in trigger context — action-executor.ts:244 (executeAssignTag, entityType=order).
reproduction: Shopify webhook con orden nueva -> automatizacion con create_order + assign_tag(entityType=order) usando la orden recien creada. Pedido #20203 (shopifyOrderId 6646303621356) en workspace a3843b3f-c337-4836-92b5-89c58bb98490, 2026-04-17 18:16:17.
started: Desde que existe la combinacion create_order + accion-que-requiere-context.orderId en la misma automatizacion. Probablemente siempre.

## Eliminated

- Hypothesis: executeCreateOrder no devuelve orderId. FALSE — retorna `{orderId: result.data.orderId}` correctamente (action-executor.ts:594). Se ve en el log del run: action #1 devolvio orderId 5aab5d99-08f7-4853-a89f-98be67893694.

## Evidence

- timestamp: 2026-04-17T18:20
  checked: action-executor.ts executeAssignTag (lines 229-258)
  found: Lee context.orderId cuando entityType='order'. No hay fallback ni resolucion via shopifyOrderId u otro identificador.
  implication: Depende al 100% de que context.orderId este poblado antes del dispatch.

- timestamp: 2026-04-17T18:20
  checked: action-executor.ts executeCreateOrder (lines 486-595) y executeAction (73-148)
  found: Devuelve `{orderId}` pero NUNCA muta context.orderId. La unica mutacion sobre context es contactId/pendingContactReview/_reviewData/_reviewToken, ninguna orderId.
  implication: El orderId se pierde entre acciones.

- timestamp: 2026-04-17T18:20
  checked: inngest/functions/automation-runner.ts processAutomation loop (lines 246-322)
  found: Cada accion corre en `step.run('action-{id}-{i}-{type}', () => executeAction(...))`. El triggerContext se pasa por referencia, PERO Inngest persiste solo el return value del step — las mutaciones in-memory al closure no sobreviven replays. Pattern ya documentado en memoria `inngest_observability_merge.md`.
  implication: El arreglo debe vivir en el scope padre del loop, no dentro de executeAction. Mergear result del step en triggerContext/variableContext despues de cada step.run exitoso.

- timestamp: 2026-04-17T18:20
  checked: action-executor.ts executeDuplicateOrder (lines 601-647)
  found: Tambien genera un orderId nuevo (`result.data.orderId`), devuelto como `{newOrderId}`. Misma clase de problema: acciones posteriores no pueden referenciar la orden duplicada.
  implication: El fix debe cubrir create_order (result.orderId) Y duplicate_order (result.newOrderId).

- timestamp: 2026-04-17T18:20
  checked: variable-resolver.ts buildTriggerContext (lines 143-223)
  found: variableContext es nested: `{orden: {id}, contacto: {nombre}, ...}`. triggerContext es flat: `{orderId, contactId, ...}`. Per memoria "Two automation contexts: TriggerContext (flat) vs variableContext (nested) — never mix".
  implication: Fix debe actualizar AMBOS contextos para que tanto el dispatch (triggerContext.orderId) como variable resolution de params (`{{orden.id}}`) vean el nuevo id.

## Fix plan

En `processAutomation` (src/inngest/functions/automation-runner.ts), despues del `step.run` de cada accion exitosa:

1. Si action.type === 'create_order' y result.orderId es string: mergear a triggerContext.orderId y variableContext.orden.id.
2. Si action.type === 'duplicate_order' y result.newOrderId es string: idem con newOrderId.
3. Scope sobrevive replays porque el result del step es memoizado por Inngest.

Patron extendible: si en el futuro otras acciones crean entidades (create_task -> taskId, etc.), se anaden al mismo merge block.

## Resolution

(pendiente)
