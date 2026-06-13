# Phase v4-observability-completeness - Learnings

**Fecha:** 2026-06-13
**Duración:** 1 sesión (research → plan → execute, mismo día)
**Plans ejecutados:** 4 (3 waves)

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| El motivo real del `V4_AGENT_ERROR` se perdía (agujero negro) | `v4-production-runner.ts:599` hardcodeaba `'V4 agent processing failed'` y descartaba `output.errorMessage` | `buildCleanErrorMessage(output)` → `V4_AGENT_ERROR @ {stage}: {motivo}` (stack stripped vía `split(' :: ')[0]`, PII-truncado) + evento `engine_error` con stack a la DB | Esta fase ES la prevención: el spine + `engine_error` dejan el error 100% reconstruible desde `agent_observability_events` |
| RESEARCH afirmó "crm-gate.ts totalmente mudo" — falso | El research leyó el orquestador `runCrmGate` pero no notó que `buildCrmHint` ya emitía 4 eventos (`:187/:195/:217/:260`) | El pattern-mapper verificó contra el código y corrigió: AUMENTAR (no asumir silencio ni duplicar labels) | Cuando RESEARCH afirma "X no emite nada", verificar con `grep getCollector\|recordEvent` ANTES de planear — un pattern-mapper independiente lo cazó |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Helper `recordV4Event` con try/catch global propio | Confiar solo en el no-throw interno de `recordEvent` | El `console.log` del payload puede tirar con refs circulares (Pitfall 6) → Regla 6 exige que observabilidad NUNCA tumbe un turno |
| Labels como string libre (nunca tocar `LockEventLabel`) | Extender el union tipado | El test `toHaveLength(11)` asserta el largo del union, NO el total de eventos emitidos → string libre = cero riesgo de paridad |
| Tipos centralizados en Plan 01 (wave 1) | Que 02 y 03 añadieran sus propios campos | Rompe el acoplamiento same-wave: 02 (`somnio-v4-agent.ts`) y 03 (`crm-gate.ts`+`sub-loop`) corren sin solape de archivos, ambos dependen solo de 01 |
| Fix del error limpio RUNNER-ONLY | Tocar también el sandbox `engine-v4.ts` | D-01 acota la superficie del chat al runner de prod (lo que ve el operador); paridad sandbox = follow-up deferido |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| `core/turn-orchestrator.ts` (compartido) | prod runner + sandbox engine | El threading de `restart_iteration` aparece en ambos lados | Deseable (paridad de observabilidad); inofensivo en sandbox que mockea `getCollector` a no-op |
| Plan 02 (call sites) | Plan 03 (receiving side) | 02 threadea `restartIteration` a las calls `runCrmGate`/`runSubLoop`; 03 las consume | Mismo wave, cero solape de archivos → seguro en secuencial |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Spawnear el **pattern-mapper** como verificación independiente del RESEARCH cazó una imprecisión material (crm-gate no mudo, `emitRagError` sin recordEvent) ANTES de planear.
- El RESEARCH con `file:line` + Code Examples verbatim hizo que los executors completaran desde el texto del plan casi sin descubrimiento.
- Spot-check de cada wave (SUMMARY existe + grep de labels + commits) antes de avanzar.

### Lo que NO hacer
- No asumir que un subsistema "no emite nada" solo porque RESEARCH lo dice — `grep getCollector` primero.
- No confiar en los smokes `smoke-rag-b` (live-LLM) como gate de regresión: son nondeterministas (`generated`↔`no_match`, timeouts 120s). El MISMO código pasó 47/47 en Plan 03 y falló 5 en el gate post-wave minutos después. Evaluar el goal con suites deterministas + inspección de source.
- No propagar `output.errorMessage` crudo al chat (es `errMsg :: errStack`) — el operador no quiere stack (Pitfall 5).

### Patrones a seguir
- Emisión dual no-throw: modelo `emitLockEvent` (`interruption-system-v2/observability.ts`) + try/catch global + prefijo greppable `[v4-spine]`.
- `restart_iteration` (snake_case) en el payload, consistente con los eventos de drain existentes.
- AUMENTAR eventos existentes (añadir campo `restart_iteration`) en vez de duplicar/renombrar labels.

### Comandos útiles
```bash
# Inventario de labels nuevos emitidos
grep -rho "recordV4Event('[a-z_]*'" src/lib/agents/somnio-v4/ | sort -u
# Gate de paridad determinista (excluye smokes live-LLM flaky)
npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/interruption-system-v2/__tests__/observability.test.ts
npx tsc --noEmit   # =0 predice deploy verde en Vercel
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| `crm_gate_completed.orderId` siempre `undefined` (extractCrmResult no deriva orderId del rawResult — limitación pre-existente del gate) | Baja | Cuando se necesite trazar el orderId creado por el gate |
| Paridad de "error limpio" en sandbox `engine-v4.ts` | Baja | Follow-up si el sandbox debug necesita el mismo mensaje limpio |
| **Fix de los bugs que esta observabilidad ahora ilumina**: sub-loop lento (~19s×2), handoff silencioso en `no_match`, zombie por turno de 70s, flip `generated`↔`no_match` | Media-Alta | Standalone(s) follow-up con causa raíz confirmada por esta instrumentación |
| Debug panel del sandbox para ver el trace v4 en vivo (D-04 deferido) | Media | Follow-up "v4-subloop-debug-view" extension |

## Notas para el Módulo

- El emisor canónico es `getCollector()?.recordEvent('pipeline_decision', label, payload, durationMs?)`. El nuevo helper `src/lib/agents/somnio-v4/observability.ts` (`recordV4Event`) lo envuelve con `restart_iteration` uniforme + try/catch global.
- Labels nuevos vivos: `engine_error`, `crm_gate_skipped`, `crm_gate_completed`, `subloop_tooling_completed`, `subloop_generation_completed`, `subloop_error` (+ `stage_entered`). Los pre-existentes (`crm_gate_createOrder_skipped`, `crm_gate_move_blocked`, `*_result`, `subloop_completed`) ahora llevan `restart_iteration`.
- Lectura/diagnóstico: scripts read-only existentes `scripts/_v4-drill-turn.mjs`, `_v4-recent.mjs`, `_v4-window.mjs`, `_v4-probe-events.mjs`.
- Regla 6 preservada: cero cambio de comportamiento del agente; el discriminador de drain (`errorMessage` `:: ` + `interrupted_at_ckpt_*`) intacto. v4 sigue DORMANT en prod.

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
