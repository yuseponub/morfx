---
phase: quick-025
plan: 01
subsystem: agent-v3-templates
tags: [templates, v3-agent, decoupling, somnio]
dependency-graph:
  requires: [phase-14, phase-34]
  provides: [v3-independent-templates, saludo-ordering-fix]
  affects: [v3-agent-behavior]
tech-stack:
  added: []
  patterns: [independent-template-sets-per-agent]
key-files:
  created:
    - supabase/migrations/20260315150000_v3_independent_templates.sql
  modified:
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/response-track.ts
decisions:
  - id: q025-d1
    description: "Use v3 intent names directly in DB instead of mapping at runtime"
    rationale: "Eliminates coupling between v1 and v3 agents, simplifies code"
  - id: q025-d2
    description: "No separate ofrecer_promos template — ACTION_TEMPLATE_MAP maps to 'promociones'"
    rationale: "ACTION_TEMPLATE_MAP already resolves ofrecer_promos action to 'promociones' intent"
metrics:
  duration: "~15 min"
  completed: "2026-03-15"
---

# Quick 025: Independizar Templates v3 de v1 Summary

**One-liner:** v3 agent now loads 45 own templates from DB with v3 intent names, no v1 fallback, saludo-first ordering

## What Was Done

### Task 1: SQL Migration with v3 Templates
- Created idempotent migration inserting 45 template rows for `agent_id='somnio-sales-v3'`
- 29 intent groups covering all content from v1, mapped to v3 intent names
- Intent renames: hola->saludo, contenido_envase->contenido, modopago->pago, invima->registro_sanitario, contraindicaciones->efectos, sisirve->efectividad, captura_datos_si_compra->pedir_datos, compra_confirmada->confirmacion_orden, no_confirmado->rechazar, ofrecer_promos->promociones
- All other intents kept same name
- Commit: `4307052`

### Task 2: Apply Migration (Human Action)
- User applied migration in production
- Verified: 45 rows for somnio-sales-v3, v1 unchanged at 95 rows

### Task 3: Remove v1 Dependencies + Fix Saludo Ordering
- Deleted `V3_TO_V1_INTENT_MAP` (38 lines) from `constants.ts`
- Removed v3->v1 intent mapping loop from `response-track.ts`
- Removed fallback to `somnio-sales-v1` (10 lines)
- Changed `selectionMap` from `let` to `const` (uses `allIntents` directly)
- Fixed saludo ordering: when `saludo` is in infoTemplateIntents, info intents go BEFORE sales intents
- Net result: -70 lines, +7 lines
- Commit: `cf8249d`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. `npx tsc --noEmit` - passes (only pre-existing vitest test file errors)
2. `grep -r "V3_TO_V1_INTENT_MAP" src/` - returns nothing
3. `grep "somnio-sales-v1" src/lib/agents/somnio-v3/response-track.ts` - returns nothing
4. Saludo ordering logic confirmed correct
5. v1 files completely untouched (only constants.ts and response-track.ts modified)
