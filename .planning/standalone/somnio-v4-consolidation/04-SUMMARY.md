---
phase: somnio-v4-consolidation
plan: 04
subsystem: interruption-system-v2
tags: [D-16, dead-code-cleanup, observability, lock-labels, carve-out-sancionado, wave-1]
requires:
  - "BASELINE.md SUITE_CMD (Plan 01, gate D-09)"
provides:
  - "union LockEventLabel honesto de 11 labels (3 fantasma sin emisor removidos)"
  - "gates de CLAUDE.md/agent-scope.md §interruption-system-v2 sincronizados a 11 labels y ejecutables verdes"
affects: [planes W2 de somnio-v4-consolidation que consumen el módulo de lock]
tech-stack:
  added: []
  patterns: [carve-out-sancionado-D09, gate-grep-ejecutable-verde]
key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/04-SUMMARY.md
  modified:
    - src/lib/agents/interruption-system-v2/observability.ts
    - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts
    - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts
    - .claude/rules/agent-scope.md
decisions:
  - "D-16: union LockEventLabel 14→11 — removidos follower_woke, lock_force_acquired_after_ttl_expiry, heartbeat_renewed (CERO emisores en código no-test, pre-check verificado)"
  - "CLAUDE.md raíz NO tenía sección de labels — todas las menciones del conteo viven en .claude/rules/agent-scope.md §Module Scope: interruption-system-v2 (verificado por grep)"
  - "Carve-out D-09: asserts modificados SOLO en observability.test.ts (lista exhaustiva 14→11) y e2e-scenarios.test.ts (removido emit+assert del label TTL en S3) — sancionados por D-16"
  - "Nota histórica 'REVISION B1 — 14th label' conservada en agent-scope.md (referencia D-16 permitida por AC2; no matchea el grep prohibido de '14 lifecycle/14 D-17')"
metrics:
  duration: "~20 min"
  completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 04: D-16 Union LockEventLabel 14→11 Summary

**One-liner:** El union tipado `LockEventLabel` deja de mentir — pasa de 14 a 11 labels eliminando los 3 fantasma con CERO emisores (`follower_woke`, `lock_force_acquired_after_ttl_expiry`, `heartbeat_renewed`), con carve-out de tests sancionado por D-16 y los gates documentales de interruption-system-v2 sincronizados, ejecutables y verdes en 11.

## Lo que se hizo

### Task 1 (commit `49b6c882`) — Reducir union 14→11 + carve-out tests sancionado
1. **Pre-check de seguridad (gate D-16):** `grep` de emisores reales en código no-test (excluyendo `__tests__` e `interruption-tab`) retornó SOLO las 3 líneas de definición del union en `observability.ts` — cero `emitLockEvent('<label>')` para los 3 labels. Confirmado que D-16 aplica (labels sin NINGÚN emisor).
2. **`observability.ts`:** removidas las 3 líneas del union + sus docblocks. Docstrings "14" → "11" con nota D-16 explicativa (re-agregar es barato).
3. **`observability.test.ts` (carve-out sancionado):** lista exhaustiva `ALL_LABELS` 14→11, `describe` "typed 14-label emitter" → "typed 11-label emitter", asserts `toHaveLength(14)`/`.size).toBe(14)` → 11, test name "routes all 14" → "routes all 11". El test no-collector usaba `emitLockEvent('heartbeat_renewed', ...)` (label removido → typecheck roto) → reemplazado por `'lock_released_normal'` (label superviviente, mismo objetivo de no-throw sin collector).
4. **`e2e-scenarios.test.ts` (carve-out sancionado):** en el escenario S3 (TTL expiry / zombie lambda) se removió el `emitLockEvent('lock_force_acquired_after_ttl_expiry', ...)` (líneas 239-242) y su `expect(labels).toContain(...)` (271). El comportamiento que S3 prueba (force-acquire tras TTL expiry) ya queda verificado por `h2 !== null` (SET NX sucede) + `h2.holderUuid !== h1.holderUuid`. Assert de event-count `>= 5` → `>= 4` (se removió un emit sintético legítimamente). Header del archivo "14 labels post REVISION B1" → "11 labels post D-16".

### Task 2 (commit `2289f815`) — Sincronizar gates documentales a 11
1. **Localización:** `grep` confirmó que el CLAUDE.md raíz NO tiene sección de labels — las 4 menciones del conteo viven en `.claude/rules/agent-scope.md` §"Module Scope: interruption-system-v2".
2. **Bullet PUEDE (`emitLockEvent`):** "typed emitter for 14 D-17-extended labels" → "typed emitter for 11 labels (14 originales − 3 sin emisor removidos en D-16 ...)".
3. **Gate grep enforceable:** removidos `follower_woke`, `lock_force_acquired_after_ttl_expiry`, `heartbeat_renewed` del regex; "returns 14" → "returns 11". **El gate se ejecutó tal como queda escrito en el doc → retorna 11** (mandato D-11: los gates deben seguir siendo ejecutables y verdes).
4. **Consumidor sandbox debug-panel:** "filtrado por los 14 lifecycle labels" → "11 lifecycle labels".
5. **Nota histórica conservada:** "REVISION B1 — 14th label" (describe cuándo `lock_orphan_swept_by_cron` se agregó como el 14º) — referencia histórica precisa, no matchea el grep prohibido de "14 D-17"/"14 lifecycle".

## Verificación

| Gate | Resultado |
|---|---|
| Pre-check D-16 (cero emisores no-test) | ✓ solo definición del union |
| `npx tsc --noEmit` | ✓ exit 0 |
| Union surviving labels count | ✓ 11 |
| Ghost labels en observability.ts | ✓ 0 |
| `11-label` en observability.test.ts | ✓ ≥1 |
| Suite interruption-system-v2 | ✓ 6 files, 48/48 passed |
| SUITE_CMD canónico (D-09) | ✓ 348 passed \| 7 skipped \| 0 failed (idéntico a baseline Plan 01) |
| Gate grep de agent-scope.md ejecutado as-written | ✓ retorna 11 |
| `returns 11` en agent-scope.md | ✓ ≥1 |
| Residual "14 D-17"/"14 lifecycle" | ✓ 0 |
| Gate D-11: diff = {observability.ts, 2 tests, agent-scope.md} | ✓ exacto |
| Lock primitives (lock/pending/checkpoints/lua) intactos | ✓ cero diff |
| interruption-tab.tsx / restart-loop.test.ts / engine-v4-lock.test.ts NO tocados | ✓ |

## must_haves (truths del plan)

- ✓ El union `LockEventLabel` tiene exactamente 11 labels — los 3 fantasma fuera.
- ✓ Los gates grep de §interruption-system-v2 reflejan 11 labels y siguen siendo ejecutables y verdes (gate as-written → 11).
- ✓ Los únicos asserts modificados son los sancionados por D-16 (observability.test.ts lista exhaustiva + e2e-scenarios.test.ts simulación TTL) — carve-out explícito de D-09.
- ✓ interruption-tab.tsx NO fue tocado (fuera de scope D-11 — usa array local).

## Deviations from Plan

### Auto-fixed Issues

Ninguno. El plan se ejecutó exactamente como fue escrito.

### Nota de scope (no es desviación)

`files_modified` del frontmatter del plan incluía `CLAUDE.md`. La Task 2 verificó por grep que el CLAUDE.md raíz NO tiene sección de labels — todas las menciones del conteo viven en `.claude/rules/agent-scope.md` (el plan Task 2 `<read_first>` ya anticipaba esto: "NO existe sección de labels en el CLAUDE.md raíz — verificar"). Por tanto el diff final no incluye `CLAUDE.md`, lo cual es el resultado correcto y esperado.

## Commits

| Commit | Tipo | Descripción |
|---|---|---|
| `49b6c882` | refactor | D-16 union LockEventLabel 14→11 — borra 3 labels sin emisor (carve-out tests sancionado) |
| `2289f815` | docs | actualiza gates de interruption-system-v2 a 11 labels (D-16) |

## Self-Check: PASSED
