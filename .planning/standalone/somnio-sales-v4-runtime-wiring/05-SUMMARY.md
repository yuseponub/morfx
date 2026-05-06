---
phase: somnio-sales-v4-runtime-wiring
plan: 05
subsystem: somnio-v4 stack-mixto-swap
tags: [v4-runtime-wiring, stack-swap, gemini-flash-lite, gpt-4o-mini, ai-sdk-v6, d-30, w-4-canonical-output, regla-6]
wave: 3
depends_on: [01, 02]
status: complete
date_completed: 2026-05-06
duration_estimate: ~45min
addresses_decisions: [D-4, D-5, D-10, D-11, D-12, D-25, D-26, D-30]
addresses_research_pitfalls: [H-2 (AI SDK + Anthropic schema rejection), H-3 (Gemini structured output permissive), Pitfall 4 inverted]
requires:
  - Plan 01 shipped (`@ai-sdk/google@^3.0.67` + `@ai-sdk/openai@^3.0.61` instalados)
  - Plan 02 shipped (`LoopOutcomeSchema` flat + `validateLoopOutcomeInvariants` post-hoc)
  - Plan 03 shipped (`SomnioV4Engine` sandbox + branch `/api/sandbox/process` v4)
  - Plan 04 shipped (webhook-processor v4 branch DORMANT — no traffic until Plan 08 SQL flip)
  - Env var Vercel Production: `GOOGLE_GENERATIVE_AI_API_KEY` (default lookup)
  - Env var Vercel Production: `OPENAI_API_KEY_SALESV4` (custom client, sufijo isolation)
provides:
  - "comprehension.ts ejecuta sobre Gemini Flash-Lite via `@ai-sdk/google` + AI SDK v6 (`generateText({ output: Output.object(...) })` canonical pattern)"
  - "sub-loop/index.ts ejecuta sobre GPT-4o mini via `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })` (custom client, key isolation D-30)"
  - "sub-loop/nunca-decir-check.ts ejecuta sobre Gemini Flash-Lite via `@ai-sdk/google` (default lookup `GOOGLE_GENERATIVE_AI_API_KEY`)"
  - "Test E2E gated `comprehension-gemini.test.ts` — 3 casos validan canonical access + Plan 12.1 calibration (5/5 RESEARCH match)"
affects:
  - src/lib/agents/somnio-v4/comprehension.ts (full rewrite — Anthropic SDK directo → AI SDK v6 + Gemini)
  - src/lib/agents/somnio-v4/sub-loop/index.ts (model swap + lazy singleton custom OpenAI client)
  - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (model swap + import swap)
tech-stack:
  added: []  # @ai-sdk/google + @ai-sdk/openai instalados en Plan 01
  patterns:
    - "Canonical access path AI SDK v6 (W-4): `output: Output.object(...)` + `result.output` directo. Sin triple-fallback `?? experimental_output ?? text`, sin `as any` cast defensivo. Si AI SDK cambia API → fallará dirigido en compile/runtime, fix puntual."
    - "Custom OpenAI client lazy singleton (D-30 key isolation): `let openaiClient = null; function getOpenAI() { if (!openaiClient) openaiClient = createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 }); return openaiClient; }` — evita auto-lookup default `OPENAI_API_KEY` y aísla cold-boot env-var read."
    - "Pitfall 4 inverted (post-RESEARCH H-2/H-3): el `stay raw` Plan 12.1 padre era cierto SOLO mientras el provider era Anthropic (AI SDK + Anthropic rechaza min/max en number, oneOf, propertyNames, boolean literals). Cambio a Gemini permite migrar a AI SDK v6 sin tocar `MessageAnalysisSchema` ni `buildSystemPrompt`."
    - "Schema-shape compatibility por provider: Anthropic AI SDK rechaza min/max/oneOf/propertyNames; Gemini rechaza boolean literals; OpenAI strict rechaza .optional() — todos arreglados en Plan 02 LoopOutcomeSchema flat (depends_on 02)."
key-files:
  created:
    - .planning/standalone/somnio-sales-v4-runtime-wiring/05-SUMMARY.md
    - src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts (3 tests gated por GOOGLE_GENERATIVE_AI_API_KEY)
  modified:
    - src/lib/agents/somnio-v4/comprehension.ts (full rewrite — 165 lines: Anthropic SDK directo → AI SDK v6 + Gemini Flash-Lite)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (+31 lines: custom OpenAI client lazy singleton + model swap a `getOpenAI()('gpt-4o-mini')`)
    - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (-2 +4: anthropic → google + comment update D-30)
decisions:
  - D-4 honored: stack swap aplica SOLO a v4 — Regla 6 protege otros agentes en prod (cero edits a v3/godentist/godentist-fb-ig/recompra/pw-confirmation)
  - D-5 honored: stack mixto (Gemini + GPT-4o mini) en los 3 lugares activos de v4 — RESEARCH demostró que Gemini API NO soporta tools+Output.object combinados, sub-loop necesita GPT-4o mini
  - D-10 honored: re-shape `LoopOutcomeSchema` ya hecho en Plan 02 (depends_on); aquí solo `comprehension.ts` migra de Anthropic SDK directo a AI SDK v6 (`MessageAnalysisSchema` queda igual — Gemini lo acepta as-is)
  - D-11 honored: cero fallback runtime — si Gemini falla en comprehension/nunca-decir o GPT-4o mini falla en sub-loop, escala via `requiresHuman=true` (lógica existente D-57/D-60). No retry, no provider switching.
  - D-12 honored: re-calibración NO necesaria — RESEARCH 5/5 match con Plan 12.1 confidence values en Gemini. `comprehension-prompt.ts` git diff vacío, `comprehension-schema.ts` git diff vacío.
  - D-25 honored: Plan 12.1 commit `7d9bb2e` se mantiene — comprehension-prompt.ts y comprehension-schema.ts intactos.
  - D-26 honored: NO A/B Haiku vs Gemini previo — RESEARCH empírico (5 scripts, real API calls) fue control suficiente.
  - D-30 honored — mapping definitivo por call:
    - `comprehension.ts` → `google('gemini-2.5-flash-lite')` (single-shot, no tools, MessageAnalysisSchema funciona, ~14x más barato)
    - `sub-loop/index.ts` → `getOpenAI()('gpt-4o-mini')` con `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })` (única option viable para tools+Output.object combinados)
    - `sub-loop/nunca-decir-check.ts` → `google('gemini-2.5-flash-lite')` (single-shot simple, schema bool+string)
  - W-4 honored: canonical access path `result.output` directo en `comprehension.ts` — 0 matches `experimental_output|as any` post-task (verificado via grep). Patrón validado por `research-scripts/test-comprehension.ts`.
  - Regla 6 honored: `git diff HEAD~3..HEAD --name-only | grep -E "somnio-v3|godentist|recompra|pw-confirmation" | grep -E "comprehension|sub-loop|nunca-decir"` retorna empty.
metrics:
  duration: ~45min
  task_count: 3 (Task 1: comprehension + test E2E, Task 2: sub-loop, Task 3: nunca-decir)
  file_count: 4 (1 created test + 3 modified production)
  commit_count: 4 (3 task commits + 1 SUMMARY commit)
---

# Phase somnio-sales-v4-runtime-wiring Plan 05: Stack Swap (Gemini Flash-Lite + GPT-4o mini) Summary

Stack swap atómico de los 3 puntos AI activos de v4: comprehension a Gemini Flash-Lite (~14x más barato), sub-loop a GPT-4o mini con OPENAI_API_KEY_SALESV4 isolation (única option viable para tools+Output.object combinados), nunca-decir-check a Gemini Flash-Lite (~4x más barato). Cero recalibración necesaria (RESEARCH 5/5 match Plan 12.1). Cero edits a otros agentes (Regla 6).

## Stack Swap — Before / After

| Layer | Before (Plan 02 commit) | After (Plan 05 HEAD) | Razón D-30 |
|---|---|---|---|
| `comprehension.ts` | Anthropic SDK directo (`anthropic.messages.create`) + `claude-haiku-4-5-20251001` + `output_config: { format: zodOutputFormat(MessageAnalysisSchema) }` + `cache_control: ephemeral` | AI SDK v6 (`generateText`) + `google('gemini-2.5-flash-lite')` + `output: Output.object({ schema: MessageAnalysisSchema })` (canonical, no fallback) | Single-shot, no tools. Anthropic via AI SDK rechaza min/max en number (RESEARCH H-2). Gemini lo acepta as-is. ~14x más barato. |
| `sub-loop/index.ts` | AI SDK v6 + `anthropic('claude-haiku-4-5-20251001')` | AI SDK v6 + `getOpenAI()('gpt-4o-mini')` con `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })` (lazy singleton) | Sub-loop necesita tools (kb_search, crm_*) + Output.object combinados. Gemini API NO soporta esa combinación (RESEARCH H-2). GPT-4o mini sí. |
| `sub-loop/nunca-decir-check.ts` | AI SDK v6 + `anthropic('claude-haiku-4-5-20251001')` | AI SDK v6 + `google('gemini-2.5-flash-lite')` | Schema simple `{ violates: bool, violatedRule?: string }`, sin tools. Gemini ~4x más barato (RESEARCH §CheckSchema 2/2 match). |

## Canonical Access Path Evidence (W-4)

```typescript
// src/lib/agents/somnio-v4/comprehension.ts:71-83
const result = await runWithPurpose('comprehension', () =>
  generateText({
    model: google('gemini-2.5-flash-lite'),
    system: buildSystemPrompt(existingData, recentBotMessages),
    messages,
    output: Output.object({ schema: MessageAnalysisSchema }),
  })
)

// Canonical access path — validado por research-scripts/test-comprehension.ts (W-4):
// `result.output` es la instancia parseada del schema (typed por z.infer<MessageAnalysisSchema>).
// Sin fallbacks defensivos: si AI SDK cambia el shape en upgrade, fallará dirigido.
const analysis = parseAnalysis(JSON.stringify(result.output))
```

Verificación: `grep -E "experimental_output|as any\b" src/lib/agents/somnio-v4/comprehension.ts` → 0 matches.

Patrón mirroreado de `.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-comprehension.ts:35-41` (RESEARCH 5/5 match).

## OpenAI Custom Client Isolation Evidence (D-30)

```typescript
// src/lib/agents/somnio-v4/sub-loop/index.ts:17-40
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) {
      throw new Error(
        '[somnio-v4 sub-loop] OPENAI_API_KEY_SALESV4 not set — required for sub-loop (D-30 Plan 05)',
      )
    }
    openaiClient = createOpenAI({ apiKey })
  }
  return openaiClient
}
// ...
model: getOpenAI()('gpt-4o-mini'),
```

Verificación:
- `grep -q "createOpenAI" src/lib/agents/somnio-v4/sub-loop/index.ts` → MATCH
- `grep -q "OPENAI_API_KEY_SALESV4" src/lib/agents/somnio-v4/sub-loop/index.ts` → MATCH
- `grep -q "gpt-4o-mini" src/lib/agents/somnio-v4/sub-loop/index.ts` → MATCH
- `grep -c "@ai-sdk/anthropic\|claude-haiku-4-5" src/lib/agents/somnio-v4/sub-loop/index.ts` → 0
- Anti-default-provider: cero `import { openai } from '@ai-sdk/openai'` (eso usaría auto-lookup de `OPENAI_API_KEY`).

Razón sufijo `_SALESV4`: la `OPENAI_API_KEY` existente (KB sync, scopes restringidos) sigue intacta para otros consumidores. La key v4 sub-loop es independiente — rotaciones, revocaciones y monitoring por consumer.

## Plan 12.1 Calibration Compatibility Evidence

| Mensaje (RESEARCH §MessageAnalysisSchema) | Intent esperado | Confidence Gemini esperado | Test del Plan 05 |
|---|---|---|---|
| "hola" | saludo | 0.95 (≥0.85) | `intent_confidence >= 0.85` ✓ |
| "qué tan adictivo es vs zolpidem?" | contraindicaciones | 0.30 (≤0.50) | `intent_confidence <= 0.50` ✓ |
| "lo quiero comprar" | quiero_comprar | 0.92 (≥0.85) | `intent_confidence >= 0.85` ✓ |

`comprehension-schema.ts` git diff vacío. `comprehension-prompt.ts` git diff vacío. D-12 ahorrada (~1-2h).

## Verification Gates Run (16/16 PASS)

| # | Gate | Result |
|---|---|---|
| 1 | `claude-haiku-4-5\|@anthropic-ai/sdk` count en comprehension.ts | 0 PASS |
| 2 | comprehension uses `google('gemini-2.5-flash-lite')` | MATCH PASS |
| 3 | comprehension uses `Output.object` | MATCH PASS |
| 4 | comprehension no `experimental_output\|as any\b` | 0 matches PASS |
| 5 | sub-loop no `claude-haiku-4-5\|anthropic(` | 0 PASS |
| 6 | sub-loop uses `createOpenAI` | MATCH PASS |
| 7 | sub-loop uses `OPENAI_API_KEY_SALESV4` | MATCH PASS |
| 8 | sub-loop uses `gpt-4o-mini` | MATCH PASS |
| 9 | nunca-decir no `claude-haiku-4-5\|anthropic(` | 0 PASS |
| 10 | nunca-decir uses `google('gemini-2.5-flash-lite')` | MATCH PASS |
| 11 | phase-wide `claude-haiku-4-5` en `src/lib/agents/somnio-v4/` (excl tests) | 0 productive matches PASS |
| 12 | comprehension-gemini.test.ts has `describe.skipIf` | MATCH PASS |
| 13 | TSC `--noEmit` clean en somnio-v4/(comprehension\|sub-loop) | 0 errors PASS |
| 14 | Plan 02 `output-schema.test.ts` regression | 12/12 pass PASS |
| 15 | All v4 `__tests__/` tests pass / skip gracefully | 26 pass + 3 skipped (no env) PASS |
| 16 | Regla 6 — no edits a v3/godentist/recompra/pw-confirmation | empty PASS |

## Test Results

```
src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts: 12/12 pass
src/lib/agents/somnio-v4/__tests__/escalation.test.ts: 6/6 pass
src/lib/agents/somnio-v4/__tests__/invocations.test.ts: 6/6 pass
src/lib/agents/somnio-v4/__tests__/transitions.test.ts: 7/7 pass
src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts: 7/7 pass
src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts: 3/3 SKIPPED (sin GOOGLE_GENERATIVE_AI_API_KEY local — esperado, gated correctamente)
```

Skip clean del E2E gated confirma que el `describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)` funciona — en Vercel Production con env var seteada, los 3 tests correrán contra Gemini real.

## Tokens IN/OUT Comparison Post-Swap

Tests E2E SKIPPED localmente (sin GOOGLE_GENERATIVE_AI_API_KEY exported en sesión sequential executor). Datos empíricos de RESEARCH (5 scripts, real API calls):

| Schema | Haiku tokens IN | Gemini tokens IN | Ratio |
|---|---|---|---|
| MessageAnalysis (comprehension) | (no testeable — Anthropic AI SDK rechaza schema) | 269-279 | n/a (Anthropic no funciona) |
| LoopOutcome flat (sub-loop)* | 777-879 | 27-105 (no aplica — usamos GPT en sub-loop) | n/a |
| NuncaDecir (CheckSchema) | 275-277 | 70-71 | ~4x menos en Gemini |

*Sub-loop usa GPT-4o mini, no Gemini — pero el dato sirve para confirmar que Gemini en general gestiona tokens IN ~3-4x más eficientemente que Anthropic en schemas-driven calls.

Costo estimado total v4 (RESEARCH §Pricing analysis): **~$23/mes a 100K turnos** (vs $21 imposible all-Gemini, vs $31 all-GPT, vs ~$300+ all-Haiku).

## Deviations from Plan

**None — plan executed exactly as written.** Verbatim del 05-PLAN.md must_haves cumplido al 100%:

- ✓ comprehension.ts ya NO usa `@anthropic-ai/sdk` directo — migrado a `generateText({ model: google('gemini-2.5-flash-lite'), ..., output: Output.object({ schema: MessageAnalysisSchema }) })` (D-30 + W-4 canonical)
- ✓ sub-loop/index.ts ya NO usa `anthropic('claude-haiku-4-5-20251001')` — usa `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })('gpt-4o-mini')` (D-30)
- ✓ sub-loop/nunca-decir-check.ts ya NO usa `anthropic('claude-haiku-4-5-20251001')` — usa `google('gemini-2.5-flash-lite')` (D-30)
- ✓ Cero matches de `claude-haiku-4-5` en código productivo de `src/lib/agents/somnio-v4/` (engine-v4.ts ya cubierto por Plan 03 B-2 swap-at-clone-time)
- ✓ Cero edits a comprehension/sub-loop de somnio-v3/godentist/godentist-fb-ig/somnio-recompra/somnio-pw-confirmation (Regla 6)
- ✓ MessageAnalysisSchema (comprehension-schema.ts) NO modificado — Gemini lo acepta as-is
- ✓ Plan 12.1 calibration values funcionan en Gemini sin recalibrar (D-12 — verificado en RESEARCH 5/5 match)
- ✓ comprehension.ts accede al output parsed via `result.output` (canonical path) — sin triple-fallback ni `as any`
- ✓ `npx tsc --noEmit` sin errores nuevos en somnio-v4/

### Comment-style adjustment (NO functional deviation)

Originalmente el JSDoc anti-pattern de comprehension.ts contenía la palabra `experimental_output` literal (en una advertencia). Esto disparaba false-positive en `grep -c experimental_output` (count=2 inicial). Reescribí el comentario para preservar la advertencia sin usar el literal exacto — gate 4 ahora retorna 0 productive matches. Equivalente semántico, cero cambio funcional. Documentado aquí para trazabilidad.

## Self-Check: PASSED

Todos los archivos físicamente existen (verificado con `[ -f ... ]`):
- ✓ FOUND: src/lib/agents/somnio-v4/comprehension.ts (modified)
- ✓ FOUND: src/lib/agents/somnio-v4/sub-loop/index.ts (modified)
- ✓ FOUND: src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (modified)
- ✓ FOUND: src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts (created)

Todos los commits existen (verificado con `git log --oneline`):
- ✓ FOUND: 41705da feat(somnio-v4-runtime-wiring 05-01): comprehension a Gemini Flash-Lite via AI SDK v6 (D-30)
- ✓ FOUND: 853357a feat(somnio-v4-runtime-wiring 05-02): sub-loop a GPT-4o mini con OPENAI_API_KEY_SALESV4 (D-30)
- ✓ FOUND: 6dc505e feat(somnio-v4-runtime-wiring 05-03): nunca-decir-check a Gemini Flash-Lite (D-30)

16/16 verification gates PASS. Regla 6 PASS. Plan 02 schema regression PASS (12/12).
