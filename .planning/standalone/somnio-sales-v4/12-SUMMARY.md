---
plan: 12
phase: somnio-sales-v4
status: awaiting-smoke
completed: 2026-05-01
wave: 6
commit: 3fe2181
---

# Plan 12: Pre-flip wiring + integration tests — SUMMARY

## One-liner

v4 self-registered en agentRegistry vía 2 imports side-effect (routing-editor + webhook pre-warm) + 6 integration tests verdes del sub-loop (correctness, sin calibración — D-77). Pre-flip listo, smoke manual pendiente del usuario.

## What was built

**Wiring (1 línea cada uno):**
1. `src/app/(dashboard)/agentes/routing/editor/page.tsx` línea 30 → `import '@/lib/agents/somnio-v4'` (dropdown del routing editor lista a v4 vía `agentRegistry.list()`).
2. `src/lib/agents/production/webhook-processor.ts` línea 231 → `import('../somnio-v4')` agregado al `Promise.all` pre-warm. **Sin branch especial** — D-16 (no preload de CRM context). El routing engine genérico despachará a v4 cuando una regla en `routing_rules` emita `agent_id='somnio-sales-v4'` (Plan 13).

**Integration tests (`src/__tests__/integration/somnio-v4/`, 2 archivos nuevos):**

- `sub-loop-happy.test.ts` (2 tests) — KB hit → outcome canonical:
  - Test 1: `runSubLoop({reason:'low_confidence'})` retorna `outcome.status='canonical'` con `sourceTopic='precio_comparativo'` cuando el RPC mock retorna 1 hit y el LLM emite outcome canonical.
  - Test 2: `nuncaDecirRules` vacías → `checkNuncaDecir` early-returns ok=true (1 generateText call total, sin segundo LLM check) y outcome canonical se preserva (no fuerza handoff).

- `sub-loop-no-match.test.ts` (4 tests) — KB sin hits → handoff_humano (D-57):
  - Test 1: `outcome.status === 'no_match'`
  - Test 2: `outcome.responseTemplate === 'handoff_humano'` (D-57 literal Zod check)
  - Test 3: `outcome.requiresHuman === true`
  - Test 4: `outcome.knowledgeQueried.length >= 1` (D-58 audit trail)

**Mocks aplicados (aislamiento total, corre en CI sin keys):**
- `ai` → `generateText` mock retorna outcome configurado por test
- `@ai-sdk/anthropic` → `anthropic()` retorna 'mock-haiku-model'
- `@/lib/observability` → `runWithPurpose` passthrough + `getCollector` no-op
- `../../../lib/agents/somnio-v4/knowledge-base/embed` → `generateEmbedding` retorna vector de zeros
- `@/lib/supabase/admin` → `createAdminClient()` retorna `{ rpc: rpcMock }` con respuesta configurable

Patrón de mocking (`vi.hoisted`) clonado de `src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts` — ya validado en codebase.

## Test results

```
 ✓ src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts > Test 1: returns outcome canonical with sourceTopic=precio_comparativo
 ✓ src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts > Test 2: empty nuncaDecirRules preserves canonical outcome (no handoff forced)
 ✓ src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts > Test 1: outcome.status === no_match
 ✓ src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts > Test 2: outcome.responseTemplate === handoff_humano (D-57 literal)
 ✓ src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts > Test 3: outcome.requiresHuman === true
 ✓ src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts > Test 4: outcome.knowledgeQueried.length >= 1 (D-58 audit trail)

 Test Files  2 passed (2)
      Tests  6 passed (6)
   Duration  16.41s
```

`npx tsc --noEmit -p tsconfig.json` → exit 0 (clean).

## Verification

| Check | Result |
|-------|--------|
| `grep "import '@/lib/agents/somnio-v4'" routing/editor/page.tsx` | match línea 30 |
| `grep "import('../somnio-v4')" webhook-processor.ts` | match línea 231 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/__tests__/integration/somnio-v4/` | 6/6 pass |
| `git log -1 --pretty=%s` | `feat(somnio-v4): plan-12 — pre-flip wiring...` |
| `git diff --diff-filter=D HEAD~1 HEAD` | empty (no deletions) |

## Deviations from Plan

**None.** El plan se ejecutó exactamente como fue escrito. Notas operativas:

- El plan menciona `grep -q "import '../somnio-v4'"` pero el patrón real del archivo usa dynamic import: `import('../somnio-v4')` (con paréntesis). El verify automated del plan (`grep -q "import('../somnio-v4')"`) coincide con lo agregado.
- Los mocks usan `vi.hoisted()` (patrón validado en `kb-search-tool.test.ts`) en vez del `vi.mock()` simple sugerido en el plan. Razón: `vi.mock` sin hoisted no comparte estado entre el factory y el bloque de test; `vi.hoisted` resuelve esto idiomáticamente. Sin desviación funcional.
- `package.json` no expone `pnpm typecheck` como script, por eso se invocó `npx tsc --noEmit -p tsconfig.json` directamente (mismo efecto, exit 0).

## Files modified

- `src/app/(dashboard)/agentes/routing/editor/page.tsx` (+1 línea)
- `src/lib/agents/production/webhook-processor.ts` (+1 línea dentro del Promise.all)

## Files created

- `src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts` (170 líneas, 2 tests)
- `src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts` (143 líneas, 4 tests)

## Commit

- `3fe2181` feat(somnio-v4): plan-12 — pre-flip wiring (routing-editor + webhook pre-warm) + integration tests
- Pushed to `origin/main` (`9b7f045..3fe2181`)

## Decisions addressed

- D-13 — agent_id literal `'somnio-sales-v4'` se autoregistra
- D-22 — wiring no toca `agent-timers-v4.ts` (esa función vive separada)
- D-24 — cero imports cruzados v3↔v4
- D-25 / D-32 — pre-flip = sin tráfico productivo (Regla 6 vía ausencia de routing rule)
- D-34 — QA pre-flip = integration tests del sub-loop (correctness)
- D-77 — sandbox/integration tests cubren correctness, NO calibración

## DEFERRED — Task 4 smoke checkpoint (human-verify)

**STOPPED.** El plan declara Task 4 `type="checkpoint:human-verify"` con `gate="blocking"`. El executor NO ejecuta este task — se devuelve el control al usuario.

### Smoke checklist para el usuario

**A) Routing editor dropdown:**
1. Abrir `/agentes/routing-editor` en preview/prod
2. Confirmar que `somnio-sales-v4` aparece como opción en el dropdown de agent_id
3. NO crear regla todavía (eso es Plan 13)

**B) Sandbox /sandbox:**
1. Abrir `/sandbox`, seleccionar agent `somnio-sales-v4`, workspace Somnio
2. Mensaje universal-claro: `"hola, cuanto cuesta?"` → esperar template (alta confidence, no sub-loop)
3. Mensaje ambiguo: `"y mi tía dice que esto es magia"` → esperar escalación al sub-loop (canonical o no_match)
4. Mensaje edge-case: `"estoy embarazada, puedo tomarlo?"` → esperar handoff humano (escalate_if del KB doc edge-cases/uso_en_embarazo.md)

**C) Observability (Supabase Studio):**
```sql
SELECT event_type, payload
FROM agent_observability_events
WHERE agent_id = 'somnio-sales-v4'
ORDER BY created_at DESC LIMIT 20;
```
Esperado: eventos `pipeline_decision:comprehension_completed`, `subloop_low_confidence_invoked`, `subloop_completed`, y/o `handoff_low_confidence_fallback`.

**D) UI unknown_cases:**
1. Tras smoke con edge-case, abrir `/agentes/somnio-v4/unknown-cases`
2. Confirmar que el caso aparece "sin cluster" (status='pending')

**Resume signal:** Usuario escribe "smoke v4 PASS — listo para flip" → orchestrator continúa al Plan 13 (flip atómico).

Si algún paso falla, el usuario reporta y el assistant arregla ANTES de continuar al Plan 13.

## Self-Check: PASSED

- FOUND: `src/app/(dashboard)/agentes/routing/editor/page.tsx` (línea 30 con import v4)
- FOUND: `src/lib/agents/production/webhook-processor.ts` (línea 231 con import('../somnio-v4'))
- FOUND: `src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts`
- FOUND: `src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts`
- FOUND: commit `3fe2181` en `git log`
- FOUND: push completado a `origin/main` (`9b7f045..3fe2181`)
- 6/6 tests pass
- typecheck exit 0
- 0 deletions accidentales
