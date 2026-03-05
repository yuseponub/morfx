# Quick Task 007: Soporte tag "P/A" (Pago Anticipado) en Subir Ordenes Coordinadora

## Objetivo

Cuando una orden tiene el tag "P/A" (pago anticipado), al subir a Coordinadora debe enviarse con:
- `totalConIva: 0` (no cobrar al destinatario)
- `esRecaudoContraentrega: false` (no es contraentrega)
- `unidades`: se calcula normalmente con el `total_value` real (77900→1, 109900→2, 139900→3)

## Tareas

### Task 1: Agregar tags a OrderForDispatch y getOrdersByStage

**Archivo:** `src/lib/domain/orders.ts`

1. Agregar `tags: string[]` al interface `OrderForDispatch`
2. En `getOrdersByStage()`, agregar `order_tags(tags(name))` al SELECT
3. Mapear tags en el resultado

### Task 2: Detectar tag "P/A" en buildPedidoInputFromOrder

**Archivo:** `src/app/actions/comandos.ts`

1. Recibir tags en `buildPedidoInputFromOrder`
2. Detectar si la orden tiene tag "P/A"
3. Si tiene "P/A":
   - `totalConIva: 0`
   - `esRecaudoContraentrega: false`
4. `unidades` siempre se calcula con el `total_value` real (sin cambio)

## Criterios de Exito

- [ ] Ordenes con tag "P/A" se envian con totalConIva=0 y esRecaudoContraentrega=false
- [ ] Ordenes sin tag "P/A" no cambian su comportamiento
- [ ] unidades siempre se calcula basado en total_value real
