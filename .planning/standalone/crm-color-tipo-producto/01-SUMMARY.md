---
phase: crm-color-tipo-producto
plan: 01
status: complete
commit: d0f7585
---

# Plan 01 — Modulo product-types — SUMMARY

## Archivo creado

`src/lib/orders/product-types.ts` (153 LOC)

## Exports

| Symbol | Tipo | Proposito |
|---|---|---|
| `ProductType` | union | `'melatonina' \| 'ash' \| 'magnesio_forte'` |
| `PRODUCT_TYPE_COLORS` | const record | mapa tipo -> `{ label, dotClass, bgClass, textClass }` con clases Tailwind literales |
| `SKU_TO_PRODUCT_TYPE` | const record | 10 SKUs reales -> tipo |
| `detectProductType` | fn | Clasifica UN producto (SKU exacto > titulo > null) |
| `detectOrderProductTypes` | fn | Dedupe + orden estable para un array |

## SKUs mapeados (10 totales)

| SKU | Tipo |
|---|---|
| 001 | melatonina |
| 002 | melatonina |
| 003 | melatonina |
| 010 | melatonina |
| 011 | melatonina |
| SOMNIO-90-CAPS | melatonina |
| SOMNIO-90-CAPS-X2 | melatonina |
| SOMNIO-90-CAPS-X3 | melatonina |
| 007 | ash |
| 008 | magnesio_forte |

## Reglas de fallback por titulo (orden importa, primer match gana)

1. `'magnesio forte'` → `magnesio_forte`
2. `'wagand'` OR `'waghan'` → `ash` (captura Ashwagandha y typo ASWAGHANDA)
3. `'elixir'` OR `'melatonina'` → `melatonina`

Caso sin match → `null` (sin dot).

## Decisiones tecnicas

- **Pre-compute modulo-nivel (`NORMALIZED_SKU_MAP`):** SKUs trim+lowercase una sola vez al cargar. Lookup O(1) en cada render.
- **Tailwind JIT safety:** Comentario cookie al tope + strings literales en `PRODUCT_TYPE_COLORS` — el scanner los detecta estaticamente.
- **Orden estable (`PRODUCT_TYPE_ORDER`):** `['melatonina', 'ash', 'magnesio_forte']` → array de salida siempre en ese orden, independiente del input.
- **Sin React / sin JSX:** modulo 100% TypeScript puro, consumible desde server components si se requiere.

## Verificacion

- `npx tsc --noEmit`: sin errores nuevos en `product-types.ts` (errores pre-existentes en `agents/somnio/__tests__/*` no relacionados).
- Test behavior: **19/19 pasados** via `tsx` (todos los casos de la seccion `<behavior>` del plan).

## Deuda tecnica

Ninguna.

## Commit

- `d0f7585` — `feat(crm-color-tipo-producto): agregar modulo product-types con deteccion SKU + titulo`
