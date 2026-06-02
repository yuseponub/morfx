# Phase 28: Robot Creador de Guias PDF — CONTEXT

**Created:** 2026-02-23
**Status:** Decisions captured, ready for research/planning

## Phase Goal

Integrar generacion de guias PDF (Interrapidisimo, Bogota) y Excel (Envia) directamente en MorfX, siguiendo el patron identico de los robots existentes (OCR, Coordinadora).

## Decisions

### 1. Scope de Transportadoras

**Decision:** Las 3 transportadoras que generan documentos:
- **Interrapidisimo** → PDF 4x6"
- **Bogota** → PDF 4x6"
- **Envia** → Excel (.xlsx)

Coordinadora NO se incluye (ya tiene su propio robot de dispatch).

### 2. Patron Arquitectonico

**Decision:** Identico al patron de los robots existentes (OCR, Coordinadora):

```
Settings (/settings/logistica)
  → Pipeline + Stage por transportadora (3 configs independientes)

Chat de Comandos
  → 3 comandos: "generar guias inter", "generar guias bogota", "generar excel envia"
  → Server action por comando
  → robot_jobs + robot_job_items
  → Inngest event

Inngest Orchestrator
  → Fetch orders del stage configurado
  → Claude AI normaliza datos
  → Genera PDF/Excel internamente (como OCR — sin servicio externo)
  → Sube a Supabase Storage
  → Actualiza items con resultados
  → Mueve pedidos a stage destino

Realtime UI
  → Progress via Supabase postgres_changes (patron existente)
  → Link de descarga en chat al completar
```

### 3. Configuracion de Stages

**Decision:** Un stage por transportadora, configurado en `/settings/logistica`:
- Stage "Robot Inter" → pipeline_id + stage_id
- Stage "Robot Bogota" → pipeline_id + stage_id
- Stage "Robot Envia" → pipeline_id + stage_id

Nuevas columnas en `carrier_configs`:
- `pdf_inter_pipeline_id`, `pdf_inter_stage_id`
- `pdf_bogota_pipeline_id`, `pdf_bogota_stage_id`
- `pdf_envia_pipeline_id`, `pdf_envia_stage_id`

### 4. Comandos en Chat

**Decision:** Un comando por transportadora (como en el sistema n8n original):
- `"generar guias inter"` → PDFs Interrapidisimo
- `"generar guias bogota"` → PDFs Bogota
- `"generar excel envia"` → Excel Envia

Cada comando tiene su quick-action chip en la barra de input.

### 5. Formato del PDF

**Decision:** Identico al actual:
- **Dimensiones:** 4x6 pulgadas (288 x 432 puntos)
- **Contenido por etiqueta:**
  - Logo Somnio
  - Numero de envio
  - Indicador de prioridad
  - Datos destinatario (nombre, direccion, barrio, ciudad, telefono)
  - Valor a cobrar (formato colombiano: $77.900)
  - Codigo de barras
  - Indicador "PAGO ANTICIPADO" (si aplica)

### 6. Formato Excel (Envia)

**Decision:** Identico al actual:
- Columnas: Valor, Nombre, Telefono, Direccion, Municipio, Departamento

### 7. Transformacion de Datos

**Decision:** Claude AI normaliza los datos (igual que en n8n):
- Quitar prefijo 57 del telefono → 10 digitos
- Formatear ciudades: "bucaramanga, santander" → "BUCARAMANGA (STDER)"
- Calcular unidades por precio: $77,900=1, $109,900=2, $139,900=3
- Nombres en mayusculas
- Separar nombre/apellido

**Modelo:** Claude Sonnet (mismo que OCR)
**Justificacion:** Mantener flexibilidad del sistema actual — los datos de pedidos en MorfX aun necesitan normalizacion.

### 8. Storage y Entrega

**Decision:** Supabase Storage + link en chat:
- PDF/Excel se sube a Supabase Storage (bucket existente o nuevo)
- El link se muestra en el chat de comandos al completar
- Patron identico a como OCR sube imagenes

### 9. Post-Generacion

**Decision:** Mover pedidos automaticamente a otro stage despues de generar:
- El stage destino es configurable en `/settings/logistica`
- Equivalente a "ESPERANDO GUIAS" del sistema n8n
- Se necesitan columnas adicionales: `pdf_inter_dest_stage_id`, `pdf_bogota_dest_stage_id`, `pdf_envia_dest_stage_id`

### 10. Generacion Interna (sin servicio externo)

**Decision:** La generacion se hace dentro de MorfX (como OCR):
- PDFs con PDFKit (misma libreria del robot original)
- Excel con ExcelJS (misma libreria del robot original)
- No se llama a servicio externo — todo en el Inngest orchestrator
- Elimina dependencia de n8n/VPS

## Deferred Ideas

- Previsualizar PDFs antes de generar
- Seleccion manual de pedidos (en lugar de por stage)
- Template de PDF configurable por workspace
- Soporte para mas transportadoras

## Source Documentation

- Robot existente: https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/tree/master/documentacion-tecnica-robots
- ROBOT-INTER-ENVIA-BOG.md: API endpoints, PDF specs, dependencies
- WORKFLOW-N8N-LOGISTICA.md: Flujo n8n completo por transportadora
- INFRAESTRUCTURA-COMPLETA.md: Arquitectura del sistema actual

## Existing Pattern Reference

Los 3 robots existentes en MorfX:

| Robot | Job Type | Inngest Event | Approach |
|-------|----------|---------------|----------|
| Coordinadora Dispatch | `create_shipment` | `robot/job.submitted` | External service (HTTP) |
| Coordinadora Guide Lookup | `guide_lookup` | `robot/guide-lookup.submitted` | External service (HTTP) |
| OCR Guide Reader | `ocr_guide_read` | `robot/ocr-guide.submitted` | Internal (Claude Vision) |

Phase 28 agrega 3 job types internos:

| Robot | Job Type | Inngest Event | Approach |
|-------|----------|---------------|----------|
| PDF Inter | `pdf_guide_inter` | `robot/pdf-guide.submitted` | Internal (PDFKit) |
| PDF Bogota | `pdf_guide_bogota` | `robot/pdf-guide.submitted` | Internal (PDFKit) |
| Excel Envia | `excel_guide_envia` | `robot/excel-guide.submitted` | Internal (ExcelJS) |

## Key Files to Modify

- `src/app/(dashboard)/settings/logistica/` — Config UI (3 new cards)
- `src/app/actions/logistics-config.ts` — Server actions for new configs
- `src/lib/domain/carrier-configs.ts` — Domain helpers for new stages
- `src/app/(dashboard)/comandos/components/` — New commands + chips
- `src/app/actions/comandos.ts` — Server actions for 3 new commands
- `src/inngest/functions/robot-orchestrator.ts` — New orchestrators
- `src/lib/domain/robot-jobs.ts` — New job types support
- `src/lib/domain/orders.ts` — New order fetching functions
- DB migration — New columns in carrier_configs
