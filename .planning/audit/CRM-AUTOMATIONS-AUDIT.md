# AUDITORIA CRM + AUTOMATIZACIONES

**Fecha:** 2026-02-17
**Archivos analizados:** 15+ archivos core leidos completos
**Agentes paralelos:** 6 agentes de auditoria

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad | Descripcion |
|-----------|----------|-------------|
| CRITICAL | 5 | Variables siempre vacias, ciclo-detection roto |
| MAJOR | 8 | Datos faltantes, validaciones ausentes, ghost params |
| MINOR | 12 | Inconsistencias de catalogo, UX, tipos |

---

## SECCION 1: GAPS CRITICOS — Variables que SIEMPRE resuelven vacias

Estas variables estan en VARIABLE_CATALOG (el usuario las ve como opciones), pero por key-name mismatches entre el emitter y el resolver, **NUNCA tienen valor en runtime**.

### GAP C1: `field.changed` — `campo.valor_anterior` y `campo.valor_nuevo`

| Componente | Key que usa |
|---|---|
| Emitter (`emitFieldChanged`) | `previousValue`, `newValue` |
| Resolver (`buildTriggerContext`) | `eventData.fieldPreviousValue`, `eventData.fieldNewValue` |

**El emitter envia `previousValue`/`newValue`, pero el resolver busca `fieldPreviousValue`/`fieldNewValue`. Nunca coinciden.**

- **Archivo:** `src/lib/automations/trigger-emitter.ts` (emitter) vs `src/lib/automations/variable-resolver.ts` (resolver)
- **Impacto:** `{{campo.valor_anterior}}` y `{{campo.valor_nuevo}}` SIEMPRE vacios en templates y condiciones
- **Fix:** Alinear keys — cambiar resolver a leer `previousValue`/`newValue`, o cambiar emitter a enviar `fieldPreviousValue`/`fieldNewValue`

### GAP C2: `whatsapp.*` — `mensaje.telefono`

| Componente | Key que usa |
|---|---|
| Emitter (`emitWhatsAppMessageReceived/KeywordMatch`) | `phone` |
| Resolver (`buildTriggerContext`) | `eventData.messagePhone` |

**El emitter envia `phone`, el resolver busca `messagePhone`. Nunca coinciden.**

- **Impacto:** `{{mensaje.telefono}}` SIEMPRE vacio en ambos triggers de WhatsApp
- **Fix:** En resolver, mapear `eventData.phone` -> `mensaje.telefono`

### GAP C3: `whatsapp.message_received` — `contacto.telefono`

| Componente | Key que usa |
|---|---|
| Emitter | `phone` (no `contactPhone`) |
| Resolver | `eventData.contactPhone` |
| Runner (`buildContextFromEvent`) | `contactPhone ?? phone` (OK para triggerContext) |

**El runner tiene fallback para triggerContext (condiciones), pero el resolver para variableContext (templates) NO tiene fallback.**

- **Impacto:** `{{contacto.telefono}}` vacio en templates de WhatsApp. Condiciones SI funcionan.
- **Fix:** En resolver, agregar fallback: `eventData.contactPhone ?? eventData.phone`

### GAP C4: `task.overdue` — `tarea.fecha_limite`

| Componente | Key que usa |
|---|---|
| Emitter (`emitTaskOverdue`) | `dueDate` |
| Resolver (`buildTriggerContext`) | `eventData.taskDueDate` |

**Mismatch: `dueDate` vs `taskDueDate`.**

- **Impacto:** `{{tarea.fecha_limite}}` SIEMPRE vacio
- **Fix:** En resolver, leer `eventData.dueDate`, o en emitter enviar como `taskDueDate`

### GAP C5: Cycle detection en AI Builder completamente roto

**3 bugs combinados en `src/lib/builder/validation.ts` funcion `conditionsPreventActivation`:**

1. **Accede `.rules` en vez de `.conditions`** (linea 369-373) — `ConditionGroup` tiene `.conditions`, no `.rules`. El check siempre retorna `false`.
2. **Usa field names en INGLES** (`order.stage`, `order.pipeline`) cuando el runtime usa ESPANOL (`orden.stage_id`, `orden.pipeline_id`).
3. **No maneja ConditionGroups anidados** — solo lee el primer nivel.

**Impacto:** El cycle detection NUNCA considera condiciones. Produce false-positive warnings/blockers que confunden al AI builder y al usuario.

---

## SECCION 2: GAPS MAYORES — Datos faltantes o validaciones ausentes

### GAP M1: `contact.created` — `contacto.departamento` y `contacto.direccion` prometidos pero no enviados

- **VARIABLE_CATALOG** declara `contacto.departamento` y `contacto.direccion` para `contact.created`
- **Emitter** (`emitContactCreated`) NO acepta `contactDepartment` ni `contactAddress`
- **Domain** (`createContact`) no puede enviarlos
- **Impacto:** Variables visibles en UI pero siempre vacias. Sin enrichment para contact.created.
- **Fix:** Agregar `contactDepartment` y `contactAddress` como opcionales al emitter, y pasarlos desde domain

### GAP M2: `task.completed`/`task.overdue` — `contacto.nombre` y `tarea.descripcion` nunca enviados

- **Emitter** (`emitTaskCompleted/Overdue`) NO acepta `contactName` ni `taskDescription`
- **No hay enrichment** en el runner para triggers de tareas
- **Impacto:** `{{contacto.nombre}}` y `{{tarea.descripcion}}` siempre vacios en automaciones de tareas
- **Fix:** Agregar enrichment en runner (cargar contacto y descripcion desde DB), o agregar campos al emitter y pasarlos desde domain

### GAP M3: `emitTaskOverdue` sin `await` en task-overdue-cron

- **Archivo:** `src/inngest/functions/task-overdue-cron.ts` linea 77
- **El emit NO tiene await.** Viola la regla documentada en trigger-emitter.ts lineas 7-9.
- **Corre en un for-loop FUERA de un step.run()**, lo que significa que la funcion Inngest puede retornar antes de que todos los eventos se envien.
- **Impacto:** Eventos de tareas vencidas pueden perderse silenciosamente
- **Fix:** Agregar `await` antes de `emitTaskOverdue`

### GAP M4: Runner `buildContextFromEvent` lee `totalValue` en vez de `orderValue`

- **Archivo:** `src/inngest/functions/automation-runner.ts` linea 151
- Todos los emitters envian `orderValue`, pero `buildContextFromEvent` lee `eventData.totalValue`
- **Impacto:** `triggerContext.orderValue` es undefined para evaluacion de condiciones (antes de enrichment). El variableContext funciona correctamente.
- **Fix:** Cambiar `eventData.totalValue` a `eventData.orderValue` en buildContextFromEvent

### GAP M5: ACTION_CATALOG — `change_stage.pipelineId` declarado required pero executor nunca lo lee

- **ACTION_CATALOG** declara `pipelineId` como `required: true` para `change_stage`
- **Executor** solo lee `params.stageId`, nunca `params.pipelineId`
- **Impacto:** El catalogo misleadea al AI builder y a la UI. El pipelineId solo sirve para filtrar stages en la UI.
- **Fix:** Cambiar `required: false` o agregar comentario de que es UI-only

### GAP M6: Ghost params — Executor lee params que no existen en ACTION_CATALOG

| Accion | Ghost Param | Linea executor | Impacto |
|---|---|---|---|
| `create_order` | `customFields` | 427-429 | No se puede configurar via UI/builder. Codigo muerto. |
| `send_whatsapp_template` | `headerMediaUrl` | 722 | Templates con media header no pueden override URL. Cae a URL placeholder. |
| `webhook` | `payload` | 1018 | Alias backward-compat para `payloadTemplate`. Funciona pero no documentado. |

### GAP M7: `createAutomation`/`updateAutomation` no llaman `validateResources()`

- **Archivo:** `src/lib/builder/tools.ts` lineas 571-635 y 640-731
- `validateResources()` solo se llama en `generatePreview`, no en `createAutomation`/`updateAutomation`
- **Impacto:** Si el AI salta preview o si un recurso se borra entre preview y creacion, se insertan refs invalidas en DB
- **Fix:** Agregar `validateResources()` en createAutomation y updateAutomation

### GAP M8: `update_field.value` required pero sin validacion en executor

- **ACTION_CATALOG** declara `value` como `required: true`
- **Executor** lee `params.value` sin validar que exista
- **Impacto:** Podria setear campo a undefined/null — corrupcion silenciosa de datos
- **Fix:** Agregar `if (value === undefined || value === null) throw`

---

## SECCION 3: GAPS MENORES

### GAP m1: `tag.color` — en TRIGGER_CATALOG y resolver pero no en VARIABLE_CATALOG

- `tag.color` esta en `TRIGGER_CATALOG.variables` para `tag.assigned` y el resolver mapea `eventData.tagColor`
- Pero NO esta en `VARIABLE_CATALOG['tag.assigned']`
- El emitter tampoco declara `tagColor`
- **Impacto:** Triple inconsistencia. Variable existiria en runtime si se arregla emitter, pero UI no la ofrece.

### GAP m2: TRIGGER_CATALOG.variables desincronizado con VARIABLE_CATALOG

- VARIABLE_CATALOG tiene mas entries que TRIGGER_CATALOG.variables para varios triggers
- VARIABLE_CATALOG es la fuente de verdad para la UI, asi que no es un bug funcional
- **Impacto:** Solo informacional/confuso para quien lea el codigo

### GAP m3: `contactName` no se pasa en `emitFieldChanged` desde orders.ts

- **Archivo:** `src/lib/domain/orders.ts` lineas 417 y 435
- `updateOrder` emite `emitFieldChanged` sin `contactName`
- El mismo emit desde contacts.ts SI pasa `contactName` (linea 277)
- **Impacto:** `{{contacto.nombre}}` vacio cuando el trigger es cambio de campo en orden

### GAP m4: `contactPhone` no se pasa en `emitTagRemoved`

- **Archivo:** `src/lib/domain/tags.ts` linea 263
- `removeTag` fetcha `contact.name` pero no `contact.phone`
- `assignTag` SI fetcha ambos (name + phone)
- **Impacto:** `{{contacto.telefono}}` vacio en tag.removed pero no en tag.assigned

### GAP m5: `contactName` no se pasa en `emitFieldChanged` desde custom-fields.ts

- **Archivo:** `src/lib/domain/custom-fields.ts` linea 101
- Nunca fetcha el nombre del contacto
- **Impacto:** `{{contacto.nombre}}` vacio cuando trigger es cambio de campo custom en contacto

### GAP m6: VARIABLE_CATALOG sin metadata de tipo

- Variables no tienen `type: 'number'|'string'|'date'`
- La UI muestra TODOS los operadores (gt, lt, contains) para TODOS los campos
- **Impacto:** Usuario puede crear `contacto.nombre gt "5"` — no crashea pero siempre false

### GAP m7: Shopify `tags` siempre null

- **Archivo:** `src/lib/shopify/webhook-handler.ts` lineas 127, 172, 275
- Los 3 handlers Shopify pasan `tags: null` aunque el payload tiene `order.tags`
- **Impacto:** `{{shopify.tags}}` siempre vacio

### GAP m8: Shopify webhooks bypasean emitter functions

- Webhook handler usa `inngest.send` directo en vez de `emitShopifyOrderCreated` etc.
- Las funciones emitter para Shopify en trigger-emitter.ts nunca se llaman
- **Impacto:** Duplicacion de codigo, riesgo de drift si se modifica el emitter

### GAP m9: Type definitions en events.ts incompletas para Shopify

- `shippingDepartment` falta en los 3 tipos de evento Shopify
- `shippingCity` falta en `shopify.draft_order_created`
- No afecta runtime porque se usa `as any`, pero types no reflejan realidad

### GAP m10: Select options sin validacion runtime en executor

- `entityType` en assign_tag/remove_tag/update_field: no valida que sea 'contact' o 'order'
- `language` en send_whatsapp_template: no valida que sea 'es', 'en', 'pt'
- `priority` en create_task: no valida opciones
- **Impacto:** Valores invalidos caen a defaults silenciosamente o fallan en API externa

### GAP m11: `trigger_type` en AI Builder es `z.string()` sin enum

- **Archivo:** `src/lib/builder/tools.ts`
- No valida contra TriggerType union ni TRIGGER_CATALOG
- **Impacto:** AI podria generar trigger type invalido (improbable pero sin defensa)

### GAP m12: `trigger_config.tagId` no validado por `validateResources`

- **Archivo:** `src/lib/builder/validation.ts` lineas 58-93
- Tags en trigger_config no se verifican contra workspace tags
- **Impacto:** Tag UUID invalido en trigger_config = automatizacion silenciosamente rota

---

## SECCION 4: TABLAS DETALLADAS POR TRIGGER

### 4.1 `order.stage_changed` — Traza de variables

| Variable | eventData key | Emitter | Resolver | Runner | ESTADO |
|---|---|---|---|---|---|
| `orden.id` | `orderId` | SI | SI | SI | OK |
| `orden.nombre` | `orderName` | SI | SI | SI (enrichment) | OK |
| `orden.valor` | `orderValue` | SI | SI | Runner lee `totalValue` | **GAP M4** |
| `orden.stage_anterior` | `previousStageName` | SI | SI | SI | OK |
| `orden.stage_nuevo` | `newStageName` | SI | SI | SI | OK |
| `orden.pipeline` | `pipelineName` | SI | SI | SI | OK |
| `orden.direccion_envio` | `shippingAddress` | SI | SI | SI | OK |
| `orden.ciudad_envio` | `shippingCity` | SI | SI | SI | OK |
| `orden.departamento_envio` | `shippingDepartment` | SI | SI | SI | OK |
| `orden.descripcion` | `orderDescription` | SI | SI | SI | OK |
| `contacto.nombre` | `contactName` | SI | SI | SI | OK |
| `contacto.telefono` | `contactPhone` | SI | SI | SI | OK |
| `contacto.email` | `contactEmail` | NO en emitter | SI | SI (enrichment) | PARTIAL |
| `contacto.ciudad` | `contactCity` | SI | SI | SI | OK |
| `contacto.departamento` | `contactDepartment` | SI | SI | SI | OK |
| `contacto.direccion` | `contactAddress` | SI | SI | SI | OK |

### 4.2 `tag.assigned` — Traza de variables

| Variable | eventData key | Emitter | Resolver | Runner | ESTADO |
|---|---|---|---|---|---|
| `tag.nombre` | `tagName` | SI | SI | SI | OK |
| `entidad.tipo` | `entityType` | SI | SI | NO en buildContext | PARTIAL |
| `entidad.id` | `entityId` | SI | SI | NO en buildContext | PARTIAL |
| `contacto.nombre` | `contactName` | SI | SI | SI | OK |
| `contacto.telefono` | `contactPhone` | SI | SI | SI | OK |
| `orden.pipeline_id` | `pipelineId` | SI | SI | SI (enrichment) | OK |
| `orden.stage_id` | `stageId` | SI | SI | NO en buildContext | PARTIAL |
| `orden.id` | `orderId` | SI | SI | SI | OK |
| `orden.valor` | `orderValue` | NO en emitter | SI | enrichment | PARTIAL |
| `orden.nombre` | `orderName` | NO en emitter | SI | enrichment | PARTIAL |

### 4.3 `contact.created` — Traza de variables

| Variable | eventData key | Emitter | Resolver | Runner | ESTADO |
|---|---|---|---|---|---|
| `contacto.id` | `contactId` | SI | SI | SI | OK |
| `contacto.nombre` | `contactName` | SI | SI | SI | OK |
| `contacto.telefono` | `contactPhone` | SI | SI | SI | OK |
| `contacto.email` | `contactEmail` | SI | SI | SI | OK |
| `contacto.ciudad` | `contactCity` | SI | SI | SI | OK |
| `contacto.departamento` | `contactDepartment` | NO | SI | NO | **GAP M1** |
| `contacto.direccion` | `contactAddress` | NO | SI | NO | **GAP M1** |

### 4.4 `field.changed` — Traza de variables

| Variable | eventData key | Emitter | Resolver | Runner | ESTADO |
|---|---|---|---|---|---|
| `campo.nombre` | `fieldName` | SI | SI | NO | PARTIAL |
| `campo.valor_anterior` | `previousValue` vs `fieldPreviousValue` | SI (`previousValue`) | SI (`fieldPreviousValue`) | NO | **GAP C1** |
| `campo.valor_nuevo` | `newValue` vs `fieldNewValue` | SI (`newValue`) | SI (`fieldNewValue`) | NO | **GAP C1** |
| `entidad.tipo` | `entityType` | SI | SI | NO | PARTIAL |
| `entidad.id` | `entityId` | SI | SI | NO | PARTIAL |

### 4.5 `whatsapp.message_received` — Traza de variables

| Variable | eventData key | Emitter | Resolver | Runner | ESTADO |
|---|---|---|---|---|---|
| `mensaje.contenido` | `messageContent` | SI | SI | SI | OK |
| `mensaje.telefono` | `phone` vs `messagePhone` | SI (`phone`) | SI (`messagePhone`) | NO | **GAP C2** |
| `conversacion.id` | `conversationId` | SI | SI | SI | OK |
| `contacto.nombre` | `contactName` | SI (opcional) | SI | SI | OK |
| `contacto.telefono` | `contactPhone` vs `phone` | NO (`phone` only) | SI (`contactPhone`) | SI (fallback) | **GAP C3** |

### 4.6 `task.completed` / `task.overdue` — Traza de variables

| Variable | Trigger | eventData key | Emitter | Resolver | ESTADO |
|---|---|---|---|---|---|
| `tarea.id` | ambos | `taskId` | SI | SI | OK |
| `tarea.titulo` | ambos | `taskTitle` | SI | SI | OK |
| `tarea.descripcion` | completed | `taskDescription` | NO | SI | **GAP M2** |
| `tarea.fecha_limite` | overdue | `dueDate` vs `taskDueDate` | SI (`dueDate`) | SI (`taskDueDate`) | **GAP C4** |
| `contacto.nombre` | ambos | `contactName` | NO | SI | **GAP M2** |
| `orden.id` | ambos | `orderId` | SI | SI | OK |

---

## SECCION 5: ACTION_CATALOG vs EXECUTOR — Tabla completa

| Accion | Param | Catalogo type | required | Executor lee | Match | Validacion | ESTADO |
|---|---|---|---|---|---|---|---|
| `assign_tag` | `tagName` | select | SI | SI | SI | throw if empty | OK |
| `assign_tag` | `entityType` | select | NO | SI | SI | default 'contact' | OK |
| `remove_tag` | `tagName` | select | SI | SI | SI | throw if empty | OK |
| `remove_tag` | `entityType` | select | NO | SI | SI | default 'contact' | OK |
| `change_stage` | `pipelineId` | select | **SI** | **NO** | N/A | N/A | **GAP M5** |
| `change_stage` | `stageId` | select | SI | SI | SI | throw if empty | OK |
| `update_field` | `entityType` | select | SI | SI | SI | default 'contact' (no throw) | WEAK |
| `update_field` | `fieldName` | field_select | SI | SI | SI | throw if empty | OK |
| `update_field` | `value` | text | SI | SI | SI | **NO validation** | **GAP M8** |
| `create_order` | `pipelineId` | select | SI | SI | SI | throw if empty | OK |
| `create_order` | (10 optional params) | various | NO | SI | SI | optional | OK |
| `create_order` | **`customFields`** | **NO EXISTE** | -- | SI | N/A | N/A | **GAP M6** |
| `duplicate_order` | `targetPipelineId` | select | SI | SI | SI | throw if empty | OK |
| `duplicate_order` | (5 optional params) | various | NO | SI | SI | optional | OK |
| `send_whatsapp_template` | `templateName` | select | SI | SI | SI | throw if empty | OK |
| `send_whatsapp_template` | `language` | select | NO | SI | SI | default from template | OK |
| `send_whatsapp_template` | `variables` | key_value | NO | SI | SI | default {} | OK |
| `send_whatsapp_template` | **`headerMediaUrl`** | **NO EXISTE** | -- | SI | N/A | N/A | **GAP M6** |
| `send_whatsapp_text` | `text` | textarea | SI | SI | SI | throw if empty | OK |
| `send_whatsapp_media` | `mediaUrl` | text | SI | SI | SI | throw if empty | OK |
| `send_whatsapp_media` | `caption` | text | NO | SI | SI | optional | OK |
| `send_whatsapp_media` | `filename` | text | NO | SI | SI | optional | OK |
| `create_task` | `title` | text | SI | SI | SI | throw if empty | OK |
| `create_task` | (4 optional params) | various | NO | SI | SI | optional | OK |
| `webhook` | `url` | text | SI | SI | SI | throw if empty | OK |
| `webhook` | `headers` | key_value | NO | SI | SI | optional | OK |
| `webhook` | `payloadTemplate` | json | NO | SI | SI | optional | OK |
| `webhook` | **`payload`** | **NO EXISTE** | -- | SI (alias) | N/A | N/A | **GAP M6** |
| `send_sms` | `body` | textarea | SI | SI | SI | throw if empty | OK |
| `send_sms` | `to` | text | NO | SI | SI | fallback contactPhone | OK |
| `send_sms` | `mediaUrl` | text | NO | SI | SI | optional (MMS) | OK |

---

## SECCION 6: EMIT CALLERS — Tabla completa

| # | Archivo | Linea | Funcion emit | Campos faltantes | await | ESTADO |
|---|---|---|---|---|---|---|
| 1 | `domain/orders.ts` | 263 | `emitOrderCreated` | Ninguno | SI | OK |
| 2 | `domain/orders.ts` | 417 | `emitFieldChanged` | `contactName` | SI | **m3** |
| 3 | `domain/orders.ts` | 435 | `emitFieldChanged` | `contactName` | SI | **m3** |
| 4 | `domain/orders.ts` | 532 | `emitOrderStageChanged` | Ninguno | SI | OK |
| 5 | `domain/orders.ts` | 765 | `emitOrderCreated` | Ninguno | SI | OK |
| 6 | `domain/orders.ts` | 795 | `emitOrderCreated` | Ninguno | SI | OK |
| 7 | `domain/contacts.ts` | 158 | `emitContactCreated` | Ninguno | SI | OK |
| 8 | `domain/contacts.ts` | 277 | `emitFieldChanged` | Ninguno | SI | OK |
| 9 | `domain/contacts.ts` | 298 | `emitFieldChanged` | Ninguno | SI | OK |
| 10 | `domain/contacts.ts` | 417 | `emitContactCreated` | Ninguno | SI | OK |
| 11 | `domain/tags.ts` | 144 | `emitTagAssigned` | Ninguno | SI | OK |
| 12 | `domain/tags.ts` | 263 | `emitTagRemoved` | `contactPhone` | SI | **m4** |
| 13 | `domain/messages.ts` | 395 | `emitWhatsAppMessageReceived` | Ninguno | SI | OK |
| 14 | `domain/messages.ts` | 463 | `emitWhatsAppKeywordMatch` | Ninguno | SI | OK |
| 15 | `domain/custom-fields.ts` | 101 | `emitFieldChanged` | `contactName` | SI | **m5** |
| 16 | `domain/tasks.ts` | 131 | `emitTaskCompleted` | Ninguno | SI | OK |
| 17 | `domain/tasks.ts` | 227 | `emitTaskCompleted` | Ninguno | SI | OK |
| 18 | `domain/tasks.ts` | 290 | `emitTaskCompleted` | Ninguno | SI | OK |
| 19 | `inngest/task-overdue-cron.ts` | 77 | `emitTaskOverdue` | Ninguno | **NO** | **GAP M3** |
| 20 | `shopify/webhook-handler.ts` | 127 | `inngest.send` directo | `tags` null | SI | **m7** |
| 21 | `shopify/webhook-handler.ts` | 172 | `inngest.send` directo | `tags` null | SI | **m7** |
| 22 | `shopify/webhook-handler.ts` | 275 | `inngest.send` directo | `tags` null | SI | **m7** |
| 23 | `shopify/webhook-handler.ts` | 354 | `inngest.send` directo | Ninguno | SI | OK |

---

## SECCION 7: PRIORIZACION DE FIXES

### Ola 1 — Key mismatches (arregla variables siempre vacias)

| ID | Fix | Archivos | Complejidad |
|---|---|---|---|
| C1 | Alinear `previousValue`/`newValue` en resolver | `variable-resolver.ts` | Baja |
| C2 | Mapear `phone` -> `mensaje.telefono` en resolver | `variable-resolver.ts` | Baja |
| C3 | Fallback `contactPhone ?? phone` en resolver | `variable-resolver.ts` | Baja |
| C4 | Alinear `dueDate`/`taskDueDate` en resolver | `variable-resolver.ts` | Baja |
| M4 | Cambiar `totalValue` a `orderValue` en runner | `automation-runner.ts` | Baja |

**Todos son 1-line fixes en el resolver/runner. Maximo impacto con minimo riesgo.**

### Ola 2 — Datos faltantes en emitters

| ID | Fix | Archivos | Complejidad |
|---|---|---|---|
| M1 | Agregar `contactDepartment`/`contactAddress` a `emitContactCreated` | `trigger-emitter.ts`, `domain/contacts.ts` | Baja |
| M2 | Agregar enrichment para tasks en runner (cargar contacto + descripcion) | `automation-runner.ts` | Media |
| M3 | Agregar `await` a `emitTaskOverdue` en cron | `task-overdue-cron.ts` | Baja |
| m3 | Pasar `contactName` en `emitFieldChanged` desde orders | `domain/orders.ts` | Baja |
| m4 | Pasar `contactPhone` en `emitTagRemoved` | `domain/tags.ts` | Baja |
| m5 | Pasar `contactName` en `emitFieldChanged` desde custom-fields | `domain/custom-fields.ts` | Baja |

### Ola 3 — Validaciones y catalogo

| ID | Fix | Archivos | Complejidad |
|---|---|---|---|
| C5 | Arreglar `conditionsPreventActivation` (3 bugs) | `builder/validation.ts` | Media |
| M5 | `change_stage.pipelineId` -> `required: false` | `constants.ts` | Baja |
| M6 | Agregar `headerMediaUrl` a ACTION_CATALOG | `constants.ts` | Baja |
| M7 | Agregar `validateResources` en createAutomation/updateAutomation | `builder/tools.ts` | Baja |
| M8 | Validar `value` en `executeUpdateField` | `action-executor.ts` | Baja |

### Ola 4 — Limpieza menor

| ID | Fix | Archivos | Complejidad |
|---|---|---|---|
| m1 | Agregar `tag.color` a VARIABLE_CATALOG o remover de TRIGGER_CATALOG | `constants.ts` | Baja |
| m7 | Pasar `order.tags` en vez de null en Shopify handlers | `webhook-handler.ts` | Baja |
| m9 | Agregar `shippingDepartment` a tipos Inngest Shopify | `events.ts` | Baja |

---

## SECCION 8: LO QUE FUNCIONA BIEN

1. **Enrichment de ordenes** en el runner es robusto — carga orden completa + contacto para order.created, order.stage_changed, tag.assigned/removed (entityType=order)
2. **Cascade depth** correctamente propagado en todos los action-executor -> domain -> emitter paths
3. **resolveOrCreateContact** en action-executor maneja correctamente contactos sin ID
4. **Conditions UI** driven directamente por VARIABLE_CATALOG — zero risk de drift
5. **Pipeline/stage UUID resolution** en conditions UI bien implementado
6. **validateActionParams** en AI builder valida param names y required en preview Y creacion
7. **System prompt generado dinamicamente** desde catalogs — no puede quedar desincronizado
8. **Todos los context dependencies** en action-executor validados con throws
9. **Todos los emits tienen await** excepto el de task-overdue-cron (GAP M3)
10. **Domain layer** consistentemente usado para mutaciones desde action-executor

---

*Fin de auditoria. Esperando revision del usuario antes de proceder con fixes.*
