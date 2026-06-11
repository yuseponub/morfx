---
phase: standalone/gemini-fallback-haiku
plan: 03
subsystem: infra
tags: [ai-sdk, gemini, anthropic, haiku, fallback, zod, schema-sanitization, somnio-v4, vitest]

# Dependency graph
requires:
  - phase: standalone/gemini-fallback-haiku Plan 01
    provides: "Modulo llm-fallback/ (callWithGeminiFallback, CallSite, __resetBreakers) acotado a somnio-v4"
provides:
  - "comprehension.ts v4 con fallback Gemini 2.5 Flash → Haiku 4.5 ante saturacion (callSite 'comprehension')"
  - "MessageAnalysisSchemaSanitized — schema saneado sin min/max para el branch Anthropic (Pitfall #1)"
  - "clampConfidence(raw) exportado — clamp 0..1 defensivo pre-strict-parse (T-fb-05)"
  - "Re-throw diagnostico fuera del closure gemini (Pitfall #5) — APICallError crudo llega al helper"
affects: [gemini-fallback-haiku-wave2, somnio-v4, llm-fallback-call-site-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema saneado LOCAL en el call-site (sin tocar comprehension-schema.ts — D-25) via MessageAnalysisSchema.extend sobre .shape.intent"
    - "Branch Anthropic con schema saneado + validacion de rango en post-parse (clamp) — Anthropic rechaza min/max en JSON Schema (issues vercel/ai #14342/#13355)"
    - "Closure gemini con generateText limpio: el re-throw diagnostico se aplica DESPUES del helper para no destruir la instancia APICallError (Pitfall #5)"
    - "Test determinista de paridad via z.toJSONSchema introspection + clamp directo (sin LLM real)"

key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts
  modified:
    - src/lib/agents/somnio-v4/comprehension.ts

key-decisions:
  - "Schema saneado vive LOCAL en comprehension.ts (MessageAnalysisSchemaSanitized) — comprehension-schema.ts byte-identico (D-25)"
  - "El branch gemini usa MessageAnalysisSchema intacto (Gemini ignora min/max); solo el branch anthropic usa el saneado (Pitfall #1)"
  - "clampConfidence extraido como funcion exportada (minimal change) para test determinista — invocado en parseAnalysis antes del strict parse contra el schema con min/max"
  - "Branch anthropic SIN providerOptions.google (safetySettings es google-only — Pitfall #7)"
  - "Modelo Anthropic = literal 'claude-haiku-4-5' via '@ai-sdk/anthropic' directo — NUNCA el wrapper claude-client.ts que mapea a Sonnet (Pitfall #10)"

patterns-established:
  - "Pitfall #1 (Anthropic min/max 400): schema saneado por branch + clamp post-parse contra el schema original con bounds"
  - "Pitfall #5 (re-throw diagnostico destruye APICallError): el closure del provider hace el generateText limpio; el wrapping diagnostico va FUERA del helper de fallback"

requirements-completed: [D-01, D-02, D-05, D-06, D-09]

# Metrics
duration: ~12min
completed: 2026-06-11
---

# Standalone gemini-fallback-haiku Plan 03: Wiring de comprehension con fallback Gemini→Haiku 4.5 Summary

**`comprehend()` v4 ahora cae a Haiku 4.5 ante saturacion de Gemini via `callWithGeminiFallback` (callSite 'comprehension'), resolviendo las DOS complicaciones del RESEARCH especificas de este call-site: Pitfall #1 (Anthropic rechaza min/max → `MessageAnalysisSchemaSanitized` sin bounds + clamp 0..1 post-parse) y Pitfall #5 (el re-throw diagnostico se reubico FUERA del closure gemini para que el `APICallError` de saturacion llegue crudo al helper). Firma publica intacta, `comprehension-schema.ts` byte-identico (D-25), suite de paridad determinista de 10 tests verde.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-11
- **Tasks:** 2
- **Files created:** 1 (test)
- **Files modified:** 1 (comprehension.ts)

## Accomplishments
- `comprehension.ts`: el bloque `generateText` se reemplazo por `callWithGeminiFallback({ callSite: 'comprehension', gemini, anthropic })`. El branch `gemini` mantiene Gemini 2.5 Flash con `maxRetries:0` (D-05), `abortSignal` inyectado por el helper (D-06), schema original + safetySettings. El branch `anthropic` usa `anthropic('claude-haiku-4-5')` (D-02) con el schema saneado y sin `providerOptions.google` (Pitfall #7).
- **Pitfall #1 resuelto:** `MessageAnalysisSchemaSanitized = MessageAnalysisSchema.extend({ intent: ...extend({ intent_confidence: z.number(), secondary_confidence: z.number().nullable() }) })` — quita `.min(0).max(1)` SOLO para el branch Anthropic. Vive local en comprehension.ts; `comprehension-schema.ts` no se toco (D-25).
- **Pitfall #5 resuelto:** el closure `gemini` hace el `generateText` limpio (sin try/catch interno). El re-throw diagnostico `[Comprehension-v4 generateText]` quedo en el `catch` que envuelve la llamada al helper → un error de saturacion llega como `APICallError` crudo a `isGeminiSaturation` (si lo hubiera envuelto, `APICallError.isInstance` daria false).
- **T-fb-05 resuelto:** `clampConfidence(raw)` exportado clampa `intent_confidence`/`secondary_confidence` a 0..1 ANTES del strict parse contra `MessageAnalysisSchema` (que conserva min/max) — el branch Anthropic con schema saneado puede devolver valores fuera de rango y el clamp los corrige.
- Suite `comprehension-fallback-parity.test.ts` (10 tests): schema saneado acepta 0..1 y fuera de rango; introspeccion JSON Schema confirma menos `maximum` que el original; clamp corrige 1.5→1.0 y -0.3→0.0; paridad de shape gemini↔anthropic; no-fallback en parse error documentado. `__resetBreakers()` en `afterEach`.

## Task Commits

Each task was committed atomically (--no-verify, parallel worktree):

1. **Task 1: Schema saneado + wiring de comprehend con fallback (Pitfall #1 + #5)** - `ff604a38` (feat)
2. **Task 2: Suite de paridad comprehension** - `b744a0c9` (test)

_Nota: el `export` de `MessageAnalysisSchemaSanitized` (necesario para la introspeccion del test) se incluyo en el commit de Task 2 junto con el test que lo consume._

## Files Created/Modified
- `src/lib/agents/somnio-v4/comprehension.ts` - Wiring del fallback + schema saneado + clampConfidence exportado + re-throw reubicado
- `src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` - 10 tests deterministas (schema saneado, clamp, paridad de shape)

## Decisions Made
None de fondo — plan ejecutado verbatim. Decisiones de implementacion menores:
- `clampConfidence` extraido como funcion exportada (el plan permitia "exportarla o extraer una funcion exportada para testear — minimal change"). Se invoca en `parseAnalysis` antes del strict parse.
- Tercer test del schema saneado usa `z.toJSONSchema` (introspeccion del JSON Schema) comparando el conteo de `"maximum"` saneado < original, en vez de assert literal de ausencia — robusto ante cambios de otros bounds del schema.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixes de codigo.
**Impact on plan:** Plan ejecutado exactamente como fue escrito. Sin scope creep.

## Issues Encountered
- El plan (Paso C) mostraba el clamp inline en parseAnalysis con un typo deliberado (`| undefined` y `as Record<string,unknown> | undefined`) que el propio plan instruia ajustar. Se resolvio extrayendo `clampConfidence` exportada con el cast correcto (`as Record<string, unknown> | undefined`). Sin impacto — el plan anticipaba este ajuste.

## Verification
- `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` → **1 suite PASS, 10 tests PASS**.
- `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` → **10/10 PASS** (sin regresion; D-25 intacto).
- `npx tsc --noEmit` → **0 errores totales** en todo el proyecto.
- `git diff HEAD~2 HEAD -- comprehension-schema.ts` → **vacio** (D-25 — schema original byte-identico).
- Firma `comprehend(message, history, existingData, recentBotMessages)` intacta (Regla 6 — consumidor unico somnio-v4-agent.ts; v3/godentist/recompra/pw-confirmation no tocados).
- Acceptance criteria grep Task 1: callSite==1, anthropic haiku==1, SchemaSanitized==3 (>=2), maxRetries:0==1, abortSignal:signal==1, claude-client==0, re-throw>=1, branch anthropic sanitized==1, branch gemini original==1, comprehend signature==1 — TODOS PASS.
- Acceptance criteria grep Task 2: clamp/1.5/Math.min==17 (>=1), MessageAnalysisSchema==16 (>=1), __resetBreakers==2 (>=1) — TODOS PASS.

## Next Phase Readiness
- comprehension.ts es el 3er call-site wireado del fallback (junto a generation-call.ts Plan 02 y image-classifier.ts Plan 04 en Wave 2). El modulo llm-fallback queda con un consumidor mas.
- Smoke real con casos medicos (alcohol/embarazo/anticoagulante) para confirmar que Haiku 4.5 no rehusa el contenido KB Somnio queda para activacion v4 (RESEARCH §Pitfall mitigacion, ASSUMED).
- v4 sigue DORMANT en prod — este wiring no altera el comportamiento del agente activo (Regla 6 satisfecha: el fallback solo se ejerce ante saturacion real de Gemini, y v4 no tiene trafico).

## Self-Check: PASSED
- Archivo creado: `comprehension-fallback-parity.test.ts` FOUND.
- Archivo modificado: `comprehension.ts` FOUND.
- Commits: `ff604a38`, `b744a0c9` FOUND.

---
*Standalone: gemini-fallback-haiku*
*Completed: 2026-06-11*
