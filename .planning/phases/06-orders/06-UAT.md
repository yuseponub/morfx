---
status: complete
phase: 06-orders
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md]
started: 2026-01-29T19:30:00Z
updated: 2026-01-30T10:45:00Z
---

## Current Test

number: complete
name: All tests passed
expected: N/A
awaiting: N/A

## Tests

### 1. Ver catálogo de productos
expected: Navegar a /crm/productos muestra tabla de productos con columnas SKU, Título, Precio, Estado. Botón "Nuevo Producto" visible.
result: pass

### 2. Crear un producto
expected: Click "Nuevo Producto" abre formulario. Al llenar SKU, título, precio y guardar, el producto aparece en la tabla.
result: pass

### 3. Editar producto existente
expected: Click en icono de editar de un producto abre formulario con datos pre-llenados. Al modificar y guardar, los cambios se reflejan en la tabla.
result: pass

### 4. Toggle producto activo/inactivo
expected: Click en toggle de estado cambia el producto entre activo e inactivo. Productos inactivos se ocultan si el filtro "Mostrar inactivos" está apagado.
result: pass

### 5. Ver configuración de pipelines
expected: Navegar a /crm/configuracion/pipelines muestra pipelines. Si es primera vez, se crea pipeline "Ventas" automáticamente con 4 etapas.
result: pass

### 6. Reordenar etapas con drag-and-drop
expected: Arrastrar una etapa hacia arriba o abajo y soltarla cambia su posición. El nuevo orden se mantiene al recargar la página.
result: pass
note: "Fixed - stage reorder ahora funciona en Kanban board con DnD"

### 7. Configurar etapa (color, WIP limit)
expected: Click en editar etapa permite cambiar nombre, color (paleta de colores), y WIP limit. Los cambios se reflejan inmediatamente.
result: pass

### 8. Ver lista de pedidos
expected: Navegar a /crm/pedidos muestra vista (Kanban o Lista). Hay toggle para cambiar entre vistas. Hay filtros de pipeline, etapa, y búsqueda.
result: pass

### 9. Crear pedido con contacto y productos
expected: Click "Nuevo Pedido" abre panel lateral. Puedo seleccionar contacto, agregar productos del catálogo con cantidades, y llenar datos de envío. Al guardar, el pedido aparece.
result: pass
note: "Se agregaron campos shipping_address y shipping_city"

### 10. Editar pedido existente
expected: Click en editar de un pedido abre el formulario con datos pre-llenados. Puedo cambiar contacto, productos, etc. Los cambios se guardan.
result: pass

### 11. Eliminar pedido
expected: Click en eliminar muestra confirmación. Al confirmar, el pedido desaparece de la lista.
result: pass

### 12. Ver Kanban board
expected: En vista Kanban, las etapas del pipeline aparecen como columnas. Los pedidos aparecen como tarjetas en sus etapas correspondientes.
result: pass

### 13. Drag-and-drop pedido entre etapas
expected: Arrastrar una tarjeta de pedido a otra columna (etapa) mueve el pedido. La etapa del pedido se actualiza.
result: pass
note: "También se agregó dropdown de etapa en panel de detalle para cambio rápido"

### 14. WIP limit en etapa
expected: Si una etapa tiene WIP limit configurado y está llena, al intentar mover un pedido ahí muestra error/toast indicando el límite.
result: pass
note: "Cambiado a solo advertencia (warning toast) en lugar de bloquear el movimiento"

### 15. Búsqueda fuzzy de pedidos
expected: Escribir en el campo de búsqueda filtra los pedidos. La búsqueda es fuzzy (tolerante a errores de tipeo). Busca por nombre de contacto, teléfono, productos, guía.
result: pass

### 16. Pipeline tabs (múltiples pipelines)
expected: Si hay múltiples pipelines, aparece barra inferior tipo taskbar. Click en un tab cambia al pipeline seleccionado.
result: pass

### 17. Persistencia de vista y tabs
expected: Cambiar vista (Kanban/Lista) y/o abrir pipelines en tabs. Recargar la página. La misma vista y tabs abiertos se mantienen.
result: pass
note: "Se corrigió bug donde tabs no persistían por race condition con auto-open"

### 18. Ver detalle de pedido
expected: Click en una tarjeta de pedido (Kanban) o fila (Lista) abre panel lateral con todos los detalles: contacto, productos, valor total, tracking, notas.
result: pass

## Summary

total: 18
passed: 18
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Arrastrar una etapa cambia su posición y el nuevo orden se mantiene al recargar"
  status: fixed
  reason: "User reported: no deja actualizar posiciones"
  severity: major
  test: 6
  root_cause: "Stage reorder implementado en Kanban view con drag-and-drop"
  artifacts: []
  missing: []
  debug_session: ""

- truth: "El formulario de pedido debe permitir ingresar dirección y municipio de envío"
  status: fixed
  reason: "No hay campos para dirección y municipio de envío en el formulario de pedido"
  severity: major
  test: 9
  root_cause: "La tabla orders no tiene campos shipping_address ni shipping_city. Actualizado con migración."
  artifacts: ["20260130000001_orders_shipping_address.sql"]
  missing: []
  debug_session: ""

## Post-UAT Fixes

### Hydration Errors Fixed
1. **Button nesting in pipeline-tabs.tsx**: Outer `<button>` changed to `<div role="button">` to avoid invalid HTML (button inside button)
2. **DndKit aria-describedby mismatch**: Added `suppressHydrationWarning` to elements that spread DndKit's `{...attributes}` in kanban-column.tsx and kanban-card.tsx

## Feature Requests (deferred)

- Opción para deshabilitar colores en stages (excepto cerrados: verde/rojo)
