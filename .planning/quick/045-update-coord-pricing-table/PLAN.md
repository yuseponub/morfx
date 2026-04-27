---
quick_id: 045
slug: update-coord-pricing-table
date: 2026-04-27
status: in-progress
---

# Quick: Actualizar tabla de unidades por valor — Robot Coordinadora

## Contexto

Los precios de Somnio cambiaron. La tabla de mapeo `unidadesPorValor` en `buildPedidoInputFromOrder()` (Robot Coordinadora dispatch flow) usa valores viejos. También el fallback `roundedValue` (que existía para casos con decimales tipo `109994.x`) ya no es necesario porque los pedidos ahora vienen siempre con valores exactos.

## Cambios

### 1. `src/app/actions/comandos.ts:136-140`

**Antes:**
```ts
// Derive shipping units: try raw value first, then rounded to nearest hundred
const rawValue = order.total_value || 0
const roundedValue = Math.floor(rawValue / 100) * 100
const unidadesPorValor: Record<number, number> = { 77900: 1, 109900: 2, 139900: 3 }
const unidades = unidadesPorValor[rawValue] ?? unidadesPorValor[roundedValue] ?? 1
```

**Después:**
```ts
// Derive shipping units from order total
const rawValue = order.total_value || 0
const unidadesPorValor: Record<number, number> = { 79900: 1, 129900: 2, 169900: 3 }
const unidades = unidadesPorValor[rawValue] ?? 1
```

Nuevos precios:
- $79.900 → 1 unidad
- $129.900 → 2 unidades
- $169.900 → 3 unidades

Eliminado fallback `roundedValue` (los precios ya no llegan con decimales).

### 2. `robot-coordinadora/src/adapters/coordinadora-adapter.ts:317`

**Sin cambios.** El `Math.floor(pedido.totalConIva / 100) * 100` queda como guard defensivo — el portal MUI de Coordinadora rechaza decimales en `total_coniva` (ver MEMORY.md "MUI form type=number with integer step"). Si por cualquier vía entra un decimal, falla la creación.

## No-touch

- Resto de defaults: `referencia='AA1'`, `valorDeclarado=55000`, `peso=0.08`, `alto=5`, `largo=5`, `ancho=10` quedan iguales.
- Lógica P/A (pago anticipado) intacta.
- City validation, identificación, contacto: sin cambios.

## Verificación

- TypeScript pasa (`npx tsc --noEmit`)
- Push a Vercel (Regla 1)
- Próximo dispatch usa nuevos valores
