---
phase: somnio-v4-crm-subloop
plan: 05
subsystem: somnio-v4-sub-loop
tags: [crm, sub-loop, grounding, sandbox-parity, ground-truth, v4]
requires:
  - "Plan 02: CrmGrounding + buildCrmGrounding (crm-grounding.ts)"
  - "Plan 04: updateOrder.items[] (crm-mutation-tools)"
  - "Plan 01: TipoAccion recordar_promo/recordar_confirmacion/confirmar_orden"
provides:
  - "deriveCrmActions(rawResult) — ground-truth crmActions[] desde tool-results del AI SDK (origen:'rag')"
  - "createSimulatedMutationTools() — mutation-tools sandbox no-op (sin DB write)"
  - "MUTATION_TOOL_NAMES — set de las 5 mutaciones para filtrar no-mutaciones"
  - "SubLoopToolsContext += grounding?/crmHint?/simulate? (threading + seam de simulacion)"
  - "runCrmSubLoop(args) -> SubLoopResult { outcome, crmActions } — contrato de salida CRM para el gate del Plan 06"
  - "buildToolingPrompt(reason, { grounding, crmHint }) — prompt crm_mutation con Vista A+B + hint + reglas de guard"
affects:
  - "Plan 06: el gate consume runCrmSubLoop().crmActions para poblar el ledger (D-14) + flujo de vuelta al runner"
tech-stack:
  added: []
  patterns:
    - "ground-truth derivation: derivar acciones de rawResult.steps[].toolResults (no auto-reporte del LLM) — D-23"
    - "context-scoped simulate seam: prod tools reales vs sandbox simuladas via flag — D-22"
    - "raw-variant wrapper: runLegacySubLoopRaw devuelve rawResult; runLegacySubLoop wrappea para callers existentes"
key-files:
  created:
    - "src/lib/agents/somnio-v4/sub-loop/crm-echo.ts"
    - "src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts"
  modified:
    - "src/lib/agents/somnio-v4/sub-loop/tools.ts"
    - "src/lib/agents/somnio-v4/sub-loop/index.ts"
    - "src/lib/agents/somnio-v4/sub-loop/prompt.ts"
decisions:
  - "D-23 ground-truth: crmActions se derivan de los tool-results reales del AI SDK, NO del self-report del LLM"
  - "D-22 sandbox parity: mutation-tools simuladas via flag simulate; query-tools nunca se simulan (read-only)"
  - "D-04 grounding threading: campo opcional tipado fuerte en SubLoopToolsContext + hint determinista al prompt"
  - "Contrato de salida via funcion dedicada runCrmSubLoop (no se cambia la firma de runSubLoop global — callers RAG intactos)"
metrics:
  duration: "~25 min"
  completed: "2026-05-29"
  tasks: 3
  files: 5
---

# Phase somnio-v4-crm-subloop Plan 05: Contrato de salida CRM del sub-loop + paridad sandbox Summary

Capa 3 (parte sub-loop): el sub-loop `crm_mutation` ahora EJECUTA y REPORTA de verdad — el orquestador deriva `crmActions[]` de los tool-results reales del AI SDK (ground-truth, no auto-reporte del LLM), recibe el grounding tipado + hint determinista en el prompt con reglas de guard, y el sandbox lo reproduce sin tocar DB via un seam de simulacion. Resuelve el BLOCKER de research #1 (D-23): `LoopOutcomeSchema` no tiene campos de accion CRM, asi que se deriva del `rawResult` en vez de extender el schema.

## What Was Built

### Task 1 — `crm-echo.ts` (TDD)
- `deriveCrmActions(rawResult)`: funcion pura que espeja el patron de `extractStepData` (`steps.flatMap(s => s.toolResults ?? [])`), filtra por `MUTATION_TOOL_NAMES`, mapea `MutationResult.status` -> `result` (`executed`/`duplicate`->`success`, `stage_changed_concurrently`->`cas_reject`, else->`failed`), conserva `args`/`code`/`stageAtTime`, `origen:'rag'`. Defensivo ante `null`/sin steps -> `[]`.
- `createSimulatedMutationTools()`: dict de las 5 mutation-tools AI SDK con `execute` que retorna `{ status:'executed', data:{ id:'sim-...', _simulated:true, ...input } }`. CERO import de domain/supabase.
- 9 tests (7 del behavior + MUTATION_TOOL_NAMES + simulate factory) — verdes.

### Task 2 — Threading grounding/crmHint/simulate
- `SubLoopToolsContext` extendido con `grounding?: CrmGrounding | null`, `crmHint?: string | null`, `simulate?: boolean` (todos opcionales -> backward-compat; `SubLoopContext` los hereda).
- `buildSubLoopTools`: cuando `ctx.simulate === true` usa `createSimulatedMutationTools()` en vez de `createCrmMutationTools(...)`. Las query-tools (read-only) nunca se simulan.

### Task 3 — `runCrmSubLoop` + prompt con grounding+hint+guards
- Refactor: `runLegacySubLoopRaw` devuelve `{ outcome, rawResult }`; `runLegacySubLoop` lo wrappea (firma publica original intacta -> callers RAG/cas_reject sin tocar).
- `runCrmSubLoop(args): Promise<SubLoopResult>` corre el legacy raw y deriva `crmActions` (ground-truth). Exportado para el gate del Plan 06.
- `buildToolingPrompt(reason, { grounding, crmHint })`: para `crm_mutation` inyecta `buildCrmMutationContext` — Vista A (pedido activo: id/stage/valor/items/direccion, o "ninguno"), contacto, Vista B (crmActions previas del ledger), mensaje crudo (D-09), hint determinista, y reglas de guard explicitas (no recrear si hay pedido activo -> updateOrder; createOrder usa contactId+pipelineId del hint; moveOrderToStage SOLO -> CONFIRMADO whitelist; CAS reject -> no reintentar -> no_match). Devuelve string vacio si no hay grounding ni hint (verbatim viejo para callers RAG).

## Deviations from Plan

None — plan executed exactly as written. Los 9 tests incluyen 2 de cobertura extra (MUTATION_TOOL_NAMES contenido + filtrado dentro de los 7 behaviors planificados). El acceptance `smoke-rag-a/b.test.ts` se omitio de la corrida por ser network-bound (condicion documentada en critical_runtime_notes); se corrio `escalation.test.ts` como regresion RAG (6/6 verde).

## Threat Mitigations Applied
- **T-sub-01 (Repudiation):** `deriveCrmActions` usa `rawResult.steps[].toolResults` (ground-truth), no el self-report del LLM.
- **T-sub-02 (Tampering):** reglas de guard explicitas en el prompt (whitelist CONFIRMADO, no-recrear, no-retry CAS) como red de prompt; los guards del Plan 06 son la red final.
- **T-sub-03 (Paridad rota):** `createSimulatedMutationTools` cero import de domain/supabase (grep verificado vacio).

## Verification
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts` -> 9/9 verde.
- `npx vitest run src/lib/agents/somnio-v4/ --exclude '**/smoke-rag-*.test.ts'` -> 162 passed, 5 skipped, 1 failed (`few-shots.test.ts` regex `compañero (humano )?experto` — PRE-EXISTENTE, no toca mis archivos).
- `npx tsc --noEmit` -> solo errores documentados pre-existentes (`conversations.test.ts` + `.next/dev/types/validator.ts`); CERO en sub-loop.
- Greps Regla 3: `crm-echo.ts` sin `createAdminClient`/`@supabase/supabase-js`/`@/lib/domain` (vacio).
- Regla 6: todos los cambios en `src/lib/agents/somnio-v4/**` (v4 DORMANT). Cero migracion DB (Regla 5).

## Commits
- `79d77ce7` test(v4-crm-subloop): failing tests (RED)
- `16c9cb80` feat(v4-crm-subloop): crm-echo.ts deriveCrmActions + simulated tools (GREEN)
- `c322dfab` feat(v4-crm-subloop): thread grounding/crmHint/simulate en tools.ts
- `687e616b` feat(v4-crm-subloop): runCrmSubLoop + prompt crm_mutation con grounding/hint/guards

## Self-Check: PASSED
