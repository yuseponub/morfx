---
plan: 02
phase: somnio-recompra-template-catalog
status: complete
completed: 2026-04-23
wave: 1
---

# Plan 02 SUMMARY — revert T2 + direccion_completa + registro_sanitario informational

## Outcome

Catalogo recompra apunta a su propio `agent_id='somnio-recompra-v1'` (revierte
el fix provisional `cdc06d9` T2). `{{direccion_completa}}` ahora incluye
`departamento` (D-12). `INFORMATIONAL_INTENTS` cubre `registro_sanitario` (D-06).

## Commits

- `1ac5c0c` — feat(somnio-recompra-template-catalog): Plan 02 — revert T2 + direccion_completa departamento + registro_sanitario informational

## Cambios

### `src/lib/agents/somnio-recompra/response-track.ts`
- Line 36: `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (antes `'somnio-sales-v3'`).
- Comment refactor reflejando el catalog independiente (referencia phase + fecha).
- `case 'preguntar_direccion'`: extrae `state.datos.departamento` y lo incluye en
  `[direccion, ciudad, departamento].filter(Boolean).join(', ')`. `filter(Boolean)`
  preserva el behavior cuando departamento es null/empty.
- `resolveSalesActionTemplates` exportada (`export async function`) para habilitar
  tests directos en Plan 04.

### `src/lib/agents/somnio-recompra/constants.ts`
- `INFORMATIONAL_INTENTS` agrega `'registro_sanitario'` — count 9 -> 10.
- Comment actualizado.

## Verificacion

- `npx tsc --noEmit` pasa (exit 0) post-edit.
- No hay cambios en Vercel — Regla 5 strict: push se hace en Plan 05 tras apply SQL.

## Next

- Plan 03 (Wave 1): `transitions.ts` — remove saludo entry, quiero_comprar -> preguntar_direccion.
