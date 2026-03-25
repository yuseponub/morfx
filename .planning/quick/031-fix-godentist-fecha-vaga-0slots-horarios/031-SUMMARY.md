---
phase: quick-031
plan: 01
subsystem: godentist-agent
tags: [godentist, fecha-vaga, availability-fallback, schedules]
completed: 2026-03-24
duration: ~8min
tech-stack:
  patterns: [mutual-exclusivity-fields, fail-open-fallback, timer-override]
key-files:
  modified:
    - src/lib/agents/godentist/constants.ts
    - src/lib/agents/godentist/types.ts
    - src/lib/agents/godentist/comprehension-schema.ts
    - src/lib/agents/godentist/comprehension-prompt.ts
    - src/lib/agents/godentist/state.ts
    - src/lib/agents/godentist/godentist-agent.ts
    - src/lib/agents/godentist/response-track.ts
  created:
    - scripts/godentist-fecha-vaga-templates.sql
---

# Quick 031: Fix GoDentist fecha_vaga + 0-slot fallback + real schedules

**One-liner:** Vague dates extracted as fecha_vaga (not fecha_preferida), 0-slot availability shows real sede schedules, L4 guard prevents retoma_horario on empty slots, comprehension prompt corrected with per-sede jornada partida.

## Changes Summary

### Task 1: fecha_vaga field + real schedules + comprehension
- **constants.ts**: Added `HORARIOS_GENERALES_SEDE` map with real per-sede jornada partida schedules
- **types.ts**: Added `fecha_vaga: string | null` to `DatosCliente`
- **comprehension-schema.ts**: Added `fecha_vaga` field to `extracted_fields` with clear instructions on when to use vs `fecha_preferida`
- **comprehension-prompt.ts**: Replaced single incorrect HORARIOS line with per-sede schedule block; added fecha_vaga extraction rules
- **state.ts**: Added `fecha_vaga` to initial state, merge logic (mutually exclusive with fecha_preferida), and resumen context

### Task 2: 0-slot fallback + L4 guard + pedir_fecha suggestion
- **godentist-agent.ts**: Added `availabilityFallback` flag for 0-slot detection and lookup failures (fail-open); L4 timer replaced with L3 when fallback active
- **response-track.ts**: `mostrar_disponibilidad` now returns `horarios_generales_sede` intent on fallback; `pedir_fecha` returns `pedir_fecha_con_sugerencia` when fecha_vaga exists; added `computeFechaVagaSuggestion` helper (first Tuesday of referenced month)
- **SQL script**: Two new templates (`horarios_generales_sede`, `pedir_fecha_con_sugerencia`) ready for manual application

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 797b2f5 | feat(quick-031): add fecha_vaga field + real sede schedules + comprehension changes |
| 2 | 1bc41aa | feat(quick-031): 0-slot fallback + L4 guard + pedir_fecha suggestion |

## Deviations from Plan

None - plan executed exactly as written.

## Pending User Actions

1. **Apply SQL script** `scripts/godentist-fecha-vaga-templates.sql` in Supabase SQL editor BEFORE deploying code (Regla 5)
2. Push to Vercel after SQL is applied

## Verification

- TypeScript compiles cleanly (no godentist errors)
- `fecha_vaga` wired through: types, schema, prompt, state merge, resumen context
- `HORARIOS_GENERALES_SEDE` in constants.ts and response-track.ts
- `availabilityFallback` in godentist-agent.ts and response-track.ts
- L4 timer override: `timerSignals.length = 0` in godentist-agent.ts
- `computeFechaVagaSuggestion` helper in response-track.ts
- SQL script at `scripts/godentist-fecha-vaga-templates.sql`
