---
quick_id: 045
slug: update-coord-pricing-table
date: 2026-04-27
status: complete
commit: fa0b04d
---

# Summary: Actualizar tabla de unidades — Robot Coordinadora

## Cambios aplicados

`src/app/actions/comandos.ts:136-139`

| Antes | Después |
|---|---|
| `{ 77900: 1, 109900: 2, 139900: 3 }` | `{ 79900: 1, 129900: 2, 169900: 3 }` |
| `unidadesPorValor[rawValue] ?? unidadesPorValor[roundedValue] ?? 1` | `unidadesPorValor[rawValue] ?? 1` |
| `const roundedValue = Math.floor(rawValue / 100) * 100` | (eliminado) |

Comentario actualizado: "Derive shipping units from order total".

## No-touch (intencional)

- `Math.floor(value / 100) * 100` en `robot-coordinadora/src/adapters/coordinadora-adapter.ts:317` — guard defensivo contra el portal MUI.
- Defaults físicos: `referencia='AA1'`, `valorDeclarado=55000`, `peso=0.08`, `alto=5`, `largo=5`, `ancho=10`.
- Lógica P/A, city validation, identificación, contacto.

## Verificación

- ✅ `npx tsc --noEmit` → exit 0
- ✅ Commit `fa0b04d` (atomic)
- ✅ Push a `origin main` → Vercel deploy

## Próximos pedidos

El siguiente dispatch via "subir ordenes coord" usará la nueva tabla. Pedidos con totales de $79.900 / $129.900 / $169.900 mapearán correctamente a 1/2/3 unidades. Cualquier otro valor cae al default (1 unidad).
