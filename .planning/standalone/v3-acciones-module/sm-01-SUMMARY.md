# State Machine Plan 01: Foundation Types Summary

**One-liner:** Pure types (TipoAccion, Phase, SystemEvent, AccionRegistrada) and functions (guards, phase derivation, transition table) for waterfall-to-state-machine migration

## Metadata

- **Phase:** v3-state-machine
- **Plan:** 01
- **Completed:** 2026-03-06
- **Duration:** ~5 minutes
- **Tasks:** 2/2

## What Was Built

### types.ts additions
- `TipoAccion` — 10 bot action types (ofrecer_promos, mostrar_confirmacion, pedir_datos, crear_orden, handoff, ask_ofi_inter, silence, rechazar, no_interesa, cambio)
- `AccionRegistrada` — structured action record with tipo, turno, origen
- `Phase` — 6 conversation phases (initial, capturing_data, promos_shown, confirming, order_created, closed)
- `SystemEvent` — discriminated union for timer_expired, ingest_complete, readiness_check
- `TransitionResult` — output shape of transition table lookup
- `GuardResult` — blocked/unblocked discriminated union

### constants.ts additions
- `TIPO_ACCION` — const array of all action types
- `SIGNIFICANT_ACTIONS` — set of actions that affect phase derivation

### guards.ts (new)
- `checkGuards(analysis)` — R0 (low confidence + otro -> handoff) and R1 (escape intents -> handoff)
- Returns `GuardResult` discriminated union

### phase.ts (new)
- `derivePhase(acciones)` — derives Phase from action history
- Backward-compatible: accepts both `string[]` and `AccionRegistrada[]`
- Scans from last to first, returns phase for first significant action found

### transitions.ts (new)
- `TRANSITIONS` — 28-entry declarative transition table covering all R2-R9 rules
- `resolveTransition(phase, on, state, gates)` — first-match lookup
- `systemEventToKey(event)` — converts SystemEvent to string key for lookup
- Coverage: acknowledgment exceptions (promos_shown, confirming), quiero_comprar (initial, capturing_data), seleccion_pack, confirmar, system events (ingest, readiness, timer), cambio (D7), closed fallback (D8)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d6211cf | Add state machine types and action constants |
| 2 | a514840 | Create guards, phase derivation, and transition table |

## Deviations from Plan

None — plan executed exactly as written.

## Key Files

### Created
- `src/lib/agents/somnio-v3/guards.ts`
- `src/lib/agents/somnio-v3/phase.ts`
- `src/lib/agents/somnio-v3/transitions.ts`

### Modified
- `src/lib/agents/somnio-v3/types.ts`
- `src/lib/agents/somnio-v3/constants.ts`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `derivePhase` accepts `(string \| AccionRegistrada)[]` | Backward compatibility during migration — old string[] format still works |
| Transition table uses compound string keys for system events | `timer_expired:2` pattern avoids complex discriminated union matching in table |
| Guards return `GuardResult` not `Decision` directly | Clean separation — caller decides how to use guard result |

## Next Plan Readiness

**sm-02 (Decision Engine Refactor)** can proceed. It depends on:
- `Phase` type (available)
- `derivePhase()` function (available)
- `resolveTransition()` function (available)
- `checkGuards()` function (available)

All dependencies satisfied.
