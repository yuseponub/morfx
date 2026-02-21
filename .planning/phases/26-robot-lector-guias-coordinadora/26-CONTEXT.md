# Phase 26: Robot Lector de Guías Coordinadora - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Un robot lee los números de guía asignados desde el portal de Coordinadora y actualiza las órdenes del CRM con el campo "guía de transportadora" correspondiente, pasando por el domain layer para generar triggers de automatización. Activado desde Chat de Comandos con `buscar guias coord`.

**Fuera de scope:** OCR de guías físicas (Fase 27), creación de PDF de guías (Fase 28), nuevos carriers.

</domain>

<decisions>
## Implementation Decisions

### Navegación del portal y extracción de datos
- Robot reutiliza endpoints existentes del servicio robot-coordinadora: `/api/buscar-guias` (batch)
- Solo extrae número de guía — no estado del envío ni otros campos
- Navega a `ff.coordinadora.com/panel/pedidos`, lee tabla (columna 0 = pedido, columna 1 = guía)
- Batch optimizado: carga página una vez, construye mapa pedido→guía en memoria

### Filtrado de órdenes
- Filtra órdenes por etapa de despacho configurada en Pipeline Config (módulo existente de Fase 25)
- Las órdenes deben tener `tracking_number` (número de pedido Coordinadora) para ser candidatas
- Límite configurable de órdenes por ejecución para evitar timeouts

### Mapeo pedido↔guía
- Mapeo por `tracking_number` (número de pedido Coordinadora) — relación 1:1 con guía
- Sobrescribir siempre si la orden ya tiene guía asignada (Coordinadora puede reasignar)
- Sin guía = "pendiente" en el resumen (no error) — es normal que Coordinadora no haya asignado aún

### Actualización CRM
- Actualiza campo "guía de transportadora" existente en la orden vía domain layer
- Genera trigger de automatización al actualizar (mismo patrón que robot creador de guías)
- NO mueve de etapa automáticamente — el usuario crea automatización si quiere mover etapa
- Lo importante es actualizar las guías que se encontraron; las pendientes se reportan

### Comando y feedback
- Comando: `buscar guias coord`
- Flujo idéntico a `subir ordenes coord`: preview con confirmación → progreso en tiempo real → resumen
- Preview muestra cuántas órdenes tienen tracking_number pendiente de guía
- Progreso por orden vía Supabase Realtime (mismo patrón de robot_job_items)
- Resumen final con detalle: pedido → guía por cada orden encontrada
- Órdenes sin guía listadas como "pendientes" (no como errores)

### Errores y casos borde
- Sin órdenes en etapa configurada → mensaje informativo "No hay órdenes pendientes de guía" y para
- Fail-fast sin reintentos (consistente con robot creador)
- Job siempre se completa — actualiza las guías encontradas, reporta las pendientes
- Solo error real si el robot falla completamente (portal caído, sesión expirada)

### Claude's Discretion
- Estructura interna del nuevo endpoint en robot-coordinadora (si necesita ajustes al existente)
- Tipo de robot job (nuevo tipo o reutilización del existente con subtipo)
- Inngest orchestrator para lectura de guías (nuevo function o extensión del existente)
- Detalles de la UI de progreso (reutilización de componentes existentes)

</decisions>

<specifics>
## Specific Ideas

- El flujo replica el flujo n8n documentado en `FLUJO-N8N-DETALLADO.md`: trigger → query órdenes en etapa → extraer pedidos → robot busca guías → actualizar CRM → resumen
- Código de referencia existente en `github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/Agentes Logistica/robot-coordinadora/`
  - Documentación: `DOCUMENTACION-INGRESAR-GUIAS.md`
  - Server API: `src/api/server.ts` (endpoints `/api/buscar-guia` y `/api/buscar-guias`)
  - Adapter: `src/adapters/coordinadora-adapter.ts` (métodos `buscarGuiaPorPedido` y `buscarGuiasPorPedidos`)
- "Todo igual a subir ordenes" — el UX del comando, progreso, y feedback debe ser consistente con el comando existente
- En Bigin (sistema anterior), el campo Guía almacenaba temporalmente el número de pedido y luego se sobrescribía con la guía real. En MorfX son campos separados (tracking_number y guía de transportadora)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-robot-lector-guias-coordinadora*
*Context gathered: 2026-02-21*
