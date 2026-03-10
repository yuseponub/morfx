# Quick 017: Accion Retoma L5 Initial Template Summary

**One-liner:** New 'retoma' action type for L5 timer in initial phase sends retoma_inicial template instead of pedir_datos

## What Was Done

### Task 1: Add 'retoma' action type and wire constants
- Added `'retoma'` to `TipoAccion` union in `types.ts`
- Added `retoma: ['retoma_inicial']` to `ACTION_TEMPLATE_MAP` in `constants.ts`
- Added `retoma_inicial: ['retoma_inicial']` to `V3_TO_V1_INTENT_MAP` in `constants.ts`
- Changed L5 initial transition action from `'pedir_datos'` to `'retoma'` in `transitions.ts`
- Did NOT add 'retoma' to SIGNIFICANT_ACTIONS (intentional — retoma should not change phase)
- **Commit:** 6c9fe3a

### Task 2: Create DB migration for retoma_inicial template
- Created migration `20260310000000_retoma_inicial_template.sql`
- Inserts retoma_inicial template for both visit types (primera_vez, siguientes)
- Message: "¿Deseas adquirir el tuyo?"
- **Commit:** f4376f2

## Key Design Decisions

1. **retoma is NOT a significant action** — Phase stays 'initial' after retoma, which is the desired behavior. Only SIGNIFICANT_ACTIONS trigger phase transitions.
2. **Separate action type** — Using 'retoma' instead of 'pedir_datos' ensures the template mapping flows through ACTION_TEMPLATE_MAP default path correctly, sending retoma_inicial instead of captura_datos_si_compra.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing vitest type errors unrelated to changes)
- All key links verified: transitions.ts L5 initial -> action 'retoma' -> ACTION_TEMPLATE_MAP['retoma'] -> ['retoma_inicial'] -> V3_TO_V1_INTENT_MAP -> 'retoma_inicial' DB key

## Files Modified

- `src/lib/agents/somnio-v3/types.ts` — Added 'retoma' to TipoAccion
- `src/lib/agents/somnio-v3/constants.ts` — Added retoma mappings
- `src/lib/agents/somnio-v3/transitions.ts` — Changed L5 initial action
- `supabase/migrations/20260310000000_retoma_inicial_template.sql` — New template

## Migration Required

**IMPORTANT:** Migration `20260310000000_retoma_inicial_template.sql` must be applied to production BEFORE deploying the code changes.

## Duration

~2 minutes
