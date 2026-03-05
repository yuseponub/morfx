# Quick Task 007: Summary

## Cambios realizados

### 1. `src/lib/domain/orders.ts`
- Agregado `tags: string[]` al interface `OrderForDispatch`
- En `getOrdersByStage()`: batch-fetch de tags via `order_tags` table (mismo patron que `getOrdersForGuideGeneration`)
- Tags mapeados por `order_id` y asignados a cada orden

### 2. `src/app/actions/comandos.ts`
- En `buildPedidoInputFromOrder()`: detecta tag "P/A" (case-insensitive)
- Si `esPagoAnticipado`:
  - `totalConIva: 0` (no cobrar al destinatario)
  - `esRecaudoContraentrega: false`
- `unidades` siempre se calcula con `total_value` real (sin cambio)

## Verificacion
- TypeScript: 0 errores nuevos (5 pre-existentes no relacionados)
- Logica preservada: ordenes sin tag "P/A" no cambian comportamiento
