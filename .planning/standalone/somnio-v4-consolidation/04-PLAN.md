---
phase: somnio-v4-consolidation
plan: 04
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/agents/interruption-system-v2/observability.ts
  - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts
  - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts
  - CLAUDE.md
  - .claude/rules/agent-scope.md
autonomous: true
requirements: [D-16]
must_haves:
  truths:
    - "El union LockEventLabel tiene exactamente 11 labels — los 3 fantasma (follower_woke, lock_force_acquired_after_ttl_expiry, heartbeat_renewed) fuera"
    - "Los gates grep de CLAUDE.md §interruption-system-v2 reflejan 11 labels y siguen siendo ejecutables y verdes"
    - "Los únicos asserts modificados son los sancionados por D-16 (observability.test.ts lista exhaustiva + e2e-scenarios.test.ts simulación TTL) — carve-out explícito de D-09"
    - "interruption-tab.tsx NO fue tocado (fuera de scope D-11 — usa array local, cero diff forzado)"
  artifacts:
    - path: "src/lib/agents/interruption-system-v2/observability.ts"
      provides: "union LockEventLabel honesto de 11 labels"
  key_links:
    - from: "CLAUDE.md gate grep de labels"
      to: "observability.ts"
      via: "grep -oE con los 11 labels | wc -l = 11"
      pattern: "lock_acquired|lock_orphan_swept_by_cron"
---

<objective>
Wave 1 — D-16: el union tipado `LockEventLabel` pasa de 14 a 11 labels, eliminando los 3 que tienen CERO emisores en código no-test (verificado por grep en RESEARCH). El tipo debe reflejar la realidad; re-agregarlos en el futuro es barato.

Purpose: types honestos en el módulo de lock antes de que el core W2 lo consuma.
Output: union de 11 labels + tests ajustados (carve-out sancionado) + gates de CLAUDE.md actualizados.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-16)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (Pitfall 5 — acoplamientos test por archivo)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§observability.ts — el union actual con los 3 a borrar marcados)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)

DECLARACIÓN CARVE-OUT D-09 (Pitfall 5): este plan MODIFICA asserts en `observability.test.ts` (lista exhaustiva 14→11) y ELIMINA/ajusta el bloque de simulación TTL en `e2e-scenarios.test.ts` que emite `lock_force_acquired_after_ttl_expiry`. Ambos cambios están SANCIONADOS por D-16 — son consecuencia directa del mandato, no regresiones. Ningún otro assert se toca.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reducir el union LockEventLabel 14→11 + ajustar tests sancionados</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/observability.ts (union completo ~:30-61 + docstrings que mencionen "14")
    - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts (lista exhaustiva de 14 labels + describe "typed 14-label emitter")
    - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts (~:239 y ~:271 — emisión y assert de lock_force_acquired_after_ttl_expiry en simulación)
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts (~:709-711) y src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts (~:696) — SOLO LECTURA: filtros string-compare sobre 'heartbeat_renewed' que NO rompen typecheck
  </read_first>
  <files>src/lib/agents/interruption-system-v2/observability.ts, src/lib/agents/interruption-system-v2/__tests__/observability.test.ts, src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts</files>
  <action>
    1. Pre-check (gate de seguridad): confirmar cero emisores en código no-test:
    `grep -rn "follower_woke\|lock_force_acquired_after_ttl_expiry\|heartbeat_renewed" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "interruption-tab"` — debe retornar SOLO la definición del union en observability.ts (y comentarios). Si aparece un emisor real (`emitLockEvent('<label>'`), PARAR: D-16 solo aplica a labels sin NINGÚN emisor.
    2. En `observability.ts`: borrar del union `LockEventLabel` las 3 líneas: `'follower_woke'`, `'lock_force_acquired_after_ttl_expiry'`, `'heartbeat_renewed'`. Actualizar cualquier docstring/comentario del archivo que diga "14" labels → "11" (con nota: `// 3 labels fantasma removidos en D-16 somnio-v4-consolidation — cero emisores; re-agregar es barato`).
    3. CARVE-OUT SANCIONADO en `observability.test.ts`: actualizar la lista exhaustiva de labels de 14 → 11 (quitar los 3) y renombrar el describe "typed 14-label emitter" → "typed 11-label emitter".
    4. CARVE-OUT SANCIONADO en `e2e-scenarios.test.ts` (~:239/:271): el bloque que EMITE `lock_force_acquired_after_ttl_expiry` vía emitLockEvent (simulación) queda type-inválido tras reducir el union → eliminar o ajustar SOLO ese bloque de simulación (el comportamiento que el escenario prueba no necesita ese label). No tocar los demás escenarios.
    5. NO tocar: `restart-loop.test.ts` ni `engine-v4-lock.test.ts` (sus filtros son string-compare sobre eventos que jamás llegan — compilan y pasan; limpiarlos sería diff innecesario), NI `interruption-tab.tsx` (usa array `as const` LOCAL sin importar el union — fuera de scope D-11; sus entradas stale se documentan en Plan 05).
    6. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes. Commit: `refactor(somnio-v4-consolidation 04): D-16 union LockEventLabel 14→11 — borra 3 labels sin emisor (carve-out tests sancionado)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "follower_woke\|lock_force_acquired_after_ttl_expiry\|heartbeat_renewed" src/lib/agents/interruption-system-v2/observability.ts  # debe ser 0 (o solo en el comentario de nota)</automated>
  </verify>
  <acceptance_criteria>
    - `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|zombie_lambda_exit|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` = 11
    - `grep -cE "'(follower_woke|lock_force_acquired_after_ttl_expiry|heartbeat_renewed)'" src/lib/agents/interruption-system-v2/observability.ts` = 0
    - `grep -c "11-label" src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` ≥ 1
    - `git diff --name-only` NO incluye interruption-tab.tsx, restart-loop.test.ts ni engine-v4-lock.test.ts
    - SUITE_CMD verde
  </acceptance_criteria>
  <done>Union honesto de 11 labels; solo los 2 archivos de test sancionados ajustados.</done>
</task>

<task type="auto">
  <name>Task 2: Actualizar gates verificables de CLAUDE.md (conteo 14→11)</name>
  <read_first>
    - CLAUDE.md (NO existe sección de labels en el CLAUDE.md raíz — verificar) y .claude/rules/agent-scope.md §"Module Scope: interruption-system-v2" (aquí viven: el bullet PUEDE de emitLockEvent "14 D-17-extended labels", el gate grep "14 D-17-extended event labels enforceable" con el regex completo, y la mención "14 lifecycle labels" en el consumidor sandbox debug-panel)
    - El union final de observability.ts (Task 1) — fuente de verdad de los 11 labels
  </read_first>
  <files>CLAUDE.md, .claude/rules/agent-scope.md</files>
  <action>
    1. Localizar TODAS las menciones del conteo: `grep -n "14" CLAUDE.md .claude/rules/agent-scope.md | grep -i "label"` (la sección "Module Scope: interruption-system-v2" vive en `.claude/rules/agent-scope.md`; si alguna mención duplicada existe en CLAUDE.md raíz, actualizarla también).
    2. Actualizar el gate grep: quitar `follower_woke`, `lock_force_acquired_after_ttl_expiry` y `heartbeat_renewed` del regex `grep -oE "'(...)'" ... observability.ts | sort -u | wc -l` y cambiar "returns 14" → "returns 11". El regex resultante debe contener exactamente los 11 labels supervivientes: lock_acquired, lock_acquire_failed_follower, interrupt_written, interrupt_detected_at_ckpt_N, msg_aborted_path_a_combined, msg_aborted_path_b_solo, lock_released_normal, zombie_lambda_exit, pending_list_combined, redis_unavailable_fallback_failed, lock_orphan_swept_by_cron.
    3. Actualizar el bullet PUEDE: "typed emitter for 14 D-17-extended labels (LOCK-07 + REVISION B1 ...)" → "typed emitter for 11 labels (14 originales − 3 sin emisor removidos en D-16 somnio-v4-consolidation)".
    4. Actualizar la mención del consumidor sandbox debug-panel: "filtrado por los 14 lifecycle labels" → "11 lifecycle labels".
    5. EJECUTAR el gate actualizado para confirmar que retorna 11 (los gates de CLAUDE.md deben seguir siendo ejecutables y verdes — mandato D-11).
    6. Commit: `docs(somnio-v4-consolidation 04): actualiza gates de interruption-system-v2 a 11 labels (D-16)`.
  </action>
  <verify>
    <automated>bash -c "$(grep -oP '(?<=`)grep -oE.*wc -l(?=`)' .claude/rules/agent-scope.md | head -1)" 2>/dev/null || grep -c "returns 11" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "returns 11\|retorna 11" .claude/rules/agent-scope.md` ≥ 1
    - `grep -cE "follower_woke|lock_force_acquired_after_ttl_expiry|heartbeat_renewed" .claude/rules/agent-scope.md` = 0 dentro del regex del gate (puede quedar mención histórica en texto explicativo si referencia D-16)
    - Ejecutar el gate grep tal como queda escrito en el doc retorna 11
    - Cero menciones residuales de "14 lifecycle labels" / "14 D-17-extended" sin actualizar (`grep -n "14 D-17\|14 lifecycle" CLAUDE.md .claude/rules/agent-scope.md` = 0)
  </acceptance_criteria>
  <done>Gates documentales sincronizados con el código y ejecutables en verde.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Ninguna nueva | Reducción de union tipado + docs; primitives de lock (SET NX, Lua release, fencing) INTACTOS |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-05 | R (Repudiation) | pérdida de labels de auditoría | accept | Los 3 labels nunca emitieron (0 filas históricas verificadas en RESEARCH) — no se pierde trazabilidad real |
</threat_model>

<verification>
- `npx tsc --noEmit` + SUITE_CMD verdes; deltas de asserts SOLO en observability.test.ts y e2e-scenarios.test.ts (sancionados).
- Gate D-11: diff de este plan = {observability.ts, observability.test.ts, e2e-scenarios.test.ts, CLAUDE.md, .claude/rules/agent-scope.md} y nada más. lock.ts/pending.ts/checkpoints.ts/lua-scripts.ts INTACTOS.
- Suites interruption-system-v2: `npx vitest run src/lib/agents/interruption-system-v2` verde.
</verification>

<success_criteria>
- D-16 implementado: union de 11 labels, tests sancionados ajustados, gates documentales ejecutables y verdes con conteo 11.
- Primitives del módulo de lock sin un solo byte de cambio fuera de observability.ts.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/04-SUMMARY.md`.
</output>
