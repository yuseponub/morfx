---
phase: agent-varixcenter
type: validation-strategy
created: 2026-06-11
source: RESEARCH.md §Validation Architecture
---

# Validation Strategy — agent-varixcenter

> Extraído de `RESEARCH.md §Validation Architecture`. Detalles ampliados allí.

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`npx vitest run`) |
| Config file | repo root (existente) |
| Quick run | `npx vitest run src/lib/agents/varixcenter/__tests__/` |
| Full suite | `npx vitest run` |

## Phase Requirements → Test Map

| Req | Behavior | Test Type | Comando | File Exists? |
|-----|----------|-----------|---------|-------------|
| VARIX-CLONE | transiciones válidas §7 (DISENO-COMPLETO 1-42) | unit | `vitest run src/lib/agents/varixcenter/__tests__/transitions.test.ts` | ❌ se crea en Wave 4 (Plan 08) |
| VARIX-CLONE | comprehension 24 intents + enums tipo_venas | unit | `...comprehension.test.ts` | ❌ Wave 4 (Plan 08) |
| VARIX-TEMPLATES | `TEMPLATE_LOOKUP_AGENT_ID='varixcenter'` (anti-Pitfall 1 / cdc06d9) | unit | `...response-track.test.ts` con assert `.not.toBe('godentist')` | ❌ Wave 4 (Plan 08) |
| VARIX-AVAIL | grilla 20min + merge 2 doctores + festivos/domingos excluidos | unit | `vitest run src/lib/domain/varix-clinic/__tests__/availability.test.ts` (mock Supabase) | ❌ Wave 4 (Plan 09) |
| VARIX-BOOK | 23P01 → retry otro doctor → `slot_taken` | unit | `...__tests__/booking.test.ts` (mock Supabase) | ❌ Wave 4 (Plan 09) |
| VARIX-BOOK | nombre/apellido split + celular 10 dígitos | unit | `...__tests__/booking.test.ts` | ❌ Wave 4 (Plan 09) |
| VARIX-VAL | tag VAL guard incluye varixcenter (CRITICAL_FIELDS=cedula) | unit/grep | `grep -cE "varixcenter" src/lib/agents/engine/v3-production-runner.ts` ≥ 1 + regresión godentist | ❌ Wave 3 (Plan 07) |
| VARIX-REGISTER | 6 sitios de registro completos | grep gates | ver PATTERNS.md §Pattern 2 / Plan 07 Task 3 | ❌ Wave 3 (Plan 07) |

## Sampling Rate

- **Per task commit:** `npx vitest run src/lib/agents/varixcenter/__tests__/`
- **Per wave merge:** `npx vitest run` + `tsc --noEmit` (MEMORY: tsc=0 predice deploy Vercel verde; sub-proyectos/tests con type-errors rompen `next build`)
- **Phase gate:** full suite verde + 6 grep gates (Plan 07 Task 3) + Smoke 1 (agent_id `varixcenter` visible en dropdown routing-editor)

## Wave 0 Gaps

- [ ] `src/lib/agents/varixcenter/__tests__/*` — 5-6 suites (no existen; Plan 08)
- [ ] `src/lib/domain/varix-clinic/__tests__/availability.test.ts` + `booking.test.ts` — mock del 2º cliente Supabase (Plan 09)
- [x] Framework: Vitest ya instalado, sin gap de install
- [ ] ⚠️ tsconfig: varix-clinic es OTRO repo en otra carpeta — no entra al `include` de MorfX salvo que se importe código suyo (NO se hace; solo se conecta a su DB)
- [ ] Baseline pre-clone (Plan 01 Task 1): suites godentist + godentist-fb-ig verdes ANTES de tocar archivos compartidos (referencia anti-regresión Regla 6)
