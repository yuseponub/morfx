# Phase 27: Robot OCR de Guias — CONTEXT

> Decisions captured during `/gsd:discuss-phase 27` on 2026-02-23.
> These decisions are LOCKED — downstream agents (researcher, planner) must follow them.

---

## Phase Goal (from ROADMAP)

A robot reads physical/PDF shipping guides, verifies shipping data integrity, and extracts guide numbers to update CRM orders.

## Reference System

The current OCR robot is a standalone Express.js server using Claude Vision (Sonnet 4) for extraction, orchestrated by n8n workflows triggered from Slack, matching against Bigin CRM. Full documentation:

- **Funcionalidades:** [DOCUMENTACION_OCR_GUIAS_BOT.md](https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/Agentes%20Logistica/ocr-guias-bot/documentacion-completa/DOCUMENTACION_OCR_GUIAS_BOT.md)
- **Flujos n8n:** [DOCUMENTACION_FLUJO_N8N_OCR.md](https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/Agentes%20Logistica/ocr-guias-bot/documentacion-completa/DOCUMENTACION_FLUJO_N8N_OCR.md)

### Key Concepts from Reference

| Concepto | Detalle |
|----------|---------|
| OCR Engine | Claude Vision (Sonnet 4) — extrae datos estructurados de imagenes |
| Datos extraidos | numeroGuia, destinatario, direccion, ciudad, telefono, remitente, transportadora, confianza (0-100) |
| Transportadoras | Envia, Inter, Coordinadora, Servientrega |
| Match inteligente | Compara datos OCR contra ordenes del CRM con confianza ponderada |
| Umbral auto-update | >= 70% confianza |
| Validacion | Discrepancias por severidad (alta/media/baja) |

---

## Decisions

### 1. Fuentes y Formato de Entrada

| Decision | Valor |
|----------|-------|
| **Metodo de entrada** | Upload/drag & drop en Chat de Comandos |
| **Volumen** | Individual o lotes (varias fotos a la vez) |
| **Deteccion de transportadora** | Automatica por OCR (el usuario NO especifica transportadora) |
| **Formatos soportados** | JPG, PNG, WebP + PDF |
| **Almacenamiento** | Subir a Supabase Storage, procesar por URL |

**Implicaciones:**
- El Chat de Comandos necesita soporte de drag & drop / file upload para imagenes
- El prompt de Claude Vision debe incluir deteccion de transportadora como campo obligatorio
- Soporte PDF requiere conversion o envio directo a Claude Vision (soporta PDF nativo)

### 2. Extraccion y Matching

| Decision | Valor |
|----------|-------|
| **Prioridad de matching** | Telefono > Nombre > Ciudad > Direccion |
| **Matching inteligente** | Cascading: si un criterio no coincide, se sigue con el siguiente |
| **Direccion** | Ultimo criterio (mas propenso a variaciones de formato colombiano) |
| **Filtro de pedidos elegibles** | Pedidos en etapa especifica del pipeline (equivalente a "ESPERANDO GUIAS") |
| **Destino del numero de guia** | Campo `carrier_guide_number` en tabla `orders` |
| **Normalizacion telefono** | Ignorar prefijo 57, espacios, guiones (como robot actual) |
| **Normalizacion direccion** | Abreviaturas colombianas: CL=Calle, CR/KR=Carrera, AV=Avenida, DG=Diagonal, TV=Transversal |

**Implicaciones:**
- El matching se ejecuta server-side (Inngest step o API route), NO en Claude Vision
- Se necesita funcion de normalizacion de telefono y direccion colombiana
- Se debe consultar orders filtradas por pipeline stage + workspace_id

### 3. Verificacion y Errores

| Decision | Valor |
|----------|-------|
| **Baja confianza (50-69%)** | Mostrar al usuario para confirmacion manual |
| **Alta confianza (>=70%)** | Asignar automaticamente |
| **OCR fallido (no se puede leer)** | Reportar en resumen y continuar con las demas |
| **Logica de match** | Cascading: telefono matchea → es match. Si no → nombre. Si no → ciudad. Si no → direccion. |

**Implicaciones:**
- El resumen final debe separar: asignadas auto, pendientes de confirmacion, sin match, OCR fallido
- Se necesita UI de confirmacion para matches de baja confianza
- Las guias con OCR fallido sugieren re-upload con mejor calidad

### 4. Comando y Progreso UX

| Decision | Valor |
|----------|-------|
| **Comando** | `leer guias` (escrito en Chat de Comandos) |
| **Input** | Arrastrar/subir fotos junto con el comando |
| **Progreso** | Resumen unico al final (no progreso en tiempo real) |
| **Post-accion** | Emitir trigger de automatizacion — el cambio de etapa lo maneja la automatizacion, no el robot |

**Implicaciones:**
- Nuevo comando en Chat de Comandos: `leer guias`
- El comando acepta archivos adjuntos (ya existe patron de upload en el chat?)
- El resumen usa formato tabla/lista similar al resumen actual de Slack

### 5. Trigger de Automatizacion

| Decision | Valor |
|----------|-------|
| **Tipo de trigger** | Trigger especifico nuevo: `robot.ocr.completed` |
| **NO usar** | `field.changed` (aunque guide_lookup lo usa, el usuario quiere distinguir la fuente) |
| **Patron** | Identico a `robot.coord.completed`: se emite en el callback, enriquecido con datos de orden + contacto |
| **Datos del trigger** | workspaceId, orderId, orderName, carrierGuideNumber, carrier (detectada), contactId, contactName, contactPhone, shippingCity |

**Implicaciones:**
- Nuevo trigger type en `src/lib/automations/types.ts`
- Nueva constante en `src/lib/automations/constants.ts`
- Nuevo emitter en `src/lib/automations/trigger-emitter.ts`
- Nuevo case en `automation-runner.ts`
- Nuevo evento Inngest en `events.ts`

### 6. Arquitectura (patron de robots existentes)

| Decision | Valor |
|----------|-------|
| **Job type** | `ocr_guide_read` en tabla `robot_jobs` |
| **Evento Inngest** | `robot/ocr-guide.submitted` |
| **Orchestrator** | Nuevo Inngest function `ocr-guide-orchestrator` (mismo patron que guide-lookup-orchestrator) |
| **Callback** | Reutilizar `/api/webhooks/robot-callback` existente (agrega case para `ocr_guide_read`) |
| **Batch completion** | Mismo `robot/job.batch_completed` que ya usan los otros robots |
| **OCR service** | Integrado en MorfX (API route o Inngest step con Claude Vision), NO servicio externo separado |

**Diferencia clave vs robots Coordinadora:**
- Los robots de Coordinadora llaman a un servicio externo (`robot-coordinadora`) via HTTP
- El Robot OCR usa Claude Vision directamente desde MorfX (API de Anthropic), no necesita servicio externo
- El matching se ejecuta como Inngest step despues del OCR

---

## Scope Boundaries

### Dentro de scope
- OCR de imagenes/PDF de guias con Claude Vision
- Deteccion automatica de transportadora
- Matching inteligente contra ordenes en pipeline stage especifica
- Asignacion de `carrier_guide_number` via domain layer
- Trigger `robot.ocr.completed` para automatizaciones
- Comando `leer guias` en Chat de Comandos con file upload
- Resumen de resultados

### Fuera de scope
- Creacion de PDF de guias (Fase 28)
- Nuevos carriers mas alla de Envia/Inter/Coordinadora/Servientrega
- Tracking en tiempo real del envio
- Integracion con Slack (reemplazado por Chat de Comandos)
- Integracion con Bigin (reemplazado por domain layer de MorfX)

---

## Deferred Ideas

_(Capturadas durante la discusion pero fuera de scope de esta fase)_

- Ninguna idea diferida capturada.

---

## Next Steps

1. `/gsd:research-phase 27` — Investigar: Claude Vision API para OCR, patron de file upload en Chat de Comandos, matching algorithms, schema de orders relevante
2. `/gsd:plan-phase 27` — Plan detallado con tareas atomicas
