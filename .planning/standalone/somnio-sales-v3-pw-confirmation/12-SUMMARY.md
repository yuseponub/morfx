---
phase: somnio-sales-v3-pw-confirmation
plan: 12
status: complete
wave: 6
completed: 2026-04-28
duration_minutes: 18
---

# Plan 12 SUMMARY — Wave 6 Test Suite (5 vitest suites, 65 tests)

## Decision agregada

**GO** — 5 archivos de tests creados en `src/lib/agents/somnio-pw-confirmation/__tests__/` cubriendo las 6 decisiones criticas D-09 → D-26, D-10, D-11 multi-turn, D-12, D-13 V1, D-14 + D-21 + error contract D-06 (stage_changed_concurrently). 65 tests passing, typecheck limpio (0 errores TS), 5 commits atomicos + SUMMARY = 6 commits totales. NO push (Plan 13 owns el push).

## Commits (5 atomic + 1 SUMMARY)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `2dc2a09` | `test(somnio-sales-v3-pw-confirmation): add transitions.test.ts (D-09→D-26 + D-10 + D-11 multi-turn + D-12 + D-13 V1 handoff + D-14)` |
| 2    | `683a52a` | `test(somnio-sales-v3-pw-confirmation): add state.test.ts (shippingComplete algorithm + extractActiveOrder graceful + createInitialState D-26)` |
| 3    | `b34040d` | `test(somnio-sales-v3-pw-confirmation): add response-track.test.ts (template selection + delivery-zone variation D-10 + direccion_completa con departamento D-12)` |
| 4    | `ef6da66` | `test(somnio-sales-v3-pw-confirmation): add sales-track.test.ts (D-11 multi-turn cancellation + D-09→D-26 datos+confirmacion mismo mensaje + D-21 requires_human flag)` |
| 5    | `144a980` | `test(somnio-sales-v3-pw-confirmation): add crm-writer-adapter.test.ts (propose+confirm happy paths + stage_changed_concurrently propagation verbatim + expired/rejected paths)` |
| 6    | TBD       | `docs(somnio-sales-v3-pw-confirmation): Plan 12 SUMMARY — vitest coverage (5 suites, 65 tests, all D-locks tested)` |

## Archivos creados

| Path | LoC | Tests | Rol |
|------|-----|-------|-----|
| `src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts` | 309 | 15 | Cobertura `resolveTransition` — declarative table 12 entries + first-match wins |
| `src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts` | 320 | 20 | Cobertura `shippingComplete` (RESEARCH §D.3) + `extractActiveOrder` (defensive) + `createInitialState` (D-26) + serialize/deserialize round-trip |
| `src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts` | 321 | 15 | Cobertura `resolveSalesActionTemplates` — switch + zone-based selector + INFORMATIONAL_INTENTS smoke |
| `src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts` | 260 | 7 | Cobertura `resolveSalesTrack` — D-11 multi-turn + mergeAnalysis pre-process + enterCaptura + requires_human |
| `src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts` | 279 | 8 | Cobertura `updateOrderShipping` + `moveOrderToConfirmado` + `moveOrderToFaltaConfirmar` + D-06 propagacion verbatim |

**Total: 1489 LoC, 65 tests** across 5 suites.

## Cobertura por decision lockeada

| D-Lock | Test(s) que la cubren | Asercion clave |
|--------|----------------------|----------------|
| **D-06** (cross-agent error contract) | crm-writer-adapter.test.ts: "stage_changed_concurrently propagated verbatim" | `result.error.code === 'stage_changed_concurrently'` (NO conversion a generico) |
| **D-09 → D-26** (state-based confirmation guard) | transitions.test.ts: "happy path" + "missing shipping" + "alternate state"; sales-track.test.ts: "datos+confirmacion mismo mensaje" | `phase IN INITIAL_AWAITING_STATES + intent='confirmar_pedido' + shippingComplete()` → `confirmar_compra` (state, no `messages.template_name`) |
| **D-10** (confirmacion → CONFIRMADO + zone-based template) | transitions.test.ts: "happy path"; response-track.test.ts: "ciudad same_day" + "ciudad 2_4_days" + "sin ciudad fallback"; crm-writer-adapter.test.ts: "moveOrderToConfirmado happy path" | accion = `confirmar_compra`; template = `confirmacion_orden_same_day` vs `_transportadora`; `newStageId === PW_CONFIRMATION_STAGES.CONFIRMADO` |
| **D-11** (cancelacion 2 pasos) | transitions.test.ts: "step 1" + "step 2" + "alt path agendar"; sales-track.test.ts: "turn 1" + "turn 2" | Turn 1: `count=0 → cancelar_con_agendar_pregunta + count=1`. Turn 2: `phase=awaiting_schedule_decision + count=1 → cancelar_definitivo + requires_human=true` |
| **D-12** (cambiar direccion + direccion_completa) | transitions.test.ts: "cambiar_direccion" (3 tests); response-track.test.ts: "pedir_datos_envio" + "direccion_completa con depto" + "drops null depto" | accion = `actualizar_direccion`; `direccion_completa = "Cra 10 #20-30, Bucaramanga, Santander"` (incluye depto, NO orphan trailing comma) |
| **D-13 V1** (editar_items → handoff) | transitions.test.ts: "editar_items handoff"; response-track.test.ts: "editar_items → cancelado_handoff"; sales-track.test.ts: "editar_items → requires_human=true" | accion = `handoff`, template = `cancelado_handoff`, `state.requires_human=true` |
| **D-14** (esperar → mover_a_falta_confirmar) | transitions.test.ts: "esperar"; response-track.test.ts: "claro_que_si_esperamos"; crm-writer-adapter.test.ts: "moveOrderToFaltaConfirmar happy path" | accion = `mover_a_falta_confirmar`; template = `claro_que_si_esperamos`; `newStageId === FALTA_CONFIRMAR` |
| **D-21** (handoff stub flag) | transitions.test.ts: "pedir_humano handoff"; response-track.test.ts: "handoff → cancelado_handoff"; sales-track.test.ts: "handoff requires_human flag" (2 tests) | accion = `handoff`; `state.requires_human=true` |
| **D-26** (estado inicial = `awaiting_confirmation` tras CRM reader) | state.test.ts: "createInitialState con activeOrder + crmContextStatus=ok" | `phase === 'awaiting_confirmation'` cuando hay pedido + reader OK; `phase === 'nuevo'` en degradacion |
| **D-27** (registro_sanitario en INFORMATIONAL_INTENTS) | response-track.test.ts: "INFORMATIONAL_INTENTS includes registro_sanitario" | `INFORMATIONAL_INTENTS.has('registro_sanitario') === true` |

## Output `npx vitest run src/lib/agents/somnio-pw-confirmation/__tests__/`

```
 ✓ src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts        (15 tests) 6ms
 ✓ src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts              (20 tests) 9ms
 ✓ src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts     (15 tests) 7ms
 ✓ src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts        (7 tests) 6ms
 ✓ src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts (8 tests) 30ms

 Test Files  5 passed (5)
      Tests  65 passed (65)
   Duration  ~11s
```

## typecheck

```bash
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0

$ npx tsc --noEmit 2>&1 | grep "src/lib/agents/somnio-pw-confirmation/" | wc -l
0

$ npx tsc --noEmit 2>&1 | grep "src/lib/agents/engine-adapters/" | wc -l
0
```

**0 errores TS** introducidos por los 5 archivos de test. typecheck global del repo paso clean.

## Patrones tecnicos aplicados

### 1. Mock pattern: `vi.hoisted()` para refs visibles a `vi.mock` factories

Vitest hoistea `vi.mock(...)` al top del archivo. Los `const` top-level NO estan inicializados cuando la factory se ejecuta. Solucion (response-track.test.ts + crm-writer-adapter.test.ts):

```typescript
const { mockA, mockB } = vi.hoisted(() => ({
  mockA: vi.fn(),
  mockB: vi.fn(),
}))

vi.mock('@/lib/...', () => ({ a: mockA, b: mockB }))
```

Pattern documentado en https://vitest.dev/api/vi.html#vi-mock — alternativa robusta a definir `vi.fn()` adentro de cada factory (que no permitiria compartir referencias entre tests).

### 2. Helper `createPreloadedState` inline en cada test

`state.ts` NO exporta `createPreloadedState` (a diferencia de `recompra/state.ts:80`). Cada test que necesita un fixture de `AgentState` lo construye con un helper local. Razon: el plan original (Plan 06) decidio mantener `state.ts` PURO y no agregar helpers de fixture-only.

### 3. Mock de TemplateManager (response-track.test.ts)

Misma estructura que `recompra/__tests__/response-track.test.ts`: mockear el constructor para devolver instancias con metodos mockeados:

```typescript
vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))
```

Permite testear `resolveSalesActionTemplates` (export local) sin tocar DB. Para `resolveResponseTrack` (que invoca TemplateManager), tambien sirve — los tests de Plan 12 enfocan en `resolveSalesActionTemplates` porque es el switch puro; tests E2E con TemplateManager real quedan para Plan 13 build/integration.

### 4. Mutacion in-place del state (sales-track.test.ts)

`resolveSalesTrack` muta `state` IN-PLACE (counters/flags). Los tests verifican post-call:

```typescript
const state = buildState({ cancelacion_intent_count: 0 })
const result = resolveSalesTrack({ ..., state })
expect(state.cancelacion_intent_count).toBe(1)  // mutation verified
```

Esto es por contract con engine Plan 11 (que pasa state mutable y lee post-call).

### 5. Defensive parsing tests (state.test.ts extractActiveOrder)

Coverage explicita de los 5 paths de `extractActiveOrder`:
- JSON valido → ActiveOrderPayload tipado.
- JSON malformed → null sin throw (warning a stderr esperado, no es failure).
- JSON empty `{}` → null (shape no incluye required fields).
- null/undefined/whitespace → null.
- JSON con shape parcial (sin orderId/stageId/pipelineId como strings non-empty) → null.

## Desviaciones del plan

### Rule 2 (Auto-add missing critical) — `vi.hoisted` pattern

**No es un cambio funcional, es un cambio de mocking pattern.** El plan dice "vi.mock al top" + listas las refs como `const` top-level. La primera ejecucion fallo con:

```
ReferenceError: Cannot access 'lookupDeliveryZoneMock' before initialization
```

vitest 1.6 hoistea `vi.mock(...)` ANTES de inicializar `const`. La solucion estandar es `vi.hoisted()` (introducido en vitest 0.31, doc en https://vitest.dev/api/vi.html#vi-hoisted). Aplicado a:
- `response-track.test.ts` — hoist de `getTemplatesForIntentsMock`, `processTemplatesMock`, `lookupDeliveryZoneMock`, `formatDeliveryTimeMock`.
- `crm-writer-adapter.test.ts` — hoist de `proposeActionMock`, `confirmActionMock`.

`transitions.test.ts`, `state.test.ts`, `sales-track.test.ts` NO necesitan mocks (son testss de funciones puras), entonces no aplican.

### Rule 3 (No-blocker auto-fix) — `as MessageAnalysis` cast en sales-track.test.ts

El helper `buildAnalysis` retorna un objeto literal `{intent, confidence, datos_extraidos, notas}`. Sin el cast `as MessageAnalysis`, TypeScript se queja porque `intent` es typed como string (no como Zod enum literal). El cast es seguro en tests porque construimos los valores nosotros mismos. Documentado in-file via `as MessageAnalysis`.

### NO afecta produccion

Las desviaciones son SOLO en archivos `__tests__/`. Cero cambios a `src/lib/agents/somnio-pw-confirmation/transitions.ts | state.ts | response-track.ts | sales-track.ts` ni a `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts`.

## Boundary check — imports en los 5 tests

| Archivo | Imports productivos | Mocks |
|---------|--------------------|-------|
| `transitions.test.ts` | `../transitions` (resolveTransition), `../state` (AgentState, ActiveOrderPayload tipos) | NINGUNO (puro) |
| `state.test.ts` | `../state` (shippingComplete, extractActiveOrder, createInitialState, serialize/deserialize, tipos) | NINGUNO (puro) |
| `response-track.test.ts` | `../response-track` (resolveSalesActionTemplates), `../constants` (INFORMATIONAL_INTENTS), `../state` (AgentState, ActiveOrderPayload tipos) | `@/lib/agents/somnio/template-manager`, `@/lib/agents/somnio-v3/delivery-zones` |
| `sales-track.test.ts` | `../sales-track` (resolveSalesTrack), `../state` (AgentState, ActiveOrderPayload tipos), `../comprehension-schema` (MessageAnalysis tipo) | NINGUNO (puro — getCollector retorna undefined sin setup, OK) |
| `crm-writer-adapter.test.ts` | `../../engine-adapters/production/crm-writer-adapter`, `../constants` (PW_CONFIRMATION_STAGES) | `@/lib/agents/crm-writer/two-step` (proposeAction + confirmAction) |

Imports productivos solo del modulo PW + adapter co-localizado. Ningun test importa del propio CRM writer / domain / supabase.

## Implicancias para Plan 13 (push)

- **typecheck OK** — `npx tsc --noEmit` exit 0.
- **vitest OK** — 65 tests passing en local.
- **build TBD** — Plan 13 ejecuta `npm run build` antes del push (no se ejecuto aqui — Plan 12 enfocado en tests).
- **NO push** — Plan 13 hace `git push origin main` con el bundle completo de Plans 07-12 (Wave 4-6 commits).
- **Regresion safety**: cualquier cambio futuro al state machine, response-track, sales-track, o adapter se detecta en CI (vitest run pasa por GH Actions cuando configurado, o local).

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts (309 LoC, 15 tests)
FOUND: src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts (320 LoC, 20 tests)
FOUND: src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts (321 LoC, 15 tests)
FOUND: src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts (260 LoC, 7 tests)
FOUND: src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts (279 LoC, 8 tests)

=== Commits exist (worktree branch) ===
FOUND: 2dc2a09 (transitions.test.ts)
FOUND: 683a52a (state.test.ts)
FOUND: b34040d (response-track.test.ts)
FOUND: ef6da66 (sales-track.test.ts)
FOUND: 144a980 (crm-writer-adapter.test.ts)

=== vitest ===
$ npx vitest run src/lib/agents/somnio-pw-confirmation/__tests__/
Test Files: 5 passed (5)
Tests: 65 passed (65)
exit: 0

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors)
```

- [x] 5 test suites creados.
- [x] >=8 tests en transitions.test.ts (15 actual).
- [x] >=8 tests en state.test.ts (20 actual).
- [x] >=8 tests en response-track.test.ts (15 actual).
- [x] >=5 tests en sales-track.test.ts (7 actual).
- [x] >=6 tests en crm-writer-adapter.test.ts (8 actual).
- [x] **TOTAL: 65 tests** (>= target 35 per plan).
- [x] D-09 → D-26 cubierto en 4 tests (transitions: 3 + sales-track: 1).
- [x] D-10 cubierto en 5 tests (transitions: 1 + response-track: 3 + crm-writer-adapter: 1).
- [x] D-11 multi-turn cubierto en 5 tests (transitions: 3 + sales-track: 2).
- [x] D-12 cubierto en 6 tests (transitions: 3 + response-track: 3).
- [x] D-13 V1 handoff cubierto en 3 tests (transitions: 1 + response-track: 1 + sales-track: 1).
- [x] D-14 cubierto en 3 tests (transitions: 1 + response-track: 1 + crm-writer-adapter: 1).
- [x] D-21 handoff cubierto en 4 tests (transitions: 1 + response-track: 1 + sales-track: 2).
- [x] D-26 createInitialState cubierto en state.test.ts.
- [x] D-06 stage_changed_concurrently propagation verbatim verificado en crm-writer-adapter.test.ts.
- [x] direccion_completa INCLUYE departamento (D-12 lock, leccion recompra-template-catalog 2026-04-23).
- [x] typecheck OK (0 errores TS introducidos).
- [x] 5 commits atomicos + 1 SUMMARY commit, NO pusheados.

**Self-Check: PASSED**
