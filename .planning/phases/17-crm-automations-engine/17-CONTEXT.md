# Phase 17: CRM Automations Engine - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Motor de automatizaciones configurable donde el usuario crea reglas "trigger + condiciones + acciones" entre modulos (CRM, WhatsApp, Tareas). Incluye ordenes conectadas entre pipelines con sync bidireccional, historial de ejecuciones detallado, y documentacion de reglas/limites para Phase 18 (AI Automation Builder).

</domain>

<decisions>
## Implementation Decisions

### Triggers y eventos
- **Scope completo:** CRM + WhatsApp + Tareas
  - CRM: cambio de stage (filtrable por pipeline), tag asignado/removido, contacto creado, orden creada, campo cambia de valor
  - WhatsApp: cualquier mensaje recibido O keyword match (configurable)
  - Tareas: tarea vencida, tarea completada
- **Condiciones:** AND + OR groups combinables (ej: `(stage = 'Enviado' OR stage = 'Entregado') AND tag = 'VIP'`)
- **Multi-accion:** Si, secuencial. Un trigger ejecuta multiples acciones en orden
- **Delays:** Opcionales por accion (minutos/horas/dias)
- **Encadenamiento:** Cascada protegida — acciones de automatizaciones SI disparan otros triggers, con max 3 niveles de profundidad para evitar loops
- **Pipeline filter:** Triggers de CRM pueden filtrar por pipeline especifico

### Acciones disponibles
- **CRM:** Asignar/remover tag, cambiar stage, actualizar campo (base + custom fields)
- **WhatsApp:** Enviar template, texto libre, o media (imagen/archivo)
- **Ordenes:** Crear orden en pipeline (pipeline obligatorio, stage opcional → default primer stage), duplicar orden a otro pipeline con datos configurables
- **Tareas:** Crear tarea con titulo (variables), descripcion, fecha relativa, asignacion a usuario, vinculo a contacto/orden — todo opcional excepto titulo
- **Webhook saliente:** POST a URL con headers custom (auth) y template JSON payload con variables
- **Variables de contexto:** Todas las acciones acceden a datos del trigger: {{nombre}}, {{stage_anterior}}, {{tag}}, {{mensaje}}, etc.
- **Error handling:** Al fallar una accion → parar toda la secuencia + alerta para revision

### Ordenes conectadas
- Al duplicar/crear orden en otro pipeline, se guarda `source_order_id` para referencia bidireccional
- **Relacion 1-a-muchas:** Una orden puede generar varias ordenes en distintos pipelines
- **UI completa:** Vista de "ordenes relacionadas" en detalle de orden, botones para navegar entre ellas
- **Sync bidireccional configurable:** El usuario elige que campos se sincronizan entre ordenes conectadas
- **Historial de cambios:** Cuando una orden conectada cambia, se registra en historial de la otra
- **Datos copiados al duplicar:** Todo por defecto (contacto, productos, valor, tags) pero configurable — el usuario elige que datos copiar al configurar la automatizacion

### UI del builder
- **Interfaz:** Formulario wizard multi-step (Paso 1: trigger, Paso 2: condiciones, Paso 3: acciones)
- **Navegacion:** Nuevo modulo `/automatizaciones` en sidebar, al nivel de CRM/WhatsApp/Agentes
- **Volumen esperado:** 15-50 automatizaciones por workspace → necesita busqueda y filtros basicos
- **Duplicar:** Boton para duplicar automatizacion existente y editarla

### Ejecucion y monitoreo
- **Motor:** Inngest events + durable functions (misma infra que timers del agente)
  - Triggers emiten eventos Inngest
  - Funciones durable ejecutan acciones en secuencia con retry
  - Delays nativos via `step.sleep()`
- **Historial detallado:** Fecha, automatizacion, trigger, cada accion con resultado individual, datos del contexto, duracion
- **Alertas:** Badge numerico en sidebar de automatizaciones + toast notification en la app
- **Metricas:** Solo historial (sin dashboard agregado por ahora)

### Reglas y limites (documentacion para Phase 18: AI Builder)
Las siguientes reglas DEBEN documentarse como constantes/schema para que Phase 18 las lea programaticamente:
- **Max cascada:** 3 niveles de profundidad
- **Max acciones por automatizacion:** Definir limite razonable (ej: 10-20)
- **Max automatizaciones por workspace:** Definir segun plan de suscripcion
- **Triggers disponibles:** Lista exhaustiva con schema de condiciones por tipo
- **Acciones disponibles:** Lista exhaustiva con schema de parametros por tipo
- **Variables disponibles:** Catalogo de variables por tipo de trigger ({{contacto.nombre}}, {{orden.valor}}, etc.)
- **Tipos de delay:** minutos, horas, dias — con max razonable
- **Error handling:** Reglas de retry, max intentos, timeout por accion
- **Validaciones:** Que recursos deben existir para que una automatizacion sea valida (pipeline existe, stage existe, tag existe, template aprobado, etc.)

Estas reglas se exponen como JSON schema o constantes TypeScript para que el AI Builder pueda validar automatizaciones antes de crearlas.

### Claude's Discretion
- Arquitectura de la tabla de automatizaciones (schema DB)
- Patron de evaluacion de condiciones AND/OR
- Formato de almacenamiento de acciones/condiciones (JSONB)
- Implementacion del sistema de variables/templates
- Estrategia de retry en Inngest
- UI exacta del wizard (layouts, transiciones)

</decisions>

<specifics>
## Specific Ideas

- El usuario menciono explicitamente el caso: "orden en pipeline Ventas es confirmada, se verifica, se agrega tag, se crea orden conectada en pipeline Logistica, facilmente accesible entre si para revision o algun cambio"
- Webhook saliente con headers custom para integracion con servicios externos (Zapier, n8n, custom APIs)
- Keyword match en WhatsApp para triggers selectivos (no todos los mensajes)
- Ordenes conectadas con sync bidireccional y historial de cambios entre ellas

</specifics>

<deferred>
## Deferred Ideas

- **AI Automation Builder (Phase 18):** Meta-agente que crea automatizaciones por lenguaje natural, usando las reglas/limites documentados en Phase 17
- **Dashboard de metricas de automatizaciones:** Metricas agregadas (ejecuciones/mes, tasa de error) — futuro si el historial no es suficiente
- **Email como canal de alerta:** Notificacion por email al admin cuando automatizacion falla — futuro
- **Carpetas/categorias de automatizaciones:** Para organizar >50 automatizaciones — futuro si el volumen crece

</deferred>

---

*Phase: 17-crm-automations-engine*
*Context gathered: 2026-02-12*
