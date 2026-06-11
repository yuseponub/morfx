---
phase: agent-varixcenter
fixed_at: 2026-06-11T00:00:00Z
review_path: .planning/standalone/agent-varixcenter/REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# agent-varixcenter: Code Review Fix Report

**Fixed at:** 2026-06-11
**Source review:** `.planning/standalone/agent-varixcenter/REVIEW.md`
**Iteration:** 1

**Resumen:**
- Findings en scope: 4 (1 CRITICAL + 3 WARNING)
- Fixed: 4
- Skipped: 0

## Tabla finding → fix → commit

| Finding | Severidad | Fix aplicado | Archivos | Commit |
|---------|-----------|--------------|----------|--------|
| CR-01 | CRITICAL | `parseSlotToISO` tolera slots sin separador ` - ` (formato `"10:00 AM"` de la comprehension): calcula `fin = inicio + SLOT_MINUTES` cuando no viene `endStr`. Retrocompatible con el rango completo. Casing manejado por el flag `i` del regex de `parseTimeToMinutes`. | `src/lib/domain/varix-clinic/availability.ts`, `src/lib/domain/varix-clinic/__tests__/availability.test.ts` | `37e9f42e` |
| W-01 | WARNING | La query de `appointments` ahora desestructura `error` y hace `throw` si falla (red/RLS/permiso). Nunca trata error como "0 citas = todos los slots libres". El caller (`varixcenter-agent`) ya hace fail-open. | `src/lib/domain/varix-clinic/availability.ts`, `src/lib/domain/varix-clinic/__tests__/availability.test.ts` | `37e9f42e` |
| W-02 | WARNING | Fila catch-all `* + otro -> handoff` agregada en `transitions.ts` (patrón godentist). `otro` con conf>=80 (no interceptado por guard R0) ya no cae en `natural_silence`: siempre escala a humano. El catch-all phase-específico de `appointment_registered` sigue ganando post-cita. No existe template `fallback` en el catálogo de 46 → se usa `handoff`. | `src/lib/agents/varixcenter/transitions.ts`, `src/lib/agents/varixcenter/__tests__/transitions.test.ts` | `aa5d9425` |
| W-03 | WARNING | El fail-fast por env vars faltantes ya ocurría pre-cache (correcto, no era el gap). El gap real: `createClient` no lanza con URL malformada → cacheaba un singleton inválido. Agregada validación `new URL(url)` antes de cachear, así el throw fail-fast ocurre en el getter (caller hace fail-open) y nunca se cachea un cliente con credenciales inválidas. | `src/lib/domain/varix-clinic/client.ts` | `55e34d6b` |

## Detalle de fixes

### CR-01: parseSlotToISO recibe formato incorrecto desde horario_seleccionado

Se aplicó la **Opción B** del review. `horario_seleccionado` capturado por la
comprehension llega como `"10:00 AM"` (solo hora de inicio, ver
`comprehension-schema.ts`: `"el de las 10" -> "10:00 AM"`), pero
`parseSlotToISO` esperaba el rango completo `"10:00 AM - 10:20 AM"`. El
`slotStr.split(' - ')` dejaba `endStr = undefined` → `parseTimeToMinutes(undefined).trim()`
→ TypeError → `agendar_cita` siempre degradaba a `handoff` (booking inoperante en prod).

Ahora `parseSlotToISO` calcula `fin = inicio + SLOT_MINUTES` cuando no hay separador
o el `endStr` no parsea, y sigue retrocompatible con el rango completo. Verificado el
flujo real en `varixcenter-agent.ts:366`: el formato puede variar en casing
(`"10:00 am"`) — cubierto por el flag `i` del regex existente.

**Tests de regresión agregados:** `parseSlotToISO('2026-06-15', '10:00 AM')` →
`{ inicio: '...T10:00:00-05:00', fin: '...T10:20:00-05:00' }`, formato PM solo-inicio,
formato rango completo (retrocompat) y casing minúscula.

### W-01: Query de availability ignora el error de Supabase

`throw` ante `apptError`; el caller hace fail-open a `sin_disponibilidad`/handoff.
Test con mock de error verifica que la función lanza (`/availability query failed/`).

### W-02: intent `otro` con confianza >=80 queda en silencio

Patrón godentist seguido. Tests por fase (`initial`, `capturing_data`,
`capturing_fecha`, `showing_availability`, `confirming`) verifican `handoff`;
test extra verifica que `appointment_registered + otro` sigue en `silence` (post-cita).

### W-03: singleton cachea credenciales inválidas

Validación de formato de URL antes de cachear. **Requiere verificación humana
del comportamiento de fail-open en runtime** (no hay test unitario de cliente;
el comportamiento se confirma indirectamente vía availability/booking).

## Verificación

- `npx vitest run src/lib/agents/varixcenter/ src/lib/domain/varix-clinic/ src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/` → **251/251 verde, 16 archivos** (baseline godentist intacto).
- `npx tsc --noEmit` → **0 errores**.

---

_Fixed: 2026-06-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
