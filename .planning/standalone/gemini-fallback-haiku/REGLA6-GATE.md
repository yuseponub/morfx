# gemini-fallback-haiku — Gate Regla 6 (Plan 05, Wave 3)

**Fecha:** 2026-06-11
**Ejecutor:** gsd-plan-executor (secuencial, main tree)
**BASE de la fase:** `d29f199e9d2eda63d221510fdc4d77381baa6675` (último commit ANTES de la fase — `docs(whatsapp-inbox-reliability 03)`)
**HEAD al correr el gate:** `8779b625` (la fase llegó vía merges de worktree `f36cf076` + `b05cacb2`/`c35bf7ee`/`f6b208fc`; HEAD avanzó por una sesión concurrente de whatsapp-inbox-reliability, sin tocar paths de esta fase)

**VEREDICTO GLOBAL: ✅ OK — 6/6 checks PASS. Cero regresión Regla 6.**

---

## Check 1 — Suite canónica v4 + nuevas suites del fallback ✅ OK

Comando (VERBATIM del plan):
```bash
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```

Resultado:
```
 Test Files  44 passed | 1 skipped (45)
      Tests  399 passed | 7 skipped (406)
   Duration  99.65s
```

- **Baseline post-consolidación:** 358 passed | 7 skipped.
- **Nuevo baseline tras esta fase:** **399 passed | 7 skipped** (+41 tests del fallback: 27 del módulo `llm-fallback/` + 4 sub-loop fallback-parity + 10 comprehension-fallback-parity + 3 image-classifier-fallback − solapes de conteo del path media/somnio-v4).
- **skipped sin cambios (7):** mismo conteo que el baseline (incluye `comprehension-gemini.test.ts` 3 skipped, etc.). Cero regresión.
- Los eventos `[gemini-fallback] circuit_opened / fallback_triggered / fallback_failed` aparecen en stdout de los tests deterministas → observability D-10 ejercitada.

**Veredicto: VERDE. >= 358 baseline + nuevas suites del fallback. OK.**

---

## Check 2 — `npx tsc --noEmit` ✅ OK (0 errores de fuente)

Resultado:
```
.next/dev/types/routes.d.ts(191,25): error TS1005: ';' expected.
.next/dev/types/routes.d.ts(194,1): error TS1128: Declaration or statement expected.
```

- **2 errores, ambos en `.next/dev/types/routes.d.ts`** — artefacto GENERADO por el dev-server de Next, NO código fuente, NO parte del build de Vercel. Pre-existente y conocido (orchestrator fact + memoria `build_subprojects_break_next_build`).
- **0 errores atribuibles a archivos de esta fase.** Los SUMMARYs 02/03 ya reportaron `tsc --noEmit` con 0 errores totales en sus puntos de ejecución; este gate confirma 0 errores de fuente.

**Veredicto: 0 errores nuevos de fuente. OK (los 2 son ruido generado pre-existente).**

---

## Check 3 — Diff acotado a paths permitidos (Regla 6) ✅ OK

```bash
git diff --stat <BASE>..HEAD -- src/lib/
```

17 archivos tocados — TODOS dentro de los paths permitidos (4 call-sites + 5 código módulo + 8 tests):

| Archivo | Tipo | Plan |
|---------|------|------|
| `somnio-v4/llm-fallback/config.ts` | código (módulo) | 01 |
| `somnio-v4/llm-fallback/saturation.ts` | código (módulo) | 01 |
| `somnio-v4/llm-fallback/observability.ts` | código (módulo) | 01 |
| `somnio-v4/llm-fallback/breaker.ts` | código (módulo) | 01 |
| `somnio-v4/llm-fallback/index.ts` | código (módulo) | 01 |
| `somnio-v4/llm-fallback/__tests__/saturation.test.ts` | test | 01 |
| `somnio-v4/llm-fallback/__tests__/observability.test.ts` | test | 01 |
| `somnio-v4/llm-fallback/__tests__/breaker.test.ts` | test | 01 |
| `somnio-v4/llm-fallback/__tests__/index.test.ts` | test | 01 |
| `somnio-v4/sub-loop/generation-call.ts` | call-site 1 | 02 |
| `somnio-v4/sub-loop/compliance-check.ts` | call-site 2 | 02 |
| `somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` | test | 02 |
| `somnio-v4/comprehension.ts` | call-site 3 | 03 |
| `somnio-v4/__tests__/comprehension-fallback-parity.test.ts` | test | 03 |
| `media/image-classifier.ts` | call-site 4 | 04 |
| `media/__tests__/image-classifier-fallback.test.ts` | test | 04 |
| `media/__tests__/image-classifier.test.ts` | test (deviation Wave 2) | 04 |

**Nota deviation documentada (Plan 04, Rule 3):** `media/__tests__/image-classifier.test.ts` aparece con `12 ±` líneas. Es la actualización mecánica de mocks `experimental_output:` → `output:` como consecuencia obligada de la migración a `safeAccessOutput` (Pitfall #11). NO es código de producción de un agente; es un test del propio call-site de visión. Path permitido (queda bajo `src/lib/agents/media/` v4-gated). Documentado en `04-SUMMARY.md`.

Total: `17 files changed, 1472 insertions(+), 116 deletions(-)`. NINGÚN archivo de v3/godentist/recompra/pw-confirmation/core/tooling-call/claude-client/comprehension-schema.

**Veredicto: diff acotado a los paths permitidos. OK.**

---

## Check 4 — Greps nominales de no-regresión (cada uno VACÍO) ✅ OK

```bash
git diff <BASE>..HEAD -- <path>
```

| Path | Líneas diff | Esperado | Veredicto |
|------|-------------|----------|-----------|
| `src/lib/agents/somnio-v3/` | 0 | vacío | ✅ |
| `src/lib/agents/godentist/` | 0 | vacío | ✅ |
| `src/lib/agents/godentist-fb-ig/` | 0 | vacío | ✅ |
| `src/lib/agents/somnio-recompra/` | 0 | vacío | ✅ |
| `src/lib/agents/somnio-pw-confirmation/` | 0 | vacío | ✅ |
| `src/lib/agents/somnio-v4/core/` | 0 | vacío (D-04) | ✅ |
| `src/lib/agents/somnio-v4/sub-loop/tooling-call.ts` | 0 | vacío (GPT-4.1-mini, D-01 FUERA) | ✅ |
| `src/lib/agents/claude-client.ts` | 0 | vacío (Pitfall #10, mapping stale intacto) | ✅ |
| `src/lib/agents/somnio-v4/comprehension-schema.ts` | 0 | vacío (D-25) | ✅ |

**Veredicto: los 9 byte-idénticos. 5 agentes no-v4 + core + tooling-call + claude-client + comprehension-schema sin tocar. OK (mitiga T-fb-09).**

---

## Check 5 — Grep negativo `claude-client` en módulo + 4 call-sites ✅ OK

```bash
grep -rn "claude-client" src/lib/agents/somnio-v4/llm-fallback/ \
  src/lib/agents/somnio-v4/sub-loop/generation-call.ts \
  src/lib/agents/somnio-v4/sub-loop/compliance-check.ts \
  src/lib/agents/somnio-v4/comprehension.ts \
  src/lib/agents/media/image-classifier.ts
```

5 ocurrencias del token literal `claude-client`, **TODAS en comentarios**:
- `config.ts:6/9/18` — el LANDMINE warning Pitfall #10 (escrito verbatim por el plan de Wave 1).
- `generation-call.ts:96` + `compliance-check.ts:226` — comentario `// D-02 — via @ai-sdk/anthropic, NO claude-client.ts`.

Grep de imports REALES (lo que el criterio realmente prohíbe):
```bash
grep -rn "from.*claude-client\|import.*claude-client'" <módulo + 4 call-sites>
# exit=1 (NO MATCH) → 0 imports reales
```

**Veredicto: CERO imports del wrapper legacy `claude-client.ts`. El fallback va por `@ai-sdk/anthropic` con literal `claude-haiku-4-5` (techo absoluto, NUNCA Sonnet). Las 5 ocurrencias son comentarios anti-regresión. OK (Pitfall #10 satisfecho). Misma observación que SUMMARYs 01/02/03.**

---

## Check 6 — Grep positivo `callWithGeminiFallback` en los 4 call-sites ✅ OK

```bash
grep -rl "callWithGeminiFallback" \
  src/lib/agents/somnio-v4/sub-loop/generation-call.ts \
  src/lib/agents/somnio-v4/sub-loop/compliance-check.ts \
  src/lib/agents/somnio-v4/comprehension.ts \
  src/lib/agents/media/image-classifier.ts | wc -l
# → 4
```

**Veredicto: los 4 call-sites Gemini (generation, compliance, comprehension, vision) wirean el orquestador del fallback. OK (D-01 — los 4 call-sites entran).**

---

## Resumen de veredictos

| Check | Descripción | Veredicto |
|-------|-------------|-----------|
| 1 | Suite canónica v4 + nuevas suites | ✅ OK (399 passed \| 7 skipped) |
| 2 | `tsc --noEmit` | ✅ OK (0 errores de fuente; 2 ruido generado pre-existente) |
| 3 | Diff acotado a paths permitidos | ✅ OK (17 archivos, todos permitidos) |
| 4 | Greps nominales no-regresión | ✅ OK (9 byte-idénticos) |
| 5 | Grep negativo claude-client | ✅ OK (0 imports reales) |
| 6 | Grep positivo callWithGeminiFallback | ✅ OK (4/4 call-sites) |

**GATE REGLA 6: ✅ PASS. Procede a Task 2 (docs + LEARNINGS).**

Amenazas del threat_model:
- **T-fb-09 (Tampering — regresión silenciosa en agente no-v4):** MITIGADO por Checks 3+4 (diff de cada agente no-v4 + core + tooling-call + claude-client + comprehension-schema VACÍO; suite 399 verde).
- **T-fb-10 (push con commits ajenos):** ACCEPT — diferido al checkpoint humano (Task 3). NO se pushea desde este executor.
