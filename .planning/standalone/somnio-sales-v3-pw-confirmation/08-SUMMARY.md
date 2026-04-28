---
phase: somnio-sales-v3-pw-confirmation
plan: 08
status: complete
wave: 3
completed: 2026-04-28
duration_minutes: 8
---

# Plan 08 SUMMARY — Wave 3 Sales-Track Orchestrator

## Decision agregada

**GO** — 1 archivo creado en `src/lib/agents/somnio-pw-confirmation/`. typecheck limpio (0 errores TS introducidos). 1 atomic commit, NO push (Wave 0..6 quedan locales hasta Plan 13 per orchestrator standalone parallel mode).

## Commit (1 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `d6cc3e4` | `feat(somnio-sales-v3-pw-confirmation): add sales-track.ts (resolveSalesTrack — pre-process mergeAnalysis + delegate to transitions + post-process counters/flags D-11/D-21)` |

## Archivo creado

| Path | LoC | Rol |
|------|-----|-----|
| `src/lib/agents/somnio-pw-confirmation/sales-track.ts` | 218 | `resolveSalesTrack` — pre-process mergeAnalysis + delegate a transitions + post-process counters/flags + observability |

## Pipeline implementado

`resolveSalesTrack({ phase, intent, state, analysis, lastTemplate? })` ejecuta 4 pasos:

1. **Pre-process** (`mergeAnalysis(state, analysis)`):
   - Siempre invocado (incluso si `analysis.datos_extraidos` es null) para que el `intent_history` reciba el push del intent actual (cap 6, FIFO).
   - El `mergedState` resultante se usa para evaluar transitions con shipping ya actualizado.
   - **Critico para D-09→D-26 + D-12:** si el cliente dice "si, mi direccion es Calle 100, Bogota, Cundinamarca", `shippingComplete` evalua sobre el state POST-merge → entry #1 de TRANSITIONS emite `confirmar_compra` directo (no cae a entry #2 `pedir_datos_envio`).

2. **Delega** (`resolveTransition({ phase, intent, state: mergedState, lastTemplate })`):
   - Pasa `lastTemplate ?? null` por compat con la signature de `ResolveTransitionInput` (D-26: NO usado como guard, solo informativo).

3. **Post-process** (mutate `state` in-place — el caller observa cambios sin re-llamar mergeAnalysis):
   - `state.datos = mergedState.datos` (propaga campos mergeados).
   - `state.intent_history = mergedState.intent_history` (cap 6).
   - **D-11**: `if accion === 'cancelar_con_agendar_pregunta' → state.cancelacion_intent_count = 1`. Asi el siguiente "no" en `awaiting_schedule_decision` cae a entry #6 (`cancelar_definitivo`).
   - **D-21**: `if accion === 'handoff' || 'cancelar_definitivo' → state.requires_human = true` (handoff stub sin materializacion CRM).
   - `enterCaptura = (accion === 'pedir_datos_envio')` — marker para que el engine Plan 11 transicione phase a `'capturing_data'` para el proximo turn (entry #12 luego auto-promueve a `confirmar_compra` cuando shippingComplete).

4. **Observability** (`getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', payload)`):
   - Payload: `agent`, `phase`, `intent`, `accion`, `reason`, `enterCaptura`, `cancelacion_intent_count`, `requires_human`, `hasDataChanges`, `shippingJustCompleted`.

## Quote del bloque post-process (D-11 + D-21 verificados)

```typescript
  // 3b. D-11 cancellation counter: 1er "no" emite cancelar_con_agendar_pregunta;
  //     incrementamos a 1 para que el siguiente "no" en awaiting_schedule_decision
  //     caiga a entry #6 (cancelar_definitivo).
  if (transition.accion === 'cancelar_con_agendar_pregunta') {
    state.cancelacion_intent_count = 1
  }

  // 3c. D-21 handoff stub flag (sin materializacion CRM — solo telemetria).
  //     Triggers: accion='handoff' (entry #10/11/guard R1) o 'cancelar_definitivo'
  //     (entry #6 — 2do "no" tras agendar_pregunta).
  if (transition.accion === 'handoff' || transition.accion === 'cancelar_definitivo') {
    state.requires_human = true
  }

  // 3d. enterCaptura marker: cuando emitimos pedir_datos_envio, el engine
  //     Plan 11 debe transicionar phase a 'capturing_data' para el proximo
  //     turn. Asi entry #12 (capturing_data + fallback + shippingComplete)
  //     puede auto-promover a confirmar_compra cuando el cliente complete.
  const enterCaptura = transition.accion === 'pedir_datos_envio'
```

## Decisiones lockeadas implementadas

- **D-09 → D-26**: el guard del "si" se evalua via `state.phase IN INITIAL_AWAITING_STATES` dentro de `resolveTransition` (entry #1). sales-track NO consulta `messages.template_name`. El parametro `lastTemplate` se acepta por compat pero queda informativo (NO usado como guard) — exactamente como spec del plan + D-26 + nota en `transitions.ts:55-57`.
- **D-11 cancellation 2-step**: counter `state.cancelacion_intent_count` se incrementa a `1` cuando emitimos `cancelar_con_agendar_pregunta`. La 2da "no" del cliente (en phase `awaiting_schedule_decision`) cae a entry #6 de TRANSITIONS (`cancelar_definitivo`) — entonces sales-track ademas setea `requires_human=true` (D-21).
- **D-21 handoff stub**: flag `state.requires_human=true` se levanta cuando accion=`handoff` (triggers c/d: error tecnico cancelar_definitivo, cliente pide humano) o `cancelar_definitivo` (trigger a: 2do "no" tras agendar_pregunta). NO mutaciones CRM aqui — solo telemetria. La materializacion del handoff se construye en standalone futuro (per CONTEXT.md §D-21).
- **D-25 state-machine pure**: ningun I/O. Imports estrictamente locales al modulo (`./state`, `./transitions`, `./types`, `./comprehension-schema`) + 1 unica dependencia transversal `@/lib/observability` (mismo patron que recompra/sales-track.ts). NO `createAdminClient`, NO `generateText`, NO HTTP.

## Diferencias vs `somnio-recompra/sales-track.ts` (referencia mas cercana)

1. **Mutation in-place del state**: recompra retorna immutable y su engine actualiza counters fuera. PW muta `state.cancelacion_intent_count`/`state.requires_human`/`state.datos`/`state.intent_history` directamente — el engine Plan 11 leera el state post-call para serializar (por design — engine queda mas simple).
2. **Pre-process mergeAnalysis** vive aca, no en el engine (recompra hace merge en su engine antes de invocar sales-track). Localizar el merge en sales-track simplifica la composicion para Plan 11.
3. **enterCaptura marker** es nuevo en PW (recompra no tiene phase `capturing_data` — sus datos vienen preloaded). Engine Plan 11 lo lee y transiciona phase explicitamente.
4. **secondarySalesAction** siempre `undefined` en V1 (campo queda por compat con engine signature). v3 lo usa para "ask_ofi_inter"; recompra no lo usa; PW lo reserva para futuras extensions.
5. **Sin timer events**: PW V1 NO maneja `event.type === 'timer_expired'` (no hay timer system todavia — D-25 deja eso fuera de scope). El input es solo `(phase, intent, state, analysis, lastTemplate)`.

## Comportamiento del intent_history

`mergeAnalysis` empuja `analysis.intent` al `intent_history` siempre (incluso cuando `datos_extraidos` es null). Por tanto sales-track invoca `mergeAnalysis` en ambas ramas (`if datos_extraidos` y `else`) — la unica diferencia es que `changes.hasNewData` sera false cuando datos_extraidos no aporta nada.

Esto preserva la trazabilidad de los ultimos 6 intents del cliente para tests + observability sin requerir codigo adicional en el caller.

## typecheck output

```bash
$ npx tsc --noEmit
exit: 0 (zero TS errors)

$ npx tsc --noEmit 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/sales-track\.ts" | wc -l
0

$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0
```

**0 errores TS** introducidos. typecheck global del repo paso clean.

## Imports — boundary check

| Origen | Destino | Uso |
|--------|---------|-----|
| `sales-track.ts` | `@/lib/observability` (`getCollector`) | observability event |
| `sales-track.ts` | `./comprehension-schema` (`MessageAnalysis` type) | input type |
| `sales-track.ts` | `./state` (`mergeAnalysis`, `AgentState`, `StateChanges`) | pre-process + state shape |
| `sales-track.ts` | `./transitions` (`resolveTransition`) | delegation |
| `sales-track.ts` | `./types` (`TipoAccion`) | output type |

Mismo set de imports que recompra/sales-track.ts (modulo locales del propio agente + observability). Cero acoplamiento a otros agentes o a infra de DB.

## Verificacion gates del plan (todos pasaron)

```bash
=== Verification gates ===
OK: file exists
OK: export resolveSalesTrack
OK: mergeAnalysis
OK: resolveTransition
OK: cancelacion_intent_count
OK: requires_human
OK: enterCaptura
OK: sales_track_result
OK: typecheck (0 errors TS introducidos)
OK: commit atomico (d6cc3e4)
```

## Desviaciones del plan

**Ninguna desviacion material.** Todas las assertions del plan pasaron en primera ejecucion. Notas menores:

1. **`mergeAnalysis` siempre invocado** (incluso cuando `analysis.datos_extraidos` es null/undefined): el plan dice "si analysis.datos_extraidos contiene campos non-null, llamar mergeAnalysis". Decidi invocarlo SIEMPRE porque mergeAnalysis tambien actualiza `intent_history` (push del intent actual + cap 6 FIFO) — saltar la llamada cuando datos_extraidos es null perderia el intent_history update. Documentado in-file ("Aun sin datos_extraidos, queremos pushear el intent al history"). Si datos_extraidos es null, `mergeAnalysis` returns mismo state structuralmente con solo `intent_history` actualizado y `changes.hasNewData=false` — comportamiento esperado.

2. **Firma del observability event**: el plan dice "metrics (phase, intent, accion, reason)". Agregue ademas `enterCaptura`, `cancelacion_intent_count`, `requires_human`, `hasDataChanges`, `shippingJustCompleted` para observability mas rica (clonado del patron recompra que tambien expande el payload). Plan no lo prohibia explicitamente.

3. **Pre-mutation snapshot del state**: el plan no especifica orden de operaciones. Decidi que `mergedState` (immutable retornado por mergeAnalysis) es lo que pasa a `resolveTransition`, y SOLO despues del transition resolver propago `mergedState.datos` y `mergedState.intent_history` al `state` original mutable. Asi si hubiera un crash en `resolveTransition`, el state original queda intacto (defense-in-depth).

## Implicancias para Plans subsiguientes

### Plan 11 (engine-pw-confirmation.ts)
- Compone: `analyzeMessage` (Plan 05) → `checkGuards` (Plan 06) → `resolveSalesTrack` (este Plan 08) → `responseTrack` (Plan 07) + `crmWriterAdapter` (Plan 10).
- **NO necesita llamar `mergeAnalysis` antes** — `resolveSalesTrack` lo hace internamente.
- **NO necesita actualizar counters** post-call — `resolveSalesTrack` muta `state.cancelacion_intent_count` y `state.requires_human` in-place.
- Lee `output.enterCaptura` para decidir si transicionar `state.phase = 'capturing_data'` antes de serializar.
- Lee `output.accion` para invocar el adapter de Plan 10 (`crm-writer-adapter`):
  - `'confirmar_compra'` → `moveOrderToStage(orderId, CONFIRMADO)` (D-10).
  - `'mover_a_falta_confirmar'` → `moveOrderToStage(orderId, FALTA_CONFIRMAR)` (D-14).
  - `'actualizar_direccion'` → `updateOrder({ shippingAddress, shippingCity, shippingDepartment })` (D-12).
  - `'handoff' | 'cancelar_definitivo' | 'editar_items' | 'noop'` → `messages: []` (silent handoff per ACTION_TEMPLATE_MAP).
- Push `output.accion` a `state.acciones` antes de `serializeState(state)` para persistir en sesion.
- Usa `derivePhase(state.acciones)` para observability event final (NO para tomar decisiones — solo display).

### Plan 12 (tests)
Suites para `sales-track.test.ts`:
- D-11 multi-turn: simular 1er "no" en `awaiting_confirmation` → assert `accion='cancelar_con_agendar_pregunta'` + `state.cancelacion_intent_count===1`. Luego 2do "no" en `awaiting_schedule_decision` → assert `accion='cancelar_definitivo'` + `state.requires_human===true`.
- D-09→D-26: cliente provee datos + "si" en mismo mensaje → assert `accion='confirmar_compra'` (no cae a `pedir_datos_envio`).
- D-21: intent='pedir_humano' → assert `accion='handoff'` + `requires_human===true`.
- enterCaptura: confirmar incompleto → assert `enterCaptura===true` + accion='pedir_datos_envio'.
- intent_history capping: 7 mensajes → assert `state.intent_history.length===6`.
- Observability: assert `getCollector()` recibe `pipeline_decision:sales_track_result` con payload completo (mockear collector).

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/somnio-pw-confirmation/sales-track.ts (218 LoC)

=== Commits exist ===
FOUND: d6cc3e4 (sales-track.ts)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors)
```

- [x] sales-track.ts creado (218 LoC > 80 min).
- [x] `resolveSalesTrack` exportada con signature documentada.
- [x] Pre-process invoca `mergeAnalysis` (siempre, no solo cuando hay datos_extraidos — preserva intent_history update).
- [x] Delega a `resolveTransition` con mergedState.
- [x] Post-process: D-11 counter (`cancelacion_intent_count=1` cuando accion=`cancelar_con_agendar_pregunta`).
- [x] Post-process: D-21 flag (`requires_human=true` cuando accion=`handoff` o `cancelar_definitivo`).
- [x] enterCaptura marker (`true` cuando accion=`pedir_datos_envio`).
- [x] Observability event `pipeline_decision:sales_track_result` con payload rico.
- [x] secondarySalesAction siempre undefined (V1 — compat con engine signature).
- [x] typecheck OK (0 errores TS introducidos).
- [x] 1 commit atomico (`d6cc3e4`), NO pusheado.
- [x] Imports locales al modulo + observability (mismo set que recompra/sales-track.ts).

**Self-Check: PASSED**
