---
phase: quick-037
plan: 01
type: refactor
status: complete
completed: 2026-04-08
one-liner: "Consolida precios y metadata de productos Somnio a fuente unica en somnio-v3/constants.ts (elimina duplicacion que causo hotfix 4bcd243)"
tags: [somnio, refactor, constants, single-source-of-truth, pricing]
key-files:
  modified:
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio/order-creator.ts
commits:
  - 06eaae0: "refactor(quick-037): agregar PACK_PRICES_NUMERIC y PACK_PRODUCTS como fuente unica"
  - e8114df: "refactor(quick-037): order-creator lee precios desde fuente unica"
---

# Quick Task 037: Consolidar Precios Somnio a Fuente Unica

## Objetivo

Eliminar la duplicacion estructural de precios numericos y metadata de productos Somnio entre `somnio-v3/constants.ts` (precios al cliente como strings) y `somnio/order-creator.ts` (precios al CRM como numeros hardcoded + switch en `mapPackToProduct`). Esta duplicacion causo el bug del 2026-04-08 donde los precios mostrados al cliente se desincronizaron con los precios creados en el CRM. El hotfix `4bcd243` sincronizo los valores pero dejo la duplicacion intacta.

## Cambios Realizados

### Task 1 — Commit `06eaae0`

**Archivo:** `src/lib/agents/somnio-v3/constants.ts`

Se agregaron dos nuevas constantes en la seccion "Pack Prices":

- `PACK_PRICES_NUMERIC: Record<string, number>` con valores `89900`, `129900`, `169900`.
- `PACK_PRODUCTS: Record<string, { name: string; quantity: number }>` con los tres packs Somnio.

Se preservo la regla de zero-imports del archivo (tipo `Record<string, ...>` en vez de `Record<PackSelection, ...>`). `PACK_PRICES` (strings) se mantiene intacto para los templates al cliente; el JSDoc enfatiza que ambas constantes deben mantenerse sincronizadas.

### Task 2 — Commit `e8114df`

**Archivo:** `src/lib/agents/somnio/order-creator.ts`

- Import nuevo: `import { PACK_PRICES_NUMERIC, PACK_PRODUCTS } from '../somnio-v3/constants'`.
- Eliminada la constante local `SOMNIO_PRICES_NUMERIC` (era duplicacion directa).
- `effectivePrice` ahora lee de `PACK_PRICES_NUMERIC[pack]`.
- `mapPackToProduct()` reescrito sin `switch` ni valores hardcoded — lee de `PACK_PRODUCTS` y `PACK_PRICES_NUMERIC`. Firma publica (`(pack: PackSelection): ProductMapping`) y warning log en caso fallback preservados.

## Verificacion

### Build limpio

```
npm run build
```

Resultado: compilo sin errores ni warnings nuevos. Zero errores de TypeScript.

### Grep final de precios Somnio hardcoded

```
grep -rnE "\b(77900|89900|109900|129900|139900|169900)\b" \
  src/lib/agents/somnio src/lib/agents/somnio-v3 src/lib/agents/somnio-recompra
```

Resultado:

- `src/lib/agents/somnio-v3/constants.ts:151-153` — fuente unica (`PACK_PRICES_NUMERIC`). **Esperado.**
- `src/lib/agents/somnio/no-repetition-filter.ts:50` — el `77900` dentro de un string template de prompt (texto de instrucciones al LLM, no logica de precio). **Esperado (falso positivo conocido, documentado en el plan).**
- `src/lib/agents/somnio-recompra/constants.ts:105-109` — `PACK_PRICES` con strings `$77,900 / $109,900 / $139,900`. **Intencional:** clientes de recompra mantienen pricing anterior. Note: el grep `\b77900\b` no matchea porque las comillas del string usan `$77,900` con coma.
- `src/lib/agents/somnio/order-creator.ts` — **CERO resultados.** Refactor exitoso.

### `somnio-recompra/` intacto

```
git diff src/lib/agents/somnio-recompra/
```

Resultado: diff vacio (0 lineas). Constraint respetado.

### Constraint `zero-imports` de `somnio-v3/constants.ts`

```
grep -n "^import" src/lib/agents/somnio-v3/constants.ts
```

Resultado: 0 imports. Regla preservada (se uso `Record<string, ...>` en vez de importar `PackSelection`).

## Criterios de Exito

- [x] `PACK_PRICES_NUMERIC` y `PACK_PRODUCTS` exportados desde `somnio-v3/constants.ts`
- [x] `somnio-v3/constants.ts` sigue sin imports (zero-imports rule)
- [x] `SOMNIO_PRICES_NUMERIC` eliminado de `order-creator.ts`
- [x] `mapPackToProduct()` sin switch ni valores hardcoded
- [x] `effectivePrice` usa `PACK_PRICES_NUMERIC[pack]`
- [x] `npm run build` pasa sin errores
- [x] Grep final confirma precios nuevos solo en `somnio-v3/constants.ts`
- [x] `somnio-recompra/` no fue modificado
- [x] Commits atomicos pusheados a `origin main`

## Deviations

Ninguna. El plan se ejecuto exactamente como estaba escrito.

## Deuda Tecnica Restante (Fuera de Scope)

- **Lookup inverso de precio a pack en `comandos.ts` y `normalize-order-data.ts`** — mencionado en planning como deuda tecnica. No se aborda en este refactor porque el scope era consolidar la fuente unica de escritura. Proximo refactor podria agregar una funcion helper `packFromPrice(price): PackSelection | undefined` en `somnio-v3/constants.ts` que reemplace los lookups ad-hoc.
- **Sandbox mocks en `crm/order-manager/`** — contienen valores de precio viejos hardcoded. Fuera de scope por instruccion del usuario (son mocks, no logica de produccion).

## Recordatorio para el Futuro

Cuando se necesite cambiar los precios de los packs Somnio (no recompra), editar UN solo archivo:

**`src/lib/agents/somnio-v3/constants.ts`**

Actualizar AMBAS constantes:

1. `PACK_PRICES` — strings con formato `$XX,XXX` para templates al cliente.
2. `PACK_PRICES_NUMERIC` — numeros crudos para creacion de pedido en CRM.

Tanto las cotizaciones al cliente como los pedidos en el CRM tomaran el nuevo valor automaticamente. No hay otro lugar donde estos numeros vivan (excepto `somnio-recompra/constants.ts`, que es intencionalmente independiente para mantener pricing historico de clientes de recompra).
