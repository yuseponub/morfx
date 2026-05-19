/**
 * Smoke B (regression — 10 casos D-12 paths NO migrados al RAG-generative).
 *
 * 10 casos lockeados (STATUS.md líneas 154-182):
 * - 3 razonamiento_libre: filosofía/anécdota cliente → handoff silente.
 * - 3 crm_mutation: createOrder, moveOrderToStage, addOrderNote (flujo viejo D-12).
 * - 3 state machine happy path: saludo, precio, confirmación (NO sub-loop).
 * - 1 cas_reject: stage_changed_concurrently mockeado (flujo viejo D-12).
 *
 * NO usa LLM-as-judge (regresiones estructurales — RESEARCH líneas 870-873).
 *
 * Estrategia de invocación (Task 6.1 notas + Regla 6 + Threat T-06-01):
 *   - razonamiento_libre (3 casos): invocación REAL contra runSubLoop con reason='razonamiento_libre'.
 *     Expected outcome: status='no_match' (handoff silente — KB no tiene material sobre filosofía).
 *   - crm_mutation (3 casos): SKIP — mutarían pedidos reales en producción Somnio.
 *     Verificación manual via sandbox aislado.
 *   - state machine happy path (3 casos): SKIP — NO entran al sub-loop (template matching
 *     upstream de comprehension → response-track). Verificación manual via sandbox.
 *   - cas_reject (1 caso): SKIP — requiere mockear race condition stage_changed_concurrently
 *     vía un createOrder real + concurrent stage move. Integration tests del crm-writer
 *     (standalone crm-stage-integrity shipped 2026-04-21) ya cubren este path.
 *
 * Gating:
 *   - Requiere OPENAI_API_KEY (o OPENAI_API_KEY_SALESV4) + GOOGLE_GENERATIVE_AI_API_KEY
 *     + SUPABASE_SERVICE_ROLE_KEY en `.env.local`.
 *   - El test carga `.env.local` explícitamente via dotenv (vitest no lo hace por default).
 *   - Si las keys faltan → describe.skipIf saltea todos los casos.
 *
 * Para correr:
 *   npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts
 *
 * Standalone: somnio-v4-rag-generative / Plan 06.
 * Refs D-12, D-25.
 */

// Carga .env.local ANTES de cualquier import que lea process.env (Supabase / sub-loop).
import dotenv from 'dotenv'
import path from 'node:path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Fallback OPENAI_API_KEY_SALESV4 → OPENAI_API_KEY (mismo patrón que smoke-rag-a + embed.ts:21).
if (!process.env.OPENAI_API_KEY_SALESV4 && process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY_SALESV4 = process.env.OPENAI_API_KEY
}

import { describe, it, expect } from 'vitest'
import { writeFileSync, appendFileSync } from 'node:fs'
import { runSubLoop } from '../sub-loop'
import type { LoopOutcome } from '../sub-loop/output-schema'

const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const RESULTS_PATH = path.resolve(
  process.cwd(),
  '.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md',
)

/**
 * THROTTLE_MS — pausa entre casos LLM-real para no reventar quota.
 * Solo afecta los 3 casos razonamiento_libre (resto son SKIP sin LLM calls).
 */
const THROTTLE_MS = 7000

type SmokeBCase = {
  idx: number
  group: 'razonamiento_libre' | 'crm_mutation' | 'state_machine' | 'cas_reject'
  userMessage: string
  reason: 'razonamiento_libre' | 'crm_mutation' | 'cas_reject' | null // null = state machine (NO sub-loop)
  expected: string
  expectedStatus: 'no_match' | 'template' | 'generated' | 'SKIP'
  skipReason?: string // por qué se marca SKIP
}

// 10 casos verbatim de STATUS.md líneas 154-182.
const CASES: SmokeBCase[] = [
  // === razonamiento_libre (3) — handoff silente (REAL invocation) ===
  {
    idx: 1,
    group: 'razonamiento_libre',
    userMessage: 'qué pensás del insomnio?',
    reason: 'razonamiento_libre',
    expected: 'handoff silente (divagación, sin KB)',
    expectedStatus: 'no_match',
  },
  {
    idx: 2,
    group: 'razonamiento_libre',
    userMessage: 'ayer fue un día raro, no pude dormir',
    reason: 'razonamiento_libre',
    expected: 'handoff o template empático',
    expectedStatus: 'no_match',
  },
  {
    idx: 3,
    group: 'razonamiento_libre',
    userMessage: 'el sueño es interesante, no?',
    reason: 'razonamiento_libre',
    expected: 'handoff silente',
    expectedStatus: 'no_match',
  },

  // === crm_mutation (3) — flujo viejo D-12 sin cambios — SKIP (Regla 6 + Threat T-06-01) ===
  {
    idx: 4,
    group: 'crm_mutation',
    userMessage: 'dale, quiero comprar. mi dirección es Calle 1 # 2-3',
    reason: 'crm_mutation',
    expected: 'createOrder + template post-orden',
    expectedStatus: 'SKIP',
    skipReason:
      'Mutaría pedido real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.',
  },
  {
    idx: 5,
    group: 'crm_mutation',
    userMessage: 'movéme el pedido a confirmado',
    reason: 'crm_mutation',
    expected: 'moveOrderToStage + template',
    expectedStatus: 'SKIP',
    skipReason:
      'Mutaría stage real en producción Somnio (Regla 6 + Threat T-06-01). Verificación manual via sandbox.',
  },
  {
    idx: 6,
    group: 'crm_mutation',
    userMessage: 'agregá una nota: cliente prefiere AM',
    reason: 'crm_mutation',
    expected: 'addOrderNote + confirmación',
    expectedStatus: 'SKIP',
    skipReason:
      'Agregaría nota real a pedido real (Regla 6 + Threat T-06-01). Verificación manual via sandbox.',
  },

  // === state machine happy path (3) — NO debe disparar sub-loop — SKIP estructural ===
  {
    idx: 7,
    group: 'state_machine',
    userMessage: 'hola',
    reason: null,
    expected: 'saludo template (sin sub-loop — comprehension clasifica → response-track template directo)',
    expectedStatus: 'SKIP',
    skipReason:
      'State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.',
  },
  {
    idx: 8,
    group: 'state_machine',
    userMessage: 'cuánto cuesta?',
    reason: null,
    expected: 'precio template (sin sub-loop)',
    expectedStatus: 'SKIP',
    skipReason:
      'State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.',
  },
  {
    idx: 9,
    group: 'state_machine',
    userMessage: 'ya recibí el pedido',
    reason: null,
    expected: 'confirmacion template (sin sub-loop)',
    expectedStatus: 'SKIP',
    skipReason:
      'State machine happy path NO invoca sub-loop. Template matching upstream. Verificación manual via sandbox.',
  },

  // === cas_reject (1) — mockeado (D-12 propaga verbatim) — SKIP ===
  {
    idx: 10,
    group: 'cas_reject',
    userMessage: '(simulado: race condition createOrder con stage_changed_concurrently)',
    reason: 'cas_reject',
    expected: 'propaga error verbatim, agent decide handoff',
    expectedStatus: 'SKIP',
    skipReason:
      'cas_reject requiere mockear race condition stage_changed_concurrently (createOrder real + concurrent stage move). Integration tests del crm-writer (standalone crm-stage-integrity shipped 2026-04-21) ya cubren este path.',
  },
]

function writeHeader() {
  const totalSkip = CASES.filter((c) => c.expectedStatus === 'SKIP').length
  const totalReal = CASES.length - totalSkip
  writeFileSync(
    RESULTS_PATH,
    `# SMOKE B — Regression Results (paths NO migrados D-12)

**Run date:** ${new Date().toISOString()}
**Standalone:** somnio-v4-rag-generative / Plan 06
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)

## Resumen ejecución

- **Casos total:** ${CASES.length}
- **Casos REAL (invocación contra runSubLoop):** ${totalReal} (razonamiento_libre)
- **Casos SKIP (verificación manual via sandbox):** ${totalSkip}
  - crm_mutation (3): mutarían producción — Regla 6 + Threat T-06-01
  - state_machine (3): NO entran al sub-loop — template matching upstream
  - cas_reject (1): integration tests crm-writer ya cubren — Threat T-06-04

**Sin LLM-as-judge** — son regresiones estructurales (RESEARCH líneas 870-873).

---

## Per-case results

`,
    'utf8',
  )
}

function appendCase(
  c: SmokeBCase,
  outcome: LoopOutcome | null,
  latencyMs: number,
  errorMsg?: string,
  skipped = false,
) {
  const autoCheckLine = skipped
    ? `**Auto-check:** N/A (SKIP — ${c.skipReason ?? 'sin razón documentada'})`
    : outcome
      ? outcome.status === c.expectedStatus
        ? `**Auto-check (status match):** ✅ PASS (status=\`${outcome.status}\` == expected=\`${c.expectedStatus}\`)`
        : `**Auto-check (status match):** ❌ FAIL (got status=\`${outcome.status}\`, expected=\`${c.expectedStatus}\`)`
      : `**Auto-check:** ⚠ NO_OUTCOME (runtime error — ver mensaje)`

  const subLoopBlock = skipped
    ? '_(no aplica — caso SKIP, sin invocación al sub-loop)_'
    : outcome
      ? `
- status: \`${outcome.status}\`
- responseText: ${outcome.responseText ? `"${String(outcome.responseText).slice(0, 200)}"` : '(null/handoff)'}
- responseTemplate: \`${outcome.responseTemplate ?? 'null'}\`
- sourceTopic: \`${outcome.sourceTopic ?? 'null'}\`
- responseConfidence: \`${outcome.responseConfidence ?? 'null'}\`
- reason: \`${outcome.reason ?? 'null'}\`
- requiresHuman: \`${outcome.requiresHuman}\`
`
      : '_(outcome null — runtime error)_'

  const block = `
### Case ${c.idx} — "${c.userMessage}"

**Group:** ${c.group}
**Expected:** ${c.expected}
**Expected status:** \`${c.expectedStatus}\`
**Latency:** ${latencyMs}ms
${skipped ? `**SKIPPED:** ${c.skipReason ?? 'sin razón'}` : ''}
${errorMsg ? `**RUNTIME ERROR:** \`\`\`${errorMsg.slice(0, 400)}\`\`\`` : ''}

**Sub-loop outcome:**
${subLoopBlock}

${autoCheckLine}
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---
`
  appendFileSync(RESULTS_PATH, block, 'utf8')
}

function appendAggregate() {
  const block = `

## Aggregate metrics

| Metric | Count | %  |
|--------|-------|----|
| Total cases | 10 | 100% |
| REAL invocation (razonamiento_libre) | 3 | 30% |
| SKIP (manual via sandbox) | 7 | 70% |
| Auto-check PASS (REAL only — status match) | __ | __% (de 3 REAL) |
| Jose PASS (después de revisión) | __ | __% (de 10) |
| Jose FAIL (bloqueante) | __ | __% |

## Decision Checklist

- [ ] **Runtime errors en REAL cases (razonamiento_libre 1-3):** debe ser 0.
- [ ] **Auto-check PASS en REAL cases:** ≥2/3 (idealmente 3/3 — handoff silente esperado).
- [ ] **Jose review manual SKIP cases (crm_mutation 4-6):** via sandbox aislado verificando que crm-writer adapter sigue funcionando post-Plan 03 refactor.
- [ ] **Jose review manual SKIP cases (state_machine 7-9):** via sandbox verificando que comprehension clasifica intents claros y NO dispara sub-loop.
- [ ] **Jose review SKIP cas_reject (10):** integration tests del crm-writer ya pasaron — confirmar que sub-loop sigue propagando \`stage_changed_concurrently\` verbatim.

## Criterio de éxito

**≥9/10 OK según Jose** (CONTEXT.md líneas 121-124).

- Si ≥9/10 OK + Smoke A 15/17 PASS → **green light Plan 08** (production flip con notas out-of-scope cases 16+17).
- Si <9/10 → abrir **Plan 07d** antes de Plan 08 para fix specifico de regresión observada.

## Per-case failure analysis

_(completar si hay FAILs en Auto-check de razonamiento_libre o Jose marca FAIL en SKIP cases)_

`
  appendFileSync(RESULTS_PATH, block, 'utf8')
}

const SHOULD_RUN =
  Boolean(process.env.OPENAI_API_KEY_SALESV4 || process.env.OPENAI_API_KEY) &&
  Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

describe.skipIf(!SHOULD_RUN)('Smoke B (regression — 10 casos D-12 paths)', () => {
  // Escribe header al iniciar el suite.
  writeHeader()

  // Track REAL case index to know when to throttle.
  let realCaseCount = 0

  for (const c of CASES) {
    // SKIP cases — no LLM call, solo registramos el resumen estructural.
    if (c.expectedStatus === 'SKIP') {
      it(`${c.idx}. ${c.group} — ${c.userMessage} (SKIP — manual verify)`, () => {
        appendCase(c, null, 0, undefined, true)
        // SKIP cases always pass — they're informational/manual-verify.
        expect(true).toBe(true)
      })
      continue
    }

    // REAL invocation — razonamiento_libre cases.
    it(`${c.idx}. ${c.group} — ${c.userMessage}`, async () => {
      // THROTTLE entre casos REAL (no antes del primero).
      realCaseCount += 1
      if (realCaseCount > 1) {
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS))
      }

      const t0 = Date.now()
      let outcome: LoopOutcome | null = null
      let errorMsg: string | undefined

      try {
        outcome = await runSubLoop({
          reason: c.reason as 'razonamiento_libre',
          ctx: {
            // SubLoopToolsContext: workspaceId/conversationId/sessionId.
            workspaceId: SOMNIO_WORKSPACE_ID,
            conversationId: `smoke-b-${c.idx}`,
            sessionId: `smoke-b-${c.idx}`,
            // SubLoopContext extension:
            userMessage: c.userMessage,
            recentMessages: [],
          },
        })
      } catch (err) {
        errorMsg = (err as Error).message ?? String(err)
      }

      const latencyMs = Date.now() - t0
      appendCase(c, outcome, latencyMs, errorMsg, false)

      // Bloquear el test SOLO por runtime error. Jose revisa estructura cualitativa.
      if (errorMsg) {
        throw new Error(`Case ${c.idx} runtime error: ${errorMsg}`)
      }
      // No-throw assertion: status debería coincidir con expectedStatus.
      expect(outcome?.status).toBe(c.expectedStatus)
    }, 120_000)
  }

  // Append aggregate después del último caso.
  it('zz_append_aggregate_section', () => {
    appendAggregate()
  })
})
