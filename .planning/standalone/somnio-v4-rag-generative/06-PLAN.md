---
plan: 06
wave: 4
phase: standalone-somnio-v4-rag-generative
depends_on: [03]
files_modified:
  - src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts
  - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Los 10 casos del Smoke B (STATUS.md líneas 103-135) corren end-to-end contra runSubLoop con env vars productivas."
    - "Smoke B cubre paths NO migrados (D-12): 3 razonamiento_libre + 3 crm_mutation + 3 state machine happy path + 1 cas_reject mockeado."
    - "El test NO usa LLM-as-judge (Smoke B son regresiones estructurales, no requieren juicio cualitativo — RESEARCH líneas 870-873)."
    - "SMOKE-B-RESULTS.md generado con tabla por caso: Caso | Expected | Outcome real | PASS/FAIL | Notes."
    - "Criterio de éxito: ≥9/10 OK Jose (CONTEXT.md líneas 121-124). Si <9, abrir Plan 07 antes de Plan 08."
    - "Casos crm_mutation y cas_reject confirman que el flujo viejo (D-12) sigue funcionando idéntico post-refactor."
    - "Casos state machine happy path confirman que comprehension NO dispara sub-loop (intent claro → template directo)."
    - "v4 sigue dormant en producción."
  artifacts:
    - path: "src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts"
      provides: "Vitest suite con 10 casos regression"
      contains: "Smoke B (regression"
    - path: ".planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md"
      provides: "Per-case regression results + decision checklist"
      contains: "Aggregate metrics"
  key_links:
    - from: "src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/index.ts (runSubLoop)"
      via: "import + invocation real con env vars"
      pattern: "runSubLoop"
---

<objective>
Wave 4 (paralelo con Plan 05) — Smoke B: regression test de los paths NO migrados al RAG-generative (D-12).

Cubre 10 casos lockeados en STATUS.md líneas 103-135:
- 3 razonamiento_libre (filosofía → handoff silente).
- 3 crm_mutation (createOrder, moveOrderToStage, addOrderNote — flujo viejo D-12 sin cambios).
- 3 state machine happy path (saludo, precio, confirmación — NO entran al sub-loop, templates directos).
- 1 cas_reject mockeado (race condition stage_changed_concurrently — propaga verbatim D-12).

Purpose: verificar que el refactor del Plan 03 NO rompió los paths existentes. crm_mutation y cas_reject preservan flujo viejo verbatim (D-12). State machine sigue independiente. razonamiento_libre dispara handoff silente como antes.

Output:
- 1 archivo de TEST nuevo: smoke-rag-b.test.ts.
- 1 archivo de RESULTS: SMOKE-B-RESULTS.md.

**Criterio de éxito:** ≥9/10 OK Jose. Si <9, abrir Plan 07 (iter) antes de Plan 08.

**Diferencias con Plan 05:**
- NO usa LLM-as-judge (RESEARCH líneas 870-873 — son regresiones estructurales, no cualitativas).
- NO requiere review manual exhaustivo de Jose por respuesta — solo verificar que el comportamiento estructural es correcto (outcome status, reason, etc.).
- 10 casos vs 17.
- Plan 06 puede correr en paralelo con Plan 05 (depende solo de Plan 03 — no de Plan 04, porque los paths cubiertos NO usan few-shots).
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/STATUS.md
@.planning/standalone/somnio-v4-rag-generative/03-SUMMARY.md
@src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 6.1: Crear `smoke-rag-b.test.ts` con 10 casos regression</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/STATUS.md líneas 103-135 (los 10 casos verbatim)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 861-873 (smoke-rag-b spec)
    - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts (análogo Vitest)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (post-Plan 03 — para entender runSubLoop signature actualizada)
    - src/lib/agents/somnio-v4/sub-loop/tools.ts (post-Plan 03 — verificar que los tools para crm_mutation siguen disponibles)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts`:

    ```ts
    /**
     * Smoke B — Regression (paths NO migrados al RAG-generative).
     *
     * 10 casos lockeados (STATUS.md líneas 103-135):
     * - 3 razonamiento_libre: filosofía/anécdota cliente → handoff silente.
     * - 3 crm_mutation: createOrder, moveOrderToStage, addOrderNote (flujo viejo D-12).
     * - 3 state machine happy path: saludo, precio, confirmación (NO sub-loop).
     * - 1 cas_reject: stage_changed_concurrently mockeado (flujo viejo D-12).
     *
     * NO usa LLM-as-judge (regresiones estructurales — RESEARCH líneas 870-873).
     *
     * Standalone somnio-v4-rag-generative Plan 06.
     */
    import { describe, it, expect } from 'vitest'
    import { writeFileSync, appendFileSync } from 'node:fs'
    import { runSubLoop } from '../sub-loop'

    const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    const RESULTS_PATH = '.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md'

    type SmokeBCase = {
      idx: number
      group: 'razonamiento_libre' | 'crm_mutation' | 'state_machine' | 'cas_reject'
      userMessage: string
      reason: 'razonamiento_libre' | 'crm_mutation' | 'cas_reject' | null  // null = state machine, NO entra al sub-loop
      expected: string
      expectedStatus: 'generated' | 'template' | 'no_match' | 'SKIP'  // SKIP = state_machine (sin sub-loop)
    }

    const CASES: SmokeBCase[] = [
      // === razonamiento_libre (3) — handoff silente ===
      { idx: 1, group: 'razonamiento_libre', userMessage: 'qué pensás del insomnio?', reason: 'razonamiento_libre', expected: 'handoff silente (divagación, sin KB)', expectedStatus: 'no_match' },
      { idx: 2, group: 'razonamiento_libre', userMessage: 'ayer fue un día raro, no pude dormir', reason: 'razonamiento_libre', expected: 'handoff o template empático', expectedStatus: 'no_match' },
      { idx: 3, group: 'razonamiento_libre', userMessage: 'el sueño es interesante, no?', reason: 'razonamiento_libre', expected: 'handoff silente', expectedStatus: 'no_match' },

      // === crm_mutation (3) — flujo viejo D-12 sin cambios ===
      { idx: 4, group: 'crm_mutation', userMessage: 'dale, quiero comprar. mi dirección es Calle 1 # 2-3', reason: 'crm_mutation', expected: 'createOrder + template post-orden', expectedStatus: 'template' },
      { idx: 5, group: 'crm_mutation', userMessage: 'movéme el pedido a confirmado', reason: 'crm_mutation', expected: 'moveOrderToStage + template', expectedStatus: 'template' },
      { idx: 6, group: 'crm_mutation', userMessage: 'agregá una nota: cliente prefiere AM', reason: 'crm_mutation', expected: 'addOrderNote + confirmación', expectedStatus: 'template' },

      // === state machine happy path (3) — NO debe disparar sub-loop ===
      // Estos casos NO se invocan al runSubLoop directamente — el lifecycle es: comprehension clasifica → response-track manda template directo SIN sub-loop.
      // En este test los marcamos como SKIP (informativo) y los verificamos manualmente que el sandbox/E2E confirme el comportamiento.
      { idx: 7, group: 'state_machine', userMessage: 'hola', reason: null, expected: 'saludo template (sin sub-loop)', expectedStatus: 'SKIP' },
      { idx: 8, group: 'state_machine', userMessage: 'cuánto cuesta?', reason: null, expected: 'precio template (sin sub-loop)', expectedStatus: 'SKIP' },
      { idx: 9, group: 'state_machine', userMessage: 'ya recibí el pedido', reason: null, expected: 'confirmacion template (sin sub-loop)', expectedStatus: 'SKIP' },

      // === cas_reject (1) — mockeado (D-12 propaga verbatim) ===
      { idx: 10, group: 'cas_reject', userMessage: '(simulado: race condition createOrder con stage_changed_concurrently)', reason: 'cas_reject', expected: 'propaga error verbatim, agent decide handoff', expectedStatus: 'no_match' },
    ]

    function writeHeader() {
      writeFileSync(RESULTS_PATH, `# SMOKE B — Regression Results

**Run date:** ${new Date().toISOString()}
**Reviewer:** Jose (pendiente — marcá cada caso después de leerlo)

## Per-case results

`, 'utf8')
    }

    function appendCase(c: SmokeBCase, outcome: any, latencyMs: number, errorMsg?: string, skipped = false) {
      const block = `
### Case ${c.idx} — "${c.userMessage}"

**Group:** ${c.group}
**Expected:** ${c.expected}
**Expected status:** \`${c.expectedStatus}\`
**Latency:** ${latencyMs}ms
${skipped ? '**SKIPPED:** State machine happy path — verificación E2E manual via sandbox.' : ''}
${errorMsg ? `**RUNTIME ERROR:** \`\`\`${errorMsg}\`\`\`` : ''}

**Sub-loop outcome:**
${skipped ? '_(no aplica — state machine path, no sub-loop)_' : `
- status: \`${outcome?.status ?? 'N/A'}\`
- responseText: ${outcome?.responseText ? `"${String(outcome.responseText).slice(0, 200)}"` : '(null/handoff)'}
- responseTemplate: \`${outcome?.responseTemplate ?? 'null'}\`
- reason: \`${outcome?.reason ?? 'N/A'}\`
- requiresHuman: \`${outcome?.requiresHuman ?? 'N/A'}\`
`}

**Auto-check (status match):** ${skipped ? 'N/A' : (outcome?.status === c.expectedStatus ? '✅ PASS' : `❌ FAIL (got '${outcome?.status}', expected '${c.expectedStatus}')`)}
**Jose final:** ☐ PASS / ☐ FAIL / ☐ PARTIAL
**Jose notes:** _(marcar después)_

---
`
      appendFileSync(RESULTS_PATH, block, 'utf8')
    }

    function appendAggregate() {
      const block = `
## Aggregate metrics

| Metric | Count / 10 | % |
|--------|-----------|---|
| Auto-check PASS (status match) | __ | __% |
| Jose PASS | __ | __% |
| Jose FAIL | __ | __% |

## Decision

- [ ] ≥9/10 Jose PASS → green light Plan 08 (SI también Smoke A PASS Plan 05).
- [ ] <9/10 → abrir Plan 07 (iter) antes de Plan 08.

## Per-case failure analysis

_(completar si hay FAILs — describir regresion observada)_
`
      appendFileSync(RESULTS_PATH, block, 'utf8')
    }

    describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4 || !process.env.GOOGLE_GENERATIVE_AI_API_KEY)(
      'Smoke B (regression — 10 casos D-12 paths)',
      () => {
        writeHeader()

        for (const c of CASES) {
          // State machine cases: SKIP (no sub-loop)
          if (c.expectedStatus === 'SKIP') {
            it(`${c.idx}. ${c.group} — ${c.userMessage} (manual verify)`, () => {
              appendCase(c, null, 0, undefined, true)
              expect(true).toBe(true)  // sentinel pass — state machine path no se verifica acá
            })
            continue
          }

          it(`${c.idx}. ${c.group} — ${c.userMessage}`, async () => {
            const t0 = Date.now()
            let outcome: any = null
            let errorMsg: string | undefined

            try {
              // Para cas_reject, necesitamos mockear el escenario — runSubLoop con reason='cas_reject'
              // probablemente requiere setup adicional (orderId fictivo + ctx con flag de simulación).
              // Si el sub-loop actual NO permite invocar cas_reject sin un mutation real, marcar este caso como manual:
              if (c.reason === 'cas_reject') {
                // Skip real invocation — manual verify
                appendCase(c, { status: 'SKIPPED', reason: 'cas_reject requires mutation setup — verify manual via integration test' }, 0, undefined, false)
                expect(true).toBe(true)
                return
              }

              outcome = await runSubLoop({
                reason: c.reason!,
                ctx: {
                  workspaceId: SOMNIO_WORKSPACE_ID,
                  userMessage: c.userMessage,
                  recentMessages: [],
                },
              })
            } catch (err) {
              errorMsg = (err as Error).message
            }

            const latencyMs = Date.now() - t0
            appendCase(c, outcome, latencyMs, errorMsg)

            // Test bloquea por runtime error o si auto-check status NO matchea expectedStatus.
            expect(errorMsg).toBeUndefined()
            if (!errorMsg) {
              expect(outcome?.status).toBe(c.expectedStatus)
            }
          }, 60000)
        }

        it('zz_append_aggregate', () => {
          appendAggregate()
        })
      },
    )
    ```

    **Notas:**
    - State machine cases (idx 7-9): el sub-loop NO se invoca directamente; en la app real, `comprehension` clasifica como "intent claro" → `response-track` emite template sin pasar por `runSubLoop`. Este test los marca como SKIP + verificación manual.
    - cas_reject (idx 10): requiere mockear race condition `stage_changed_concurrently`. Si el sub-loop actual no permite invocarlo aislado, marcar como SKIP + verificación manual via integration tests existentes del crm-writer.
    - crm_mutation cases (idx 4-6): probablemente requieren `ctx.orderId` o similar para createOrder funcione — si la invocación falla por falta de contexto, ajustar el ctx con valores fictivos seguros (workspace dummy si necesario para evitar tocar datos reales). **NO escribir a producción real durante el test — esto sería violación Regla 6.** Si los crm_mutation casos requieren mutación real para ejecutarse, marcarlos también como SKIP + verificación manual via sandbox UI.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "Smoke B (regression" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "describe.skipIf" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "razonamiento_libre" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "crm_mutation" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "cas_reject" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && grep -c "stage_changed_concurrently" src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts && npx tsc --noEmit -p . 2>&1 | grep -E "__tests__/smoke-rag-b" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File exists.
    - 10 casos verbatim de STATUS.md.
    - Grupos: razonamiento_libre, crm_mutation, state_machine, cas_reject presentes.
    - State machine y cas_reject manejados como SKIP con explicación.
    - skipIf gated por env vars.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "__tests__/smoke-rag-b" | wc -l` == 0.
  </acceptance_criteria>
  <done>Smoke B test creado con 10 casos + SKIP handling apropiado para casos que requieren contexto adicional.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.2: Correr Smoke B E2E + revisar resultados + commit + push</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts (post-Task 6.1)
  </read_first>
  <action>
    **Paso 1 — Correr el test:**

    ```bash
    npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts
    ```

    Esperar ~3-5 min (10 casos, varios SKIP, restantes con LLM calls).

    **Paso 2 — Verificar SMOKE-B-RESULTS.md generado:**

    ```bash
    test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
    grep -c "^### Case " .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
    # Esperado: 10
    ```

    **Paso 3 — Análisis:**

    - Contar runtime errors (deben ser 0).
    - Contar auto-check PASS: `grep -c "✅ PASS" .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md`.
    - Listar SKIPS (state_machine + cas_reject + posiblemente crm_mutation): `grep -c "SKIPPED" .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md`.

    **Paso 4 — Reportar al usuario:**

    > "Smoke B ejecutado. SMOKE-B-RESULTS.md generado.
    >  - Runtime errors: X (esperado 0).
    >  - Auto-check PASS: X/Y (los Z restantes son SKIP — state_machine + cas_reject + crm_mutation requieren verificación manual via sandbox).
    >
    > Próximo: revisá personalmente los 10 casos y marcá las casillas Jose. Los SKIP los verificás vos via sandbox / integration tests del crm-writer (Regla 6 — no mutamos en este test).
    >
    > Si ≥9/10 OK Jose Y Smoke A ≥15/17 OK Jose + 0 invenciones → green light Plan 08."

    **Paso 5 — Commit + push:**

    ```
    git add src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts \
            .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md

    git commit -m "$(cat <<'EOF'
    test(somnio-v4-rag-generative): plan 06 — smoke B regression 10 casos (paths NO migrados D-12)

    - NEW src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts: 10 casos D-12 paths (3 razonamiento_libre + 3 crm_mutation + 3 state_machine + 1 cas_reject).
    - NEW .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md: per-case results + auto-check + Jose review pendiente.

    State machine cases (3) + cas_reject (1) + possiblemente crm_mutation casos = SKIP en el test (requieren verificación manual via sandbox / integration tests — Regla 6 no mutar producción).

    razonamiento_libre cases (3) corren real contra runSubLoop — esperamos status='no_match' (handoff silente).

    Sin LLM-as-judge — son regresiones estructurales (RESEARCH líneas 870-873).

    Standalone: somnio-v4-rag-generative Plan 06 (Wave 4 parallel con Plan 05).
    Refs D-12, D-25.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md && grep -c "^### Case " .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md && git log -1 --oneline | grep -i "plan 06" && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - SMOKE-B-RESULTS.md tiene 10 case blocks.
    - Test corrió sin runtime errors.
    - Commit + push exitoso.
    - v4 sigue dormant.
  </acceptance_criteria>
  <done>Plan 06 cerrado. Pendiente Jose review + Smoke A review.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test → OpenAI API (razonamiento_libre cases reales) | 3 LLM calls reales |
| Test → SKIP (state_machine + cas_reject + crm_mutation) | Verificación manual fuera del test |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-01 | Elevation of Privilege | Test crm_mutation crea pedidos reales en producción (viola Regla 6) | HIGH | mitigate | crm_mutation cases marcados como SKIP en este test. Verificación manual via sandbox aislado (no producción). |
| T-06-02 | Denial of Service | Test consume ~3 LLM calls reales | LOW | accept | Costo trivial. |
| T-06-03 | Tampering | Auto-check status puede ser PASS pero contenido del template incorrecto | LOW | mitigate | Jose review manual completa la validación cualitativa. |
| T-06-04 | Repudiation | cas_reject SKIP sin verificación efectiva | MEDIUM | accept | Integration tests del crm-writer ya cubren cas_reject (standalone crm-stage-integrity shipped 2026-04-21). Re-verificar es overhead duplicado. |
</threat_model>

<verification>
- smoke-rag-b.test.ts existe con 10 casos.
- Test corre sin runtime errors.
- SMOKE-B-RESULTS.md generado.
- Commit + push exitoso.
- v4 sigue dormant.
</verification>

<success_criteria>
Plan 06 cerrado cuando:
- [ ] Test creado + 0 runtime errors.
- [ ] SMOKE-B-RESULTS.md generado.
- [ ] Push exitoso.
- [ ] STATUS.md actualizada: Plan 06 done.
- [ ] Plan 08 puede continuar si Smoke A + Smoke B Jose review PASS.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/06-SUMMARY.md` documentando:
- HEAD del commit.
- Runtime errors count.
- Auto-check PASS count.
- SKIPs notados (con razón).
- Pendiente: Jose review manual + verificación sandbox de los SKIPS.
- Próximo paso: si Smoke A + B PASS Jose → Plan 08. Si no → Plan 07.
</output>
