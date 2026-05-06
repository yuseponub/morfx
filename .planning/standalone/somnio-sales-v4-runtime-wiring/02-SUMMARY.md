---
phase: somnio-sales-v4-runtime-wiring
plan: 02
subsystem: somnio-v4 sub-loop
tags: [v4-runtime-wiring, schema-reshape, loop-outcome, openai-strict, gemini-compat, post-hoc-validation]
wave: 1
depends_on: [01]
status: complete
date_completed: 2026-05-06
duration_estimate: ~2h
addresses_decisions: [D-29, D-30, D-7, D-8, D-10]
addresses_research_pitfalls: [H-1, H-2, H-3]
requires:
  - Plan 01 shipped (deps @ai-sdk/openai + @ai-sdk/google instaladas, V4ProductionRunner clonado)
provides:
  - "LoopOutcomeSchema flat compatible con todos los providers (OpenAI strict + Gemini + Anthropic)"
  - "validateLoopOutcomeInvariants() helper para enforcement post-hoc de invariantes que el schema flat no captura"
  - "Sub-loop con escalación suave a no_match cuando invariante roto (NO throw — consistent con D-57)"
  - "Consumer somnio-v4-agent.ts adaptado a nullable fields con null guards defensivos"
  - "E2E test gated por OPENAI_API_KEY_SALESV4 (replaces mocks per H-1) — el primer test runtime real del sub-loop"
affects:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (RE-SHAPE completo)
  - src/lib/agents/somnio-v4/sub-loop/index.ts (validateLoopOutcomeInvariants wired)
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts (null guards en mapOutcomeToAgentOutput + 2 captureUnknownCase callsites)
  - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts (12 tests cubriendo nuevo shape + invariants)
  - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts (NEW — gated E2E)
  - src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts (Rule 3 fix — mock data + null guard)
tech-stack:
  added: []
  patterns:
    - "Schema flat-nullable por encima de discriminated union (D-29) — portable a OpenAI strict mode"
    - "Validación post-hoc con escalación suave (NO throw) — consistent con D-57 handoff humano"
    - "describe.skipIf para gate-by-env tests (CI-friendly secret-free + ejecutable local con env var)"
key-files:
  created:
    - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts (106 lines, 4 tests — 2 E2E + 2 syntactic)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/02-SUMMARY.md
  modified:
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (174 lines — RE-SHAPE completo + helper)
    - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts (273 lines — 12 tests nuevos shape)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (+54 líneas: import helper + post-hoc check + escalación suave)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (+46 líneas: null guards en 3 sitios)
    - src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts (+10 líneas: mock null fields + null guard test 4)
decisions:
  - D-29 honored: schema RE-SHAPE completo — eliminado discriminated union, boolean literals, dynamic-keyed records; reemplazado por z.object + z.enum + z.nullable
  - D-30 honored: schema target = OpenAI GPT-4o mini (Plan 05) + Gemini Flash-Lite (otros calls); OpenAI strict mode requiere .nullable() no .optional()
  - D-7 + D-8 honored: compatibility check empírico ya hecho en RESEARCH (research-scripts/test-loopoutcome-flat-norecord.ts) — Plan 02 ejecuta el outcome
  - D-10 modificado honored: re-shape obligatorio (no era parte del plan original "Opción A migración mínima") — H-1 lo descubrió
  - Regla 6 honored: cero edits a v3-production-runner.ts, godentist/, recompra/, pw-confirmation/ — verificado vía git diff origin/main vacío
metrics:
  commits: 4 (Task 1 = 94edd73, Task 2 = 62cab92, Task 3 = 0690322, SUMMARY = pending)
  unit_tests_added: 16 (12 output-schema + 4 sub-loop-e2e — 2 E2E + 2 syntactic)
  unit_tests_passing: 12/12 + 2/2 (syntactic) + 2/2 skipped (E2E gated, executor sin env var)
  integration_tests_passing: 6/6 (sub-loop-happy 2 + sub-loop-no-match 4)
  full_somnio_v4_suite: 64/64
  files_created: 2 (sub-loop-e2e.test.ts + SUMMARY.md)
  files_modified: 5 (output-schema.ts + output-schema.test.ts + index.ts + somnio-v4-agent.ts + sub-loop-no-match.test.ts)
  tsc_clean: true (0 errors en somnio-v4/sub-loop + somnio-v4-agent.ts)
---

# Phase somnio-sales-v4-runtime-wiring Plan 02: Schema RE-SHAPE + post-hoc validation + E2E gated — Summary

Wave 1 RE-SHAPE completo: `LoopOutcomeSchema` ahora es flat-nullable (compatible con OpenAI strict + Gemini + Anthropic), `validateLoopOutcomeInvariants` enforca invariantes post-hoc en `runSubLoop`, consumer `somnio-v4-agent.ts` adaptado con null guards defensivos, y E2E test contra GPT-4o mini real es la primera defensa runtime contra schema rejection (per H-1 — el sub-loop NUNCA había corrido contra API real previamente).

## extraContext audit decision

**Decisión: ELIMINADO por completo.**

Audit ejecutado:

```bash
grep -rn "outcome\.extraContext\|loopOutcome\.extraContext\|output\.extraContext" src/
# → 0 matches
```

El field `extraContext: z.record(z.string(), z.string()).optional()` previo NO se consume en NINGÚN lugar del codebase. El `extraContext` que aparece en `response-track.ts:57+` y `types.ts:82` pertenece al response-track v4 (otro shape distinto, no del LoopOutcome). Eliminarlo simplifica el schema sin pérdida funcional.

Si en el futuro se necesita propagar context extra del sub-loop al consumer (ej: telefono detectado, dirección extraída), se reintroducirá con campos pre-definidos nullable explícitos (no dynamic-keyed records — D-29 prohibition).

## LoopOutcomeSchema before / after diff

### BEFORE (commit `7d9bb2e` — discriminated union, NUNCA corrió E2E)

```typescript
export const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z.string(),
    extraContext: z.record(z.string(), z.string()).optional(),  // dynamic-keyed
    requiresHuman: z.literal(false),                             // boolean literal
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),
    canonicalText: z.string(),
    sourceTopic: z.string(),
    nuncaDecirRules: z.array(z.string()).optional(),             // .optional()
    requiresHuman: z.literal(false),                             // boolean literal
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),                              // boolean literal
    reason: z.string(),
    knowledgeQueried: z.array(z.string()),
  }),
])
```

**Empirically rejected by:**
- Anthropic Haiku via AI SDK → "Schema type 'oneOf' is not supported" + "For 'object' type, property 'propertyNames' is not supported"
- Gemini 2.5 Flash-Lite → "Invalid value at one_of[0].properties[3].value.enum[0] (TYPE_STRING), false"
- OpenAI GPT-4o mini strict mode → rechazo de oneOf + .optional()

### AFTER (Plan 02 — flat shape, accepted by all providers)

```typescript
export const LoopOutcomeSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match']),

  // canonical fields (nullable cuando status !== 'canonical')
  canonicalText: z.string().nullable(),
  sourceTopic: z.string().nullable(),
  nuncaDecirRules: z.array(z.string()).nullable(),

  // template fields (nullable cuando status !== 'template' && !== 'no_match')
  responseTemplate: z.string().nullable(),

  // no_match fields (nullable cuando status !== 'no_match')
  knowledgeQueried: z.array(z.string()).nullable(),

  // común a todos los status
  requiresHuman: z.boolean(),  // post-hoc invariant enforces correct value
  reason: z.string(),
})
```

## validateLoopOutcomeInvariants pseudocode + escalation flow

```typescript
function validateLoopOutcomeInvariants(output) {
  if (status === 'canonical') {
    if (canonicalText === null) → violation: 'canonical_missing_canonicalText'
    if (sourceTopic === null) → violation: 'canonical_missing_sourceTopic'
    if (requiresHuman !== false) → violation: 'canonical_requiresHuman_must_be_false'
  }
  if (status === 'template') {
    if (responseTemplate === null) → violation: 'template_missing_responseTemplate'
    if (requiresHuman !== false) → violation: 'template_requiresHuman_must_be_false'
  }
  if (status === 'no_match') {
    if (responseTemplate !== 'handoff_humano') → violation: 'no_match_responseTemplate_must_be_handoff_humano'
    if (requiresHuman !== true) → violation: 'no_match_requiresHuman_must_be_true'
    if (knowledgeQueried === null) → violation: 'no_match_missing_knowledgeQueried'
  }
  return { ok: true }
}
```

Escalation flow en `sub-loop/index.ts`:

```
runSubLoop:
  1. generateText({ output: Output.object({ schema: LoopOutcomeSchema }) })
  2. invariantCheck = validateLoopOutcomeInvariants(output)
  3. IF !invariantCheck.ok:
     a. emit pipeline_decision:subloop_invariant_violation event
        ({ violation, rawStatus, agent, reason })
     b. RETURN escalated LoopOutcome:
        { status: 'no_match',
          responseTemplate: 'handoff_humano',
          canonicalText: null, sourceTopic: null, nuncaDecirRules: null,
          knowledgeQueried: [],
          requiresHuman: true,
          reason: 'invariant_violation: <detail>' }
     c. Consumer (somnio-v4-agent.ts) handles handoff_humano vía mapOutcomeToAgentOutput
  4. ELSE proceed with NUNCA-decir check (D-51) + observability + return
```

**Key property:** NO throw — escalación suave consistente con D-57 (handoff humano siempre que algo no encaje). El turn productivo NO se rompe; el cliente recibe handoff humano correctamente.

## Test results

### Unit tests (Task 1 — output-schema.test.ts)

12 tests passing:

- Schema (Tests 1-6):
  1. parses valid 'canonical' shape ✓
  2. parses valid 'template' shape ✓
  3. parses valid 'no_match' shape ✓
  4. rejects status fuera del enum ✓
  5. rejects requiresHuman not boolean ✓
  6. accepts mixed nullable fields (esquema flat permite combinaciones inválidas que invariantCheck atrapa) ✓
- validateLoopOutcomeInvariants (Tests 7-10 + 2 bonus):
  7. valid 'canonical' returns { ok: true } ✓
  8. 'canonical' with canonicalText === null returns { ok: false, violation: 'canonical_missing_canonicalText' } ✓
  9. 'no_match' with requiresHuman === false returns violation ✓
  10. 'template' with responseTemplate === null returns violation ✓
  - bonus: canonical with sourceTopic === null ✓
  - bonus: no_match with responseTemplate !== 'handoff_humano' ✓

### E2E tests (Task 3 — sub-loop-e2e.test.ts)

Executor ejecutó **caso A (skipped path)**: 2 syntactic tests pasaron, 2 E2E tests skipped porque `OPENAI_API_KEY_SALESV4` no estaba seteado en el shell del executor (entorno local sin secret leak). Verificado adicionalmente con `OPENAI_API_KEY_SALESV4="" npx vitest run` — skip gracefully (sin failures).

Cuando se ejecute con env var presente (local con `.env.local` setteado, o CI con secret), correrá los 4 tests (2 syntactic + 2 E2E con generateText real contra GPT-4o mini).

### Integration suite (regresión Task 2)

Suite completa `somnio-v4` post-changes: **64/64 passing** (11 test files):

- `somnio-v4/__tests__/comprehension-schema.test.ts` 7/7
- `somnio-v4/__tests__/escalation.test.ts` (existing — n/a, no LoopOutcome consumer)
- `somnio-v4/__tests__/invocations.test.ts` 6/6
- `somnio-v4/__tests__/transitions.test.ts` 7/7
- `somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts` 5/5
- `somnio-v4/sub-loop/__tests__/output-schema.test.ts` 12/12 (NEW shape coverage)
- `somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` 3/3
- `somnio-v4/knowledge-base/__tests__/parser.test.ts` 8/8
- `somnio-v4/unknown-cases/__tests__/redact.test.ts` 4/4
- `__tests__/integration/somnio-v4/sub-loop-happy.test.ts` 2/2
- `__tests__/integration/somnio-v4/sub-loop-no-match.test.ts` 4/4 (mock + assertion adapted)

### TypeScript compilation

`npx tsc --noEmit` → 0 errors en `somnio-v4/sub-loop/` y `somnio-v4-agent.ts`. Sin regresiones globales (solo el baseline pre-existente en `domain/__tests__/conversations.test.ts` TS7022/TS7024 que ya estaba antes del Plan 01).

## D-29 / H-1 / H-2 / H-3 mapping

| Pitfall / Decision | Cómo se aborda en Plan 02 |
|---|---|
| **D-29** — re-shape obligatorio | Schema flat con z.enum + z.nullable + helper post-hoc. discriminated union eliminado. Boolean literals reemplazados por z.boolean() + invariant enforcement. Dynamic-keyed records (extraContext) eliminados completamente tras audit. |
| **H-1** — sub-loop nunca corrió E2E | E2E test gated `describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)` añadido — el primer test que llama GPT-4o mini real con el schema. Replaces mocks que fueron la fuente del blind-spot. |
| **H-2** — Anthropic AI SDK rechaza schemas complejos | Schema ahora portable a Gemini + GPT-4o mini (D-30). Plan 05 hará el model swap; Plan 02 deja el schema listo. |
| **H-3** — OpenAI strict mode requiere `.nullable()` no `.optional()` | Todos los campos opcionales son `z.string().nullable()` o `z.array(z.string()).nullable()`. Cero `.optional()` en el shape. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Update integration mock + assertion en sub-loop-no-match.test.ts**
- **Found during:** Task 2 — al añadir el null guard en consumer, `npx tsc --noEmit` reportó error TS18047 "outcome.knowledgeQueried is possibly null" en `src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts:140`.
- **Issue:** El test integration usa `mockResolvedValueOnce({ output: { ... } })` con shape OLD (faltan `canonicalText`, `sourceTopic`, `nuncaDecirRules` que el schema flat exige como nullable explícitos). Además, el assertion `expect(outcome.knowledgeQueried.length)` asume non-null pero post-flat el type es `string[] | null`.
- **Fix:**
  - Añadidos `canonicalText: null`, `sourceTopic: null`, `nuncaDecirRules: null` al mock `setupNoMatch()` (defensivo — invariantCheck no escala porque knowledgeQueried sigue non-null en el mock).
  - Cambiado assertion en Test 4 a `expect((outcome.knowledgeQueried ?? []).length).toBeGreaterThanOrEqual(1)` con `.not.toBeNull()` previo.
- **Files modified:** `src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts` (+10 líneas)
- **Commit:** `62cab92` (incluido en Task 2 commit)
- **Impact assessment:** Cero afectación al runtime productivo. Solo afecta integration test del padre Plan 12 que ya asumía el shape OLD. Sin esto, `npx tsc --noEmit` rompía CI y Plan 02 no podía declarar Task 2 done. Aplicar Rule 3 es correcto.
- **Rationale:** El plan listed `files_modified` solo con archivos de Task 1/2/3 sub-loop + agent + tests específicos del Plan 02. La actualización del mock integration es **bloqueante** (TS error) pero NO viola Regla 6 (test del propio agente somnio-v4, no de v3/godentist/recompra/pw-confirmation).

### Auth gates

Ninguno. Task 3 E2E gated por env var resuelve el "secret-free CI" sin necesidad de checkpoint humano. Cuando el usuario quiera correr el E2E localmente, exporta la env var del Vercel scope `OPENAI_API_KEY_SALESV4`.

## Threat Flags

Ninguno. El re-shape del schema NO introduce nueva surface de seguridad — el schema sigue siendo schema-driven structured output via AI SDK, y `validateLoopOutcomeInvariants` es un puro helper síncrono sin side effects.

## Known Stubs

Ninguno. Schema completo + helper completo + tests completos + consumer adaptado.

Plan 04 (webhook branch) y Plan 05 (model swap) podrán ahora deployar v4 con sub-loop sin temer al schema rejection que H-1 descubrió como deuda crítica.

## Próximo paso

**Plan 03 / Wave 2** (`03-PLAN.md` cuando exista): engine-v4.ts (sandbox wrapper) + branch sandbox + smoke A inicial. Ya con el schema flat compatible y validation post-hoc en su sitio, el sandbox podrá disparar `runSubLoop` con confidence baja y obtener un LoopOutcome válido.

## Self-Check

**Status: PASSED**

Verificaciones ejecutadas post-write:

| # | Check | Resultado |
|---|---|---|
| 1 | Files created — sub-loop-e2e.test.ts | FOUND |
| 2 | Files created — 02-SUMMARY.md | FOUND (este archivo) |
| 3 | Commits exist — 94edd73 (Task 1) | FOUND vía `git log --oneline -6` |
| 4 | Commits exist — 62cab92 (Task 2) | FOUND |
| 5 | Commits exist — 0690322 (Task 3) | FOUND |
| 6 | Gate 1: NO discriminatedUnion en output-schema.ts | PASS (grep empty) |
| 7 | Gate 2: NO z.literal(false/true) en output-schema.ts | PASS (grep empty) |
| 8 | Gate 3: NO z.record en output-schema.ts | PASS (grep empty) |
| 9 | Gate 4: HAS .nullable en output-schema.ts | PASS (5 ocurrencias) |
| 10 | Gate 5: HAS validateLoopOutcomeInvariants en sub-loop/index.ts | PASS (3 ocurrencias) |
| 11 | Gate 6: HAS `outcome.status === 'canonical'` en somnio-v4-agent.ts | PASS (2 ocurrencias) |
| 12 | Gate 7: HAS describe.skipIf en sub-loop-e2e.test.ts | PASS |
| 13 | Gate 8: NO forbidden imports (Regla 6) | PASS (grep empty en sub-loop/ + somnio-v4-agent.ts) |
| 14 | Gate 9: tsc clean en somnio-v4/sub-loop + agent | PASS (0 errors) |
| 15 | Gate 10: unit tests output-schema 12/12 | PASS |
| 16 | Gate 11: E2E test honors skipIf con env empty | PASS (2 passed + 2 skipped) |
| 17 | Regla 6: git diff origin/main en agentes protegidos | PASS (empty) |
| 18 | Suite completa somnio-v4 64/64 | PASS |
| 19 | No deletions inadvertidos en commits Plan 02 | PASS (3 commits, 0 deletions) |
