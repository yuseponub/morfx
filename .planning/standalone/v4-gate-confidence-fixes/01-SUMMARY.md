---
phase: v4-gate-confidence-fixes
plan: "01"
subsystem: somnio-v4
tags: [crm-gate, observability, platform-config, threshold, fix]
dependency_graph:
  requires: []
  provides:
    - somnio-v4/crm-gate: crmGateFired usa datosCriticosJustCompleted (trigger b)
    - somnio-v4/sub-loop/response-confidence-threshold: getResponseConfidenceThreshold() via platform_config
    - somnio-v4/comprehension: comprehension_completed incluye secondary_confidence/secondary_query
    - somnio-v4/somnio-v4-agent: comprehension_completed_v4 incluye secondary_confidence/secondary_query
  affects:
    - somnio-v4 sub-loop (threshold now async read from DB, cached 60s)
tech_stack:
  added:
    - sub-loop/response-confidence-threshold.ts (new module, platform_config reader, cache 60s)
  patterns:
    - platform_config singleton cache (clone of threshold.ts pattern)
    - datosCriticosJustCompleted predicate gate (replaces SHIPPING_FIELDS false-positive)
key_files:
  created:
    - src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts
    - src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts
  modified:
    - src/lib/agents/somnio-v4/crm-gate.ts
    - src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts
    - src/lib/agents/somnio-v4/comprehension.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/somnio-v4/sub-loop/index.ts
decisions:
  - "D-01: SHIPPING_FIELDS eliminado — trigger (b) reemplazado por datosCriticosJustCompleted"
  - "D-02: secondary_confidence agregado aditivamente a dos eventos de observabilidad"
  - "D-03: RESPONSE_CONFIDENCE_THRESHOLD parametrizable por SQL; default 0.70 preserva comportamiento"
metrics:
  duration: ~35min
  completed: "2026-06-13"
  tasks_completed: 3
  files_changed: 7
---

# Phase v4-gate-confidence-fixes Plan 01: Three Additive Fixes to somnio-sales-v4

**One-liner:** Eliminación de falso positivo SHIPPING_FIELDS en CRM gate + secondary_confidence en observabilidad + RESPONSE_CONFIDENCE_THRESHOLD parametrizable via platform_config sin deploy.

## What Was Built

Three additive fixes discovered via the v4-observability-completeness standalone. v4 remains DORMANT throughout.

### Fix #1 — crmGateFired trigger (b): SHIPPING_FIELDS → datosCriticosJustCompleted

**Files:** `src/lib/agents/somnio-v4/crm-gate.ts`, `src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts`

**Behavior before:**
- Trigger (b) prendía el CRM gate cuando `newFields ∩ SHIPPING_FIELDS` (incluía 'ciudad')
- Un cliente preguntando "¿cuánto cuesta el envío a Bucaramanga?" extraía `ciudad=bucaramanga`
- Esto prendía el gate → sub-loop grounded se invocaba → crasheaba con `AI_NoObjectGeneratedError`
- porque los datos críticos estaban incompletos (no había pedido que actualizar)

**Behavior after:**
- Trigger (b) prendía solo cuando `datosCriticosJustCompleted=true` (TODOS los campos críticos recién completados en este turno)
- El caso Bucaramanga: `datosCriticosJustCompleted=false` (datos incompletos) → gate=false → no crash
- `args.changes.datosCriticosJustCompleted` disponible en `RunCrmGateArgs.changes` (type `StateChanges`)

**Eliminated:** `SHIPPING_FIELDS` const (8 líneas), `newFields: string[]` de la firma de `crmGateFired`

**Tests:** 7 → 8 it-blocks. Nuevo test explícito: "regresión caso Bucaramanga" (category=pregunta, datosCriticosJustCompleted=false → false)

**Commits:** `9e291d8e`

---

### Fix #2 — secondary_confidence en dos eventos de observabilidad

**Files:** `src/lib/agents/somnio-v4/comprehension.ts`, `src/lib/agents/somnio-v4/somnio-v4-agent.ts`

**comprehension_completed** (comprehension.ts ~línea 242):
- Antes: payload tenía `secondary` (label) pero faltaban `secondary_confidence`, `secondary_confidence_reasoning`, `secondary_query`
- Después: 3 campos nuevos agregados después de `tokensUsed`

**comprehension_completed_v4** (somnio-v4-agent.ts ~línea 446):
- Antes: payload no tenía ningún campo del secondary intent
- Después: 4 campos nuevos (`secondary` con null-filter para 'ninguno', más las 3 propiedades de confianza)
- `secondary` se emite como null cuando `analysis.intent.secondary === 'ninguno'` para que `IS NOT NULL` en SQL filtre turnos con secondary real

**No nuevas importaciones** — todos los campos vienen de `analysis.intent` ya en scope

**Commits:** `3dc46d75`

---

### Fix #3 — RESPONSE_CONFIDENCE_THRESHOLD parametrizable via platform_config

**Files creados:** `src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts`, `src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts`

**Files modificados:** `src/lib/agents/somnio-v4/sub-loop/index.ts`

**Nuevo módulo** (clona patrón de `threshold.ts`):
- `getResponseConfidenceThreshold()` lee `platform_config.somnio_v4_response_confidence_threshold`
- Cache 60s para no martillar DB en cada sub-loop call
- Fallback robusto a 0.70 si key ausente / valor inválido ([0..1]) / DB error
- `__clearResponseConfidenceThresholdCache()` exportada para tests

**sub-loop/index.ts cambios:**
- Eliminado: `const RESPONSE_CONFIDENCE_THRESHOLD = 0.70` a nivel módulo (líneas 44-48)
- Agregado: `import { getResponseConfidenceThreshold } from './response-confidence-threshold'`
- Agregado: `const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()` al inicio de `runRagSubLoop` (antes de CALL 1 — Tooling)
- Las 2 referencias existentes (threshold emit línea ~420 + threshold check línea ~447) quedan sintácticamente idénticas

**Parametrización SQL:**
```sql
-- Sin key = fallback 0.70 (comportamiento idéntico al hardcodeado)
SELECT * FROM platform_config WHERE key = 'somnio_v4_response_confidence_threshold';
-- 0 rows esperado

-- Para calibrar threshold sin deploy:
INSERT INTO platform_config (key, value) VALUES ('somnio_v4_response_confidence_threshold', '0.65')
ON CONFLICT (key) DO UPDATE SET value = '0.65';
```

**Tests:** 5/5 verdes (default 0.70, valor válido, fuera de rango, error DB, cache 60s)

**Commits:** `1e9c4ebb`

---

## Regla 6 Compliance

```
git diff --name-only HEAD~3 HEAD | grep -vE "somnio-v4|v4-gate-confidence"
# → 0 líneas (PASS)
```

Todos los 7 archivos modificados pertenecen a `src/lib/agents/somnio-v4/`. Cero archivos de v3/godentist/recompra/pw-confirmation/interruption-system/engine tocados.

v4 sigue DORMANT — no se tocó `routing_rules` ni `workspace_agent_config`. El push a Vercel (Regla 1) es seguro porque ningún code path productivo activo lo ejecuta.

## Deviations from Plan

### Pre-existing LLM flakiness in smoke-rag-b

**Found during:** Verificación final (suite completa)
**Issue:** `smoke-rag-b.test.ts` case 2 ("ayer fue un día raro, no pude dormir") retorna `generated` en vez del esperado `no_match`. Esto es variabilidad de la respuesta de confianza del LLM (Gemini decide responseConfidence ≥ 0.70, así que genera respuesta en vez de handoff).
**Confirmado pre-existente:** Se ejecutó `git stash` + re-run de smoke-rag-b — caso 2 (y otros) ya fallaban antes de estos 3 commits. `SMOKE-B-RESULTS.md` de 2026-06-11 documenta case 1 como FAIL con `generated` (misma clase de fallo).
**Fix:** No aplica — estos son smoke tests que dependen de respuestas reales de Gemini. El threshold fix (Fix #3) puede usarse para ajustar via SQL si se quiere bajar el handoff threshold y hacer más propenso el no_match.
**Deferred:** Dentro del scope de `v4-smoke-stability` standalone.

## Known Stubs

None — no hay stubs. Todos los fixes son concretos:
- Fix #1: predicate logic real (no placeholder)
- Fix #2: campos reales de `analysis.intent` ya presentes en schema (no hardcoded)
- Fix #3: DB lookup real con fallback (no mock)

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-v4gcf-01 | sub-loop/response-confidence-threshold.ts | platform_config value validado [0..1] antes de usar; fuera de rango → fallback 0.70 (aceptado — solo admin accede via service_role) |

## Self-Check

- [x] `src/lib/agents/somnio-v4/crm-gate.ts` — existe, SHIPPING_FIELDS=0 matches
- [x] `src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` — existe, 8 it-blocks
- [x] `src/lib/agents/somnio-v4/comprehension.ts` — secondary_confidence presente línea 242
- [x] `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — secondary_confidence presente línea 447
- [x] `src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` — existe
- [x] `src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts` — existe
- [x] `src/lib/agents/somnio-v4/sub-loop/index.ts` — ^const RESPONSE_CONFIDENCE_THRESHOLD=0 matches, await getResponseConfidenceThreshold=1 match
- [x] Commits: `3dc46d75`, `1e9c4ebb`, `9e291d8e` — todos en git log
- [x] tsc=0
- [x] push origin/main — ba54a1a1..9e291d8e

## Self-Check: PASSED
