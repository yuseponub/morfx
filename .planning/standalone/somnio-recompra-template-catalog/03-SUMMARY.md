---
plan: 03
phase: somnio-recompra-template-catalog
status: complete
completed: 2026-04-23
wave: 1
---

# Plan 03 SUMMARY — transitions D-04 + D-05 redesign

## Outcome

`transitions.ts` ajustado para que:
- `saludo` en initial NO dispara action (fallback null → response-track lo trata como informational → emite saludo texto + imagen ELIXIR) — D-05.
- `quiero_comprar` en initial → `preguntar_direccion` (era `ofrecer_promos`) — D-04.

## Commits

- `56f3bad` — feat(somnio-recompra-template-catalog): Plan 03 — transitions D-04 + D-05 redesign

## Cambios

### `src/lib/agents/somnio-recompra/transitions.ts`
- **Eliminada** entry `{ phase: 'initial', on: 'saludo', action: 'ofrecer_promos' }` (D-05).
- **Modificada** entry `{ phase: 'initial', on: 'quiero_comprar' }`:
  - action: `'ofrecer_promos'` → `'preguntar_direccion'`
  - timerSignal level: `L3` → `L5` (esperar respuesta a la pregunta de direccion)
  - reason + description actualizados.
- Renumerados comments de escenarios: antes 1/2/3, ahora 1 (quiero_comprar) / 2 (datos).

## Verificacion

- `npx tsc --noEmit` pasa (exit 0) post-edit.
- `hasSaludoCombined` branch (response-track.ts:96, 173-189) revisado:
  solo activa cuando `allIntents.length > 1`. Con saludo sin action (D-05),
  saludo va solo como informational (`length === 1`) → branch false →
  `composeBlock` emite ambos orden=0 texto + orden=1 imagen ELIXIR sin dropear.
  Cuando saludo viene combinado (ej. saludo + precio) el branch sigue
  cherrypickeando el saludo CORE y dropea la imagen — comportamiento intencional.

## Next

- Wave 2: Plan 04 — tests unitarios cubriendo:
  - `resolveTransition('initial', 'saludo')` retorna null.
  - `resolveTransition('initial', 'quiero_comprar')` retorna `preguntar_direccion` + L5.
  - `resolveSalesActionTemplates('preguntar_direccion')` con state preloaded devuelve
    `direccion_completa='<dir>, <ciudad>, <departamento>'`.
  - `INFORMATIONAL_INTENTS.has('registro_sanitario') === true`.
