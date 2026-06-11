---
phase: gemini-fallback-haiku
fixed_at: 2026-06-11
review_path: .planning/standalone/gemini-fallback-haiku/REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# gemini-fallback-haiku — Code Review Fix Report

**Fixed at:** 2026-06-11
**Source review:** `.planning/standalone/gemini-fallback-haiku/REVIEW.md`
**Iteration:** 1

**Resumen:**
- Hallazgos en scope: 6 (H-01, M-01, M-02, M-03, M-04, L-01)
- Arreglados: 6
- Saltados: 0
- L-02 y L-03 NO se tocan (deuda documentada por decisión del scope).

**Gates verdes tras los fixes:**
- `npx tsc --noEmit` → exit 0 (cero errores; ignorando ruido de `.next/`).
- Suite canónica v4: **404 passed | 7 skipped | 0 failed** (≥399 requerido; los +5 extra son tests nuevos de H-01/M-01/M-02/M-04).

## Fixed Issues

### H-01 (High) — Errores de red de Gemini no disparaban fallback

**Archivos:** `src/lib/agents/somnio-v4/llm-fallback/saturation.ts`, `.../__tests__/saturation.test.ts`
**Commit:** `a0e9af81`
**Fix:** Los fallos a nivel de red (DNS/ECONNRESET/connection refused/TLS) que `@ai-sdk/provider-utils` (handleFetchError, dist/index.js:496-513, verificado en v4.0.15) envuelve en `APICallError` con `statusCode` undefined + `isRetryable: true` + message "Cannot connect to API" no matcheaban el predicado. Combinado con `maxRetries:0`, el path Gemini quedaba estrictamente peor que antes de la fase. Agregado `if (e.statusCode == null && e.isRetryable === true) return true` en `isGeminiSaturation`. NO afecta Pitfall #4: `NoObjectGeneratedError` no es `APICallError`. Reemplazado el test inútil (`new Error('ECONNRESET')`, shape que el SDK nunca arroja) por el shape REAL (`APICallError` "Cannot connect to API", statusCode undefined, isRetryable true) + caso negativo (statusCode undefined + isRetryable false → false).
**Evidencia:** `saturation.test.ts` 18/18 passed.

### M-01 (Medium) — Branch Anthropic sin timeout guard ni maxRetries

**Archivos:** `llm-fallback/index.ts` (+ `index.test.ts`), `sub-loop/generation-call.ts`, `sub-loop/compliance-check.ts`, `comprehension.ts`, `media/image-classifier.ts`
**Commit:** `f1deff48`
**Fix:** Contrato del helper cambiado a `anthropic: (signal: AbortSignal) => Promise<T>`; el helper crea un `AbortSignal.timeout(TIMEOUT_MS[callSite])` FRESCO por cada invocación de Anthropic (vía `callAnthropic()`) — NO reusa el signal de Gemini que pudo vencer. Los 4 call-sites agregan `abortSignal: signal` + `maxRetries: 0` (doctrina D-05: N=1 también en el último recurso, no acumular backoff). Test nuevo: el closure anthropic recibe un signal distinto al de Gemini.
**Evidencia:** `index.test.ts` 6/6 passed (incluye assert de signal fresco).

### M-02 (Medium) — `fallback_failed` no se emitía con el circuito abierto

**Archivos:** `llm-fallback/index.ts` (+ `index.test.ts`)
**Commit:** `93117b55`
**Fix:** En el path `state === 'open'` se hacía `return anthropic()` sin try/catch. Cambiado a `return await callAnthropic()` envuelto en try/catch que emite `fallback_failed` (con `gemini_error: 'circuit_open'`) ante doble fallo, igualando el path post-saturación. Durante outage sostenido la mayoría de llamadas van por circuit_open (cooldown 30s) → ahora el evento de auditoría D-10 no subreporta. Test nuevo: abre el circuito, luego Haiku falla con circuito abierto → assert `fallback_failed` emitido + Gemini NO se intenta.
**Evidencia:** `index.test.ts` test M-02 passed.

### M-03 (Medium) — Schema saneado perdía la calibración de confidence

**Archivos:** `comprehension.ts` (+ `comprehension-fallback-parity.test.ts`)
**Commit:** `2a47672d` (junto con M-04)
**Fix:** El `.describe(...)` es parte del prompt en structured output. El schema saneado había reemplazado los describes de `intent_confidence`/`secondary_confidence` por strings genéricos ("0..1 self-reported confidence"), perdiendo los anchors de calibración (0.85+/0.50-0.70/<0.40, D-74 isolation). Restaurado el texto de calibración completo verbatim de `comprehension-schema.ts:49-66` (los describes son legales para Anthropic; solo minimum/maximum/exclusive rompen con 400).
**Evidencia:** parity test verifica que los describes sobreviven en el JSON Schema saneado ("campo numérico futuro con bounds" assert).
**Requiere verificación humana:** la calibración exacta del confidence en el branch Haiku solo se confirma con un smoke real Gemini-down (A2 del RESEARCH).

### M-04 (Medium) — Sanitización por lista fija de campos (frágil ante evolución del schema)

**Archivos:** `comprehension.ts`, `sanitize-schema.ts` (nuevo), `comprehension-fallback-parity.test.ts`
**Commit:** `2a47672d` (junto con M-03)
**Fix:** Antes el schema saneado listaba 2 campos a mano → cualquier campo futuro con `.min/.max/.int` heredaba bounds → Anthropic 400 SIEMPRE, descubierto solo en el próximo outage. Creado `sanitize-schema.ts` con `stripNumericConstraints` que recorre el JSON Schema completo (recursivo sobre properties/items/anyOf/$defs) y elimina `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf` en cualquier nivel, preservando `description` y estructura. El branch Anthropic de comprehension ahora envía `jsonSchema()` derivado estructuralmente de `MessageAnalysisSchemaSanitized`. Test endurecido de `countMaxSanitized < countMaxOriginal` a `=== 0` (para minimum/maximum/exclusiveMin/exclusiveMax/multipleOf) + caso nuevo "campo futuro con bounds queda saneado automáticamente, incluido anidado profundo".
**Evidencia:** `comprehension-fallback-parity.test.ts` 11/11 passed.

### L-01 (Low, build risk) — Phantom dependency `@ai-sdk/provider-utils`

**Archivos:** `package.json`, `pnpm-lock.yaml`
**Commit:** `f9cbd56c`
**Fix:** `saturation.ts` importa `isAbortError` de `@ai-sdk/provider-utils`, que era dependencia transitiva (resolvía por hoisting — clase de riesgo de build Vercel registrada en la memoria del proyecto). Declarado explícito en `dependencies` (`^4.0.15`, matchea la instalada en `node_modules/@ai-sdk/provider-utils@4.0.15`). Lockfile actualizado vía `pnpm install --lockfile-only` (pnpm es el manager activo del repo; `pnpm-lock.yaml` es más reciente que `package-lock.json`). pnpm resolvió el rango a 4.0.26 (compatible con `^4.0.15`).
**Nota sobre `package-lock.json`:** NO se actualizó. `npm install` falla por conflicto de peer-deps preexistente (React 19 vs peers viejos) no relacionado con este cambio, y el `package-lock.json` está stale respecto a `package.json` (le faltan devDeps pngjs/pixelmatch que el otro standalone agregó). Forzar su regeneración habría mezclado churn de la sesión concurrente. `pnpm-lock.yaml` (canónico/activo) quedó con diff limpio (solo provider-utils + un bump transitivo menor de eventsource-parser que pnpm resolvió). Decisión documentada para no contaminar el commit.

## Skipped Issues

Ninguno. Los 6 hallazgos en scope fueron arreglados.

**Fuera de scope por decisión (deuda documentada, NO tocados):**
- L-02 (half-open probe stampede) — deuda.
- L-03 (T-fb-08 doc claim sobre `fetchAsBase64`) — deuda.

---

_Fixed: 2026-06-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
