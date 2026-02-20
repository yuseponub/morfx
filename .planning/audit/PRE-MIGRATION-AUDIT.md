# Auditoría Pre-Migración: Resultados

**Fecha:** 2026-02-18
**Alcance:** Revisión profunda de código + Plan de pruebas funcionales
**Archivos analizados:** 30+ archivos en domain, automations, WhatsApp, server actions
**Objetivo:** Verificar que el sistema está listo para datos reales de clientes

---

## 1. Revisión Técnica del Código

### 1.1 Integridad de Datos (Domain Layer)

**8 archivos del domain layer revisados línea por línea.**

**Hallazgos positivos:**
- `orders.ts`: pipeline_id/stage_id usan ON DELETE RESTRICT — impide borrar pipeline con órdenes. Workspace_id filtrado en 100% de queries. 7 funciones, 0 TODOs.
- `contacts.ts`: Manejo correcto de duplicados (código 23505). Bulk create funciona. 4 funciones, 0 TODOs.
- `messages.ts`: Deduplicación por wamid correcta. Fire-and-forget para keyword check es intencional. 5 funciones, 0 TODOs.
- `conversations.ts`: Excelente manejo de race conditions con retry en 23505 para findOrCreateConversation. 4 funciones, 0 TODOs.
- `custom-fields.ts`: Emite triggers per-field correctamente. 2 funciones, 0 TODOs.
- `condition-evaluator.ts`: Robusto — empty group = vacuous truth, numeric fail-safe, unknown operator = false.

**Hallazgos que requieren atención:**

| # | Archivo:Línea | Severidad | Hallazgo |
|---|---|---|---|
| D-1 | `tags.ts:115-116, 133-136, 237-240, 256-260` | MEDIA | Lectura de contacto sin filtro workspace_id al obtener name/phone para contexto de trigger. No permite escritura cross-workspace pero sí lectura de nombre/teléfono. |
| D-2 | `notes.ts:179, 343` | MEDIA | UPDATE de notas sin filtro workspace_id en WHERE. Un usuario podría teóricamente modificar nota de otro workspace si conoce el noteId (UUID). |
| D-3 | `tasks.ts:119` | BAJA | `assigned_to` acepta cualquier UUID sin validar que el usuario exista en el workspace. |
| D-4 | `tasks.ts:216, 302` | BAJA | `completed_at` usa `new Date().toISOString()` (UTC) en vez de timezone Colombia. |
| D-5 | `contacts.ts:399` | BAJA | `bulkCreateContacts` no normaliza teléfonos individualmente antes del insert. |
| D-6 | `messages.ts:140-148` | INFO | Éxito parcial (mensaje enviado pero DB falla) retorna `success: true` — puede causar inconsistencia de facturación. |

**Seguridad de cascadas (eliminación):**

| Padre | Hijo | Comportamiento | Estado |
|---|---|---|---|
| Contacto borrado | orders.contact_id | SET NULL | OK |
| Contacto borrado | contact_tags | CASCADE | OK |
| Orden borrada | order_products | CASCADE | OK |
| Orden borrada | order_tags | CASCADE | OK |
| Pipeline borrado | orders | **RESTRICT** (bloquea) | OK |
| Etapa borrada | orders | **RESTRICT** (bloquea) | OK |
| Tag borrado | contact_tags/order_tags | CASCADE | OK |

**Race conditions:**

| Escenario | Manejo | Estado |
|---|---|---|
| Teléfono duplicado en contacto | 23505 → error claro | OK |
| wamid duplicado en mensaje | 23505 → silencio (retry safe) | OK |
| Conversación duplicada | 23505 + retry automático | Excelente |
| Tag duplicado en contacto | 23505 → tratado como éxito | OK |
| Mover orden concurrente | Sin locking, FK constraint | Aceptable |

---

### 1.2 Robustez de Automatizaciones

**5 archivos del motor revisados línea por línea.**

**Cascade depth (MAX_CASCADE_DEPTH=3):**
- `trigger-emitter.ts:23-36`: Verifica `cascadeDepth >= 3`, suprime evento con log warning.
- `automation-runner.ts:340-347`: Verifica depth antes de cargar automatizaciones.
- **IMPOSIBLE de bypasear** sin modificar constants.ts.
- Resultado: SEGURO.

**Cadena de acciones (error handling):**
- Si acción #2 de 5 falla → acciones 3-5 marcadas como "skipped".
- Antes de cada acción se verifica si la automatización fue deshabilitada mid-execution.
- Inngest reintenta el runner completo hasta 2 veces (`retries: 2`).
- **No hay retry por acción individual** — aceptable para CRM.

**Delays:**
- Usa `step.sleep()` de Inngest con string de duración.
- `delayToMs` soporta seconds/minutes/hours/days.
- MAX_DELAY_DAYS = 30 días en constants.
- **Sin validación en runtime** de que delay.amount respete los límites → delay de 1000 días pasaría a Inngest.

**Hallazgos que requieren atención:**

| # | Archivo:Línea | Severidad | Hallazgo |
|---|---|---|---|
| A-1 | `variable-resolver.ts:64-68` | ALTA | Si `{{unknown.field}}` no existe en contexto, deja el placeholder literal `{{unknown.field}}` en el texto final. Puede enviarse a WhatsApp o guardar en campo. |
| A-2 | `action-executor.ts:268, 203, 684` | MEDIA | No valida existencia de recurso (stage, tag, template) antes de ejecutar acción. Si fue borrado entre trigger y ejecución → error no controlado que corta la cadena. |
| A-3 | `automation-runner.ts:519-544` | MEDIA | Si INSERT de execution record falla, la automatización se ejecuta igual pero sin registro de auditoría. |
| A-4 | `automation-runner.ts:267-271` | BAJA | delay.amount no se valida contra DELAY_LIMITS antes de `step.sleep()`. |

**Cobertura de triggers (13/13):**
order.stage_changed, tag.assigned, tag.removed, contact.created, order.created, field.changed, whatsapp.message_received, whatsapp.keyword_match, task.completed, task.overdue, shopify.order_created, shopify.draft_order_created, shopify.order_updated — todos emitidos correctamente.

---

### 1.3 WhatsApp en Producción

**3 archivos revisados.**

**Seguridad del webhook: CORRECTA**
- HMAC-SHA256 con `crypto.timingSafeEqual` (timing-safe).
- Soporta formatos "sha256=xxx" y hex raw.
- Retorna 401 si firma inválida.
- Payload malformado → 400.
- Siempre retorna 200 para evitar retries de 360dialog.

**Deduplicación: CORRECTA**
- Unique constraint en wamid en mensajes.
- 23505 silenciado como éxito (idempotente para retries).

**Número desconocido:**
- Auto-crea conversación via `findOrCreateConversation`.
- Vincula a contacto existente si el teléfono coincide.
- Si no existe contacto, la conversación queda sin contact_id hasta que se vincule manualmente.

**Hallazgos que requieren atención:**

| # | Archivo:Línea | Severidad | Hallazgo |
|---|---|---|---|
| W-1 | `api.ts:25-51` | ALTA | **No hay rate limiting** para mensajes salientes. Si una automatización dispara para 1000+ contactos, puede exceder el límite de Meta (~80 msg/seg) y causar suspensión temporal. |
| W-2 | `messages.ts:140-148, 224-231, 307-314` | MEDIA | Éxito parcial: mensaje enviado por API (cobrado) pero DB insert falla → retorna `success: true`. El mensaje se cobró pero no aparece en el inbox. |
| W-3 | `action-executor.ts:684-685` | MEDIA | Validación de template approval solo contra DB local, no contra Meta. Si Meta rechazó el template después de aprobarlo, la DB aún dice "APPROVED" pero 360dialog lo rechaza. |
| W-4 | `api.ts:43-48` | BAJA | Error handling genérico: no distingue errores transitorios (5xx, timeout) de permanentes (401, template rechazado). Sin retry-after. |
| W-5 | `api.ts:261-294` | BAJA | Media URLs de 360dialog expiran en 5 minutos. Si hay delay en procesamiento → media no disponible. Falla graceful (null). |

---

### 1.4 Código Temporal/Muerto

**`src/app/api/temp-send-agendados/route.ts` — DEBE ELIMINARSE**

Ruta temporal de 321 líneas que:
- GET: dry run — muestra órdenes en stage "AGENDADO" y qué templates se enviarían
- POST: envía 3 templates WhatsApp (`pedido_recibido`, `direccion_entrega`, `confirmar_compra`) a todas las órdenes en stage "AGENDADO"
- Tiene mapping ciudad→departamento hardcodeado
- Sin autenticación (cualquiera puede hacer POST y enviar mensajes)
- Dice explícitamente: `DELETE THIS FILE after use`
- **RIESGO:** Endpoint público sin auth que envía WhatsApp templates masivamente. **ELIMINAR ANTES DE MIGRACIÓN.**

**TODOs en archivos críticos:**

| Archivo:Línea | TODO | Riesgo para migración |
|---|---|---|
| `conversations.ts:99` | `TODO: fetch from profiles if needed` | NINGUNO — `assigned_name` queda null, cosmético |
| `assignment.ts:163` | `TODO: Check if current user is admin/owner` | BAJO — falta verificar rol admin para reasignar, pero RLS protege |
| `metrics.ts:28, 198` | `TODO: implement response time tracking` | NINGUNO — `avgResponseTimeMs` hardcoded a 0, solo es métrica de dashboard |

**No se encontraron:** datos de test hardcodeados, API keys expuestas, localhost en producción, console.log con datos sensibles.

---

### 1.5 Server Actions — Compliance Domain Layer

**20 archivos de server actions encontrados. 13 analizados en detalle.**

**Completamente compliant (usan domain layer):**
- `orders.ts` — 8 mutaciones via domain
- `contacts.ts` — 11 mutaciones via domain
- `messages.ts` — 3 mutaciones via domain
- `notes.ts` — 3 mutaciones via domain (nota: `custom-fields.ts` también)

**Violaciones del domain layer (escriben directo a Supabase):**

| Archivo | Violaciones | Detalle |
|---|---|---|
| `pipelines.ts` | 8 | CRUD pipeline + CRUD stages — todo directo |
| `automations.ts` | 5 | CRUD automations + toggle — todo directo |
| `teams.ts` | 7 | CRUD teams + members — todo directo |
| `tags.ts` | 3 | CRUD tags — todo directo |
| `conversations.ts` | 7 | markAsRead, unarchive, unlinkContact, updateProfileName, startNew, add/removeTag |
| `tasks.ts` | 4 | CRUD task_types — todo directo |
| `quick-replies.ts` | ~4 | CRUD quick replies — todo directo |
| `workspace.ts` | 2 | update, delete workspace |

**NOTA IMPORTANTE:** Estas violaciones NO son bloqueantes para la migración de datos de órdenes porque:
1. Los módulos afectados (pipelines, teams, tags CRUD, automations CRUD) son de **configuración**, no de datos transaccionales.
2. La cadena crítica (órdenes → contactos → mensajes → WhatsApp) **SÍ pasa por domain layer**.
3. Las violaciones significan que crear/editar pipelines o automations no emite triggers — pero eso es un feature gap, no corrupción de datos.

---

### 1.6 Resumen de Riesgos

| # | Riesgo | Severidad | Categoría | Recomendación |
|---|---|---|---|---|
| R-1 | Ruta temporal `temp-send-agendados` sin auth | **BLOCKER** | Seguridad | Eliminar archivo antes de migración |
| R-2 | Sin rate limiting en WhatsApp saliente | **ALTA** | WhatsApp | Implementar token bucket por workspace (60 msg/seg) |
| R-3 | Variables `{{}}` no resueltas pasan como texto literal | **ALTA** | Automatizaciones | Log warning + fallback a string vacío en vez de placeholder |
| R-4 | Recurso borrado entre trigger y acción → error no controlado | **MEDIA** | Automatizaciones | Validar existencia antes de ejecutar acción |
| R-5 | tags.ts: lectura de contacto sin workspace_id | **MEDIA** | Integridad | Agregar `.eq('workspace_id', ...)` en 4 queries |
| R-6 | notes.ts: UPDATE sin workspace_id filter | **MEDIA** | Integridad | Agregar `.eq('workspace_id', ...)` en 2 updates |
| R-7 | Éxito parcial en mensajes (enviado pero no guardado) | **MEDIA** | WhatsApp | Cambiar a `success: false` cuando DB falla |
| R-8 | Template approval solo verificado contra DB local | **MEDIA** | WhatsApp | Aceptable — 360dialog retorna error claro si no aprobado |
| R-9 | Execution record falla → ejecución sin auditoría | **MEDIA** | Automatizaciones | Fallar automatización si no puede crear registro |
| R-10 | Server actions de config no usan domain layer | **BAJA** | Arquitectura | Deuda técnica — no afecta datos transaccionales |
| R-11 | assigned_to sin validación de existencia | **BAJA** | Integridad | Agregar check contra workspace_members |
| R-12 | Timestamps JS usan UTC en vez de Colombia | **BAJA** | Integridad | Usar `timezone('America/Bogota', NOW())` en DB |
| R-13 | Delay amount sin validación de límites | **BAJA** | Automatizaciones | Validar contra DELAY_LIMITS antes de step.sleep() |

---

## 2. Plan de Pruebas Funcionales

### 2.1 CRM — Órdenes

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-001 | Crear orden completa | 1. Ir a CRM > Pedidos > pipeline existente 2. Click "Nuevo pedido" 3. Llenar: nombre, contacto, valor, productos (2+), dirección envío, ciudad, campos personalizados 4. Guardar | Orden aparece en la etapa correcta con todos los campos. Productos listados. Total calculado. Contacto vinculado. | BLOCKER |
| P-002 | Mover orden entre etapas (drag & drop) | 1. Tener orden en etapa A 2. Arrastrar a etapa B 3. Soltar | Orden se mueve. Trigger `order.stage_changed` debe dispararse (verificar en automation_executions si hay automatización activa). | BLOCKER |
| P-003 | Mover orden (dropdown) | 1. Abrir detalle de orden 2. Cambiar etapa desde el dropdown 3. Verificar | Misma orden, nueva etapa. | MAJOR |
| P-004 | Duplicar orden a otro pipeline | 1. Abrir orden existente 2. Click "Duplicar" 3. Seleccionar otro pipeline 4. Confirmar | Nueva orden creada en el otro pipeline con mismos productos, valor, contacto. Trigger `order.created` disparado. | MAJOR |
| P-005 | Eliminar orden | 1. Seleccionar orden 2. Click eliminar 3. Confirmar | Orden desaparece. No quedan order_products ni order_tags huérfanos (CASCADE). | MAJOR |
| P-006 | Editar orden (cambiar productos) | 1. Abrir orden existente 2. Agregar producto nuevo 3. Cambiar cantidad de producto existente 4. Guardar | Productos actualizados. Total recalculado. | BLOCKER |
| P-007 | Editar orden (cambiar contacto) | 1. Abrir orden 2. Cambiar contacto asociado 3. Guardar | Nuevo contacto vinculado. Campo `contact_id` actualizado. | MAJOR |
| P-008 | Filtrar órdenes por etapa | 1. Ir a vista de pipeline 2. Observar columnas por etapa | Cada columna muestra solo las órdenes de esa etapa. Conteo correcto. | MAJOR |
| P-009 | Buscar orden por nombre | 1. Usar barra de búsqueda 2. Escribir nombre parcial | Resultados filtrados correctamente. | MINOR |
| P-010 | Orden con dirección de envío completa | 1. Crear orden con dirección, ciudad, departamento 2. Guardar y reabrir | Todos los campos de envío guardados y visibles. | BLOCKER |

### 2.2 CRM — Contactos

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-011 | Crear contacto completo | 1. Ir a Contactos 2. Click "Nuevo" 3. Llenar: nombre, teléfono (+57...), email, ciudad, dirección, campos custom 4. Guardar | Contacto creado con todos los campos. Trigger `contact.created` disparado. | BLOCKER |
| P-012 | Asignar tag a contacto | 1. Abrir contacto 2. Click "Agregar tag" 3. Seleccionar tag existente | Tag aparece en el contacto. Trigger `tag.assigned` disparado. | BLOCKER |
| P-013 | Remover tag de contacto | 1. Abrir contacto con tags 2. Click X en el tag | Tag removido. Trigger `tag.removed` disparado. | MAJOR |
| P-014 | Editar contacto | 1. Abrir contacto 2. Cambiar nombre y teléfono 3. Guardar | Datos actualizados correctamente. | MAJOR |
| P-015 | Eliminar contacto con órdenes | 1. Tener contacto con órdenes asociadas 2. Eliminar contacto | Contacto eliminado. Las órdenes deben tener `contact_id = NULL` (SET NULL). Las órdenes NO se borran. | BLOCKER |
| P-016 | Contacto con teléfono duplicado | 1. Intentar crear contacto con teléfono que ya existe en el workspace | Error claro: "Este teléfono ya está registrado". | MAJOR |
| P-017 | Importación CSV de contactos | 1. Preparar CSV con 5+ contactos (nombre, teléfono, email) 2. Ir a Importar 3. Subir CSV 4. Mapear columnas 5. Importar | Todos los contactos creados. Teléfonos normalizados. Duplicados reportados. | MAJOR |
| P-018 | Buscar contacto por nombre o teléfono | 1. Usar búsqueda global 2. Buscar por nombre parcial 3. Buscar por últimos 4 dígitos | Resultados correctos en ambos casos. | MINOR |
| P-019 | Campos personalizados de contacto | 1. Editar contacto 2. Llenar campos custom 3. Guardar y reabrir | Campos custom guardados y visibles. Trigger `field.changed` disparado para cada campo modificado. | MAJOR |

### 2.3 CRM — Pipelines

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-020 | Crear pipeline con etapas | 1. Ir a configuración de pipelines 2. Crear nuevo pipeline 3. Agregar 3+ etapas con nombres 4. Guardar | Pipeline creado con etapas en orden correcto. | BLOCKER |
| P-021 | Reordenar etapas | 1. Abrir pipeline existente 2. Mover etapa B antes de etapa A 3. Guardar | Nuevo orden reflejado en vista kanban. | MAJOR |
| P-022 | Eliminar etapa con órdenes | 1. Tener etapa con 1+ órdenes 2. Intentar eliminar la etapa | **Debe fallar con error claro**: "No se puede eliminar esta etapa porque tiene órdenes". (RESTRICT) | BLOCKER |
| P-023 | Eliminar pipeline completo | 1. Tener pipeline con etapas y órdenes 2. Intentar eliminar | **Debe fallar** si hay órdenes. Si pipeline está vacío, se elimina con sus etapas. | BLOCKER |
| P-024 | Renombrar etapa | 1. Editar nombre de etapa 2. Guardar | Nombre actualizado en kanban y en dropdown de automatizaciones. | MINOR |

### 2.4 Automatizaciones — Triggers

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-025 | Trigger: contact.created | 1. Crear automatización: trigger=contact.created, acción=assign_tag 2. Activarla 3. Crear un contacto nuevo | Tag asignado al contacto automáticamente. Ejecución exitosa en historial. | BLOCKER |
| P-026 | Trigger: order.created | 1. Crear automatización: trigger=order.created, pipeline=X, acción=send_whatsapp_text 2. Activarla 3. Crear orden en pipeline X | WhatsApp enviado al contacto de la orden. | BLOCKER |
| P-027 | Trigger: order.stage_changed | 1. Crear automatización: trigger=order.stage_changed, stage=B, acción=assign_tag 2. Activarla 3. Mover orden de A → B | Tag asignado. | BLOCKER |
| P-028 | Trigger: order.stage_changed (pipeline filtrado) | 1. Crear automatización con pipeline_id y stage_id específicos 2. Mover orden en ESE pipeline/stage 3. Mover orden en OTRO pipeline | Solo dispara para el pipeline/stage configurado. | MAJOR |
| P-029 | Trigger: tag.assigned | 1. Crear automatización: trigger=tag.assigned, tag=X, acción=update_field 2. Activarla 3. Asignar tag X a contacto | Campo actualizado en el contacto. | MAJOR |
| P-030 | Trigger: tag.removed | 1. Crear automatización: trigger=tag.removed, tag=X, acción=create_task 2. Activarla 3. Remover tag X de contacto | Tarea creada. | MAJOR |
| P-031 | Trigger: field.changed | 1. Crear automatización: trigger=field.changed, field=city, acción=assign_tag 2. Activarla 3. Cambiar ciudad del contacto | Tag asignado. | MAJOR |
| P-032 | Trigger: whatsapp.message_received | 1. Crear automatización: trigger=whatsapp.message_received, acción=assign_tag 2. Activarla 3. Enviar mensaje WhatsApp al número de negocio | Tag asignado al contacto del remitente. | BLOCKER |
| P-033 | Trigger: whatsapp.keyword_match | 1. Crear automatización: trigger=whatsapp.keyword_match, keywords=["precio","catalogo"], acción=send_whatsapp_text con mensaje fijo 2. Activarla 3. Enviar "quiero ver el catalogo" | Respuesta automática enviada. | MAJOR |
| P-034 | Trigger: task.completed | 1. Crear automatización: trigger=task.completed, acción=send_whatsapp_text 2. Activarla 3. Marcar tarea como completada | WhatsApp enviado al contacto de la tarea. | MAJOR |
| P-035 | Trigger: task.overdue | 1. Crear automatización: trigger=task.overdue, acción=create_task (follow-up) 2. Activarla 3. Crear tarea con due_date en el pasado y esperar al cron | Nueva tarea de follow-up creada. | MINOR |
| P-036 | Trigger: shopify.order_created | 1. Crear automatización: trigger=shopify.order_created, acción=create_order 2. Activarla 3. Crear orden en Shopify (o simular webhook) | Orden creada en CRM con datos de Shopify. | BLOCKER |
| P-037 | Trigger: shopify.draft_order_created | 1. Similar a P-036 pero con draft_order 2. Crear borrador en Shopify | Orden creada con datos del borrador. | MAJOR |

### 2.5 Automatizaciones — Acciones

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-038 | Acción: assign_tag | 1. Automatización con trigger simple + acción assign_tag con tagName="VIP" 2. Disparar trigger | Tag "VIP" asignado al contacto. Si ya tiene el tag, no duplica (23505 silenciado). | BLOCKER |
| P-039 | Acción: remove_tag | 1. Automatización con acción remove_tag con tagName="Pendiente" 2. Contacto tiene ese tag 3. Disparar | Tag removido del contacto. | MAJOR |
| P-040 | Acción: change_stage | 1. Automatización: trigger=tag.assigned → change_stage a etapa "En proceso" 2. Asignar tag | Orden movida a "En proceso". | BLOCKER |
| P-041 | Acción: update_field | 1. Automatización: acción update_field, fieldName="notes", fieldValue="Procesado automáticamente" 2. Disparar | Campo del contacto actualizado. | MAJOR |
| P-042 | Acción: create_order | 1. Automatización: trigger=contact.created → create_order en pipeline X 2. Crear contacto | Orden creada en pipeline X vinculada al contacto. | BLOCKER |
| P-043 | Acción: duplicate_order | 1. Automatización: trigger=order.stage_changed (a etapa "Confirmar") → duplicate_order a pipeline "Despachos" 2. Mover orden | Orden duplicada con mismos productos y contacto en "Despachos". | MAJOR |
| P-044 | Acción: send_whatsapp_template | 1. Automatización: acción send_whatsapp_template con templateName y variables {{contacto.nombre}} 2. Disparar | Template enviado correctamente con variables resueltas. Verificar en conversación de WhatsApp. | BLOCKER |
| P-045 | Acción: send_whatsapp_text | 1. Automatización: acción send_whatsapp_text con messageText="Hola {{contacto.nombre}}" 2. Disparar | Texto enviado con nombre resuelto. | BLOCKER |
| P-046 | Acción: send_whatsapp_media | 1. Automatización: acción send_whatsapp_media con mediaUrl (imagen pública) 2. Disparar | Imagen enviada al contacto. | MAJOR |
| P-047 | Acción: create_task | 1. Automatización: acción create_task con título y asignación 2. Disparar | Tarea creada, visible en módulo de tareas. | MAJOR |
| P-048 | Acción: webhook | 1. Automatización: acción webhook con URL de webhook.site y payloadTemplate como objeto JSON 2. Disparar | Request llega a webhook.site con payload correcto (no double-encoded). | MAJOR |
| P-049 | Acción: send_sms | 1. Automatización: acción send_sms con messageText 2. Disparar (si Twilio configurado) | SMS enviado al teléfono del contacto. | MINOR |

### 2.6 Automatizaciones — Condiciones

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-050 | Condición que SÍ se cumple | 1. Automatización: trigger=order.created, condición: orden.valor > 100000, acción=assign_tag 2. Crear orden con valor 150000 | Acción ejecutada (tag asignado). | BLOCKER |
| P-051 | Condición que NO se cumple | 1. Misma automatización que P-050 2. Crear orden con valor 50000 | Acción NO ejecutada. Ejecución registrada como "no match" o sin ejecución. | BLOCKER |
| P-052 | Condición equals | 1. Condición: contacto.ciudad equals "Cali" 2. Trigger con contacto de Cali → ejecuta 3. Trigger con contacto de Bogotá → no ejecuta | Comportamiento correcto en ambos casos. | MAJOR |
| P-053 | Condición contains | 1. Condición: orden.nombre contains "VIP" 2. Orden "Pedido VIP #123" → ejecuta 3. Orden "Pedido normal" → no ejecuta | Correctamente. | MAJOR |
| P-054 | Condiciones anidadas (AND dentro de OR) | 1. Grupo OR con: [condición A, grupo AND [condición B, condición C]] 2. Probar: A=true,B=false → ejecuta (OR) 3. Probar: A=false,B=true,C=true → ejecuta (AND) 4. Probar: A=false,B=true,C=false → NO ejecuta | Lógica AND/OR respetada en todos los casos. | MAJOR |

### 2.7 Automatizaciones — Edge Cases

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-055 | Múltiples acciones + delay | 1. Automatización: 3 acciones, delay de 10 segundos entre acción 1 y 2 2. Disparar 3. Esperar | Acción 1 inmediata. Acción 2 después de ~10s. Acción 3 inmediata después de 2. | BLOCKER |
| P-056 | Protección de ciclos | 1. Automatización A: tag.assigned("VIP") → change_stage("Etapa B") 2. Automatización B: order.stage_changed("Etapa B") → assign_tag("VIP") 3. Asignar tag "VIP" | Se ejecutan en cascada pero se detienen al depth 3. No loop infinito. Verificar en logs/ejecuciones. | BLOCKER |
| P-057 | Variables {{}} en textos | 1. Automatización: send_whatsapp_text con "Hola {{contacto.nombre}}, tu pedido {{orden.nombre}} por {{orden.valor}}" 2. Disparar | Texto con variables resueltas correctamente. | BLOCKER |
| P-058 | Tag borrado después de crear automatización | 1. Crear automatización: trigger=tag.assigned(tag X) 2. Borrar tag X del sistema 3. Asignar otro tag | Automatización no debería disparar (tagId no coincide). Si la automatización tenía acción assign_tag con tag borrado → error controlado. | MAJOR |
| P-059 | Etapa borrada después de crear automatización | 1. Automatización: change_stage a etapa Y 2. Borrar etapa Y (si posible — solo si no tiene órdenes) 3. Disparar automatización | Error controlado. Acción falla, se loguea, siguientes acciones skipped. | MAJOR |
| P-060 | Automatización con 5+ acciones, falla #3 | 1. Automatización con 5 acciones, acción #3 tiene un recurso inválido 2. Disparar | Acciones 1,2 ejecutadas. Acción 3 falla. Acciones 4,5 marcadas como "skipped". Log de ejecución muestra todo. | MAJOR |
| P-061 | Deshabilitar automatización mid-execution | 1. Automatización con delay largo entre acciones 2. Disparar 3. Rápidamente deshabilitar la automatización | Acciones pendientes se saltan. Log muestra "disabled mid-execution". | MINOR |

### 2.8 WhatsApp

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-062 | Enviar mensaje de texto | 1. Abrir conversación existente 2. Escribir mensaje 3. Enviar | Mensaje aparece en el chat. Tick de enviado. Verificar en WhatsApp del destinatario. | BLOCKER |
| P-063 | Enviar template con variables | 1. Abrir conversación fuera de ventana de 24h 2. Enviar template con variables | Template enviado correctamente con variables resueltas. | BLOCKER |
| P-064 | Enviar media (imagen) | 1. Abrir conversación 2. Adjuntar imagen 3. Enviar | Imagen visible en ambos lados (CRM y WhatsApp). | MAJOR |
| P-065 | Enviar media (documento) | 1. Adjuntar PDF 2. Enviar | PDF recibido como documento descargable. | MAJOR |
| P-066 | Recibir mensaje de texto | 1. Desde WhatsApp externo, enviar mensaje al número de negocio 2. Verificar en CRM | Mensaje aparece en la conversación correcta. Timestamp correcto. is_read=false. | BLOCKER |
| P-067 | Recibir mensaje de número nuevo | 1. Desde un número que NO tiene contacto ni conversación, enviar mensaje | Conversación creada automáticamente. Número visible. Contacto no creado aún (solo conversación). | BLOCKER |
| P-068 | Recibir imagen | 1. Desde WhatsApp externo, enviar imagen | Imagen visible en la conversación del CRM. Media descargada y almacenada. | MAJOR |
| P-069 | Ventana de 24h | 1. Tener conversación donde último mensaje del cliente fue >24h atrás 2. Intentar enviar texto libre | Debe mostrar opción de enviar template en vez de texto libre. O error claro si intenta enviar texto. | BLOCKER |
| P-070 | Template no aprobado | 1. Intentar enviar template que no tiene status APPROVED en DB | Error claro: "Template no aprobado". No se envía. | MAJOR |

### 2.9 Bot Builder

| ID | Prueba | Pasos | Resultado Esperado | Severidad |
|---|---|---|---|---|
| P-071 | Crear automatización simple via bot | 1. Abrir Bot Builder (/automatizaciones/builder) 2. Pedir: "Crea una automatización que cuando se cree un contacto, le asigne el tag Nuevo" 3. Revisar | Bot crea automatización con trigger=contact.created, action=assign_tag, tagName correcto (NOMBRE, no UUID). | BLOCKER |
| P-072 | Crear automatización compleja via bot | 1. Pedir: "Cuando una orden llegue a etapa Confirmado en el pipeline Ventas, envía un template WhatsApp de confirmación y después de 1 hora crea una tarea de follow-up" 2. Revisar | Trigger con pipelineId+stageId correctos. 2 acciones: send_whatsapp_template + create_task con delay de 1h. Variables del template resueltas. | MAJOR |
| P-073 | Bot respeta NOMBRE vs UUID | 1. Pedir al bot que cree automatización con tag y template 2. Revisar la automatización creada en editor manual | tagName = nombre del tag (no UUID). templateName = nombre del template. pipelineId/stageId = UUIDs. | BLOCKER |
| P-074 | Automatización del bot funciona en editor manual | 1. Crear automatización via bot 2. Ir al editor manual (wizard) 3. Abrir la automatización | Todos los campos se muestran correctamente. Se puede editar y guardar sin errores. | MAJOR |
| P-075 | Modificar automatización existente via bot | 1. Tener automatización existente 2. Pedirle al bot que agregue una condición 3. Revisar | Condiciones agregadas con formato correcto (logic, field, operator, value). Automatización existente actualizada (no duplicada). | MAJOR |
| P-076 | Bot con payloadTemplate JSON | 1. Pedir al bot: "Crea una automatización que envíe un webhook a https://webhook.site/xxx con el nombre y teléfono del contacto" 2. Revisar | payloadTemplate es objeto JSON (no string). Contiene variables {{contacto.nombre}} y {{contacto.telefono}}. | MAJOR |
| P-077 | Validación del bot | 1. Pedir: "Crea automatización que asigne el tag InexistenteXYZ" 2. Revisar validación | Bot debe avisar que el tag no existe (validation.ts lo verifica). | MAJOR |

---

## 3. Checklist Pre-Migración

### Blockers (deben pasar TODOS):

- [ ] **R-1:** Eliminar `src/app/api/temp-send-agendados/route.ts`
- [ ] P-001: Crear orden completa
- [ ] P-002: Mover orden (drag & drop)
- [ ] P-006: Editar orden (productos)
- [ ] P-010: Orden con dirección envío
- [ ] P-011: Crear contacto completo
- [ ] P-012: Asignar tag
- [ ] P-015: Eliminar contacto con órdenes (SET NULL)
- [ ] P-020: Crear pipeline con etapas
- [ ] P-022: Eliminar etapa con órdenes (RESTRICT)
- [ ] P-023: Eliminar pipeline con órdenes (RESTRICT)
- [ ] P-025: Trigger contact.created
- [ ] P-026: Trigger order.created
- [ ] P-027: Trigger order.stage_changed
- [ ] P-032: Trigger whatsapp.message_received
- [ ] P-036: Trigger shopify.order_created
- [ ] P-038: Acción assign_tag
- [ ] P-040: Acción change_stage
- [ ] P-042: Acción create_order
- [ ] P-044: Acción send_whatsapp_template
- [ ] P-045: Acción send_whatsapp_text
- [ ] P-050: Condición que sí se cumple
- [ ] P-051: Condición que no se cumple
- [ ] P-055: Múltiples acciones + delay
- [ ] P-056: Protección de ciclos
- [ ] P-057: Variables {{}} resueltas
- [ ] P-062: Enviar WhatsApp texto
- [ ] P-063: Enviar template con variables
- [ ] P-066: Recibir mensaje
- [ ] P-067: Recibir de número nuevo
- [ ] P-069: Ventana 24h
- [ ] P-071: Bot crea automatización simple
- [ ] P-073: Bot respeta NOMBRE vs UUID

### Major (deben pasar o tener workaround documentado):

- [ ] P-003 a P-009: Órdenes restantes
- [ ] P-013, P-014, P-016-P-019: Contactos restantes
- [ ] P-021, P-024: Pipelines restantes
- [ ] P-028-P-037: Triggers restantes
- [ ] P-039-P-049: Acciones restantes
- [ ] P-052-P-054: Condiciones restantes
- [ ] P-058-P-060: Edge cases restantes
- [ ] P-064, P-065, P-068, P-070: WhatsApp restantes
- [ ] P-072, P-074-P-077: Bot Builder restantes

### Deuda técnica aceptada:

- [ ] Server actions de configuración no pasan por domain layer (R-10)
- [ ] `avgResponseTimeMs` hardcoded a 0 en métricas de agentes
- [ ] `assigned_name` en conversaciones es null (cosmético)
- [ ] Rate limiting WhatsApp no implementado (riesgo solo con volúmenes altos)

### Código temporal eliminado:

- [ ] `src/app/api/temp-send-agendados/route.ts` — ELIMINADO

### TODOs documentados como deuda:

- [ ] `conversations.ts:99` — TODO: fetch from profiles — cosmético
- [ ] `assignment.ts:163` — TODO: check admin role — bajo riesgo (RLS protege)
- [ ] `metrics.ts:28,198` — TODO: response time tracking — solo dashboard
