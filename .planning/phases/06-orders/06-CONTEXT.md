# Phase 6: Orders - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Sistema de gestion de pedidos con vista Kanban, multiples productos por pedido, y pipelines configurables. Los pedidos pueden vincularse entre pipelines (ej: Ventas → Logistica). Incluye catalogo de productos simple compatible con Shopify (match por SKU).

</domain>

<decisions>
## Implementation Decisions

### Kanban Board
- Tarjeta muestra: nombre contacto, valor, producto(s), fecha creacion, tags
- Campos de tarjeta personalizables (usuario elige que mostrar)
- WIP limits configurables por etapa, default sin limite (null/0 = ilimitado)
- Drag-and-drop libre entre etapas, sin restricciones de transicion
- Ordenamiento por filtros (fecha creacion, ultima actividad, valor, etc.), no manual
- Default: todos los pedidos del workspace visibles
- Opcion de filtrar "mis pedidos" (por asignacion)
- Click en tarjeta abre Sheet/modal lateral con detalle completo

### Filtros y Busqueda
- Filtros completos: etapa, contacto, fecha, tags, ciudad, valor (rango), producto
- Busqueda INTELIGENTE: fuzzy matching, tolerancia a espacios, similitud fonetica, aproximacion en numeros
- Mismos filtros funcionan en vista Kanban y vista Lista

### Estructura de Pedido
- Campos fijos: contacto (vinculado), valor total, etapa, closing date, tags, descripcion/notas, transportadora, guia (tracking)
- Responsable NO es campo fijo (agregar como custom field si se desea)
- Custom fields personalizables igual que contactos (12 tipos de campo)
- Valor total = suma automatica de (precio x cantidad) de productos

### Catalogo de Productos
- Campos minimos: SKU, titulo, precio, shopify_product_id (nullable)
- Catalogo propio de MorfX, simple para MVP
- Match con Shopify por SKU cuando se conecte la integracion
- shopify_product_id se llena automaticamente al hacer match

### Pipelines
- Multiples pipelines independientes por workspace (ilimitados)
- Cada pipeline tiene sus propias etapas configurables
- Pedidos pueden vincularse entre pipelines (ej: confirmar venta crea pedido vinculado en Logistica)
- Gestion de etapas: agregar, reordenar (drag), eliminar
- Colores por etapa: paleta de presets + color picker libre
- WIP limit por etapa: configurable, default sin limite

### Vistas
- Vista default: Kanban
- Toggle para cambiar a vista Lista/Tabla
- Selector de pipeline: barra inferior tipo taskbar con pestanas (como ventanas)
- Multiples pipelines pueden estar "abiertos" simultaneamente
- Vistas guardadas compartidas: admin crea filtros guardados, todos los usuarios pueden usarlos

### Import/Export
- Export CSV con seleccion de columnas (igual que contactos)
- Import CSV con wizard de mapeo manual (igual que contactos)
- Import INTELIGENTE con IA: sugiere mapeo de columnas segun schema existente

### Claude's Discretion
- Implementacion especifica de fuzzy search (Fuse.js, pg_trgm, custom)
- Diseno visual de la barra de pipelines
- Patron de vinculacion entre pedidos de diferentes pipelines
- Flujo exacto del import con IA

</decisions>

<specifics>
## Specific Ideas

- Referencia visual: Bigin by Zoho (screenshots compartidos)
- Barra inferior de pipelines funciona como taskbar de Windows
- Tarjetas de Kanban similares a las de Bigin (nombre, valor, fecha, responsable)
- El import con IA debe ser MVP, no futuro

</specifics>

<deferred>
## Deferred Ideas

Ninguna — la discusion se mantuvo dentro del scope de la fase.

</deferred>

---

*Phase: 06-orders*
*Context gathered: 2026-01-29*
