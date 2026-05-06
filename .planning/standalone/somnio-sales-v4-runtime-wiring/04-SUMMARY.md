---
phase: somnio-sales-v4-runtime-wiring
plan: 04
subsystem: somnio-v4 webhook runtime
tags: [v4-runtime-wiring, webhook-processor, dynamic-import, cold-lambda-race-mitigation, agent-id-union, b-001]
wave: 3
depends_on: [01, 03]
status: complete
date_completed: 2026-05-06
duration_estimate: ~30min
addresses_decisions: [D-1, D-13, D-15]
addresses_research_pitfalls: [Pitfall 2 / B-001 cold-lambda race]
requires:
  - Plan 01 shipped (V4ProductionRunner export desde @/lib/agents/engine + agentModule union extendido en types.ts)
  - Plan 03 shipped (engine-v4 sandbox wrapper — referencia para pattern symmetry, no dependencia hard)
  - Pre-warm `import('../somnio-v4')` en Promise.all del padre Plan 12 (línea 231) — verificado intacto
provides:
  - "Branch productivo `agentId === 'somnio-sales-v4'` en webhook-processor.ts:819 (additive)"
  - "Routing webhook → V4ProductionRunner.processMessage cuando router emita agent_id='somnio-sales-v4'"
  - "AgentId union extendido en src/lib/observability/types.ts con 'somnio-sales-v4'"
affects:
  - src/lib/agents/production/webhook-processor.ts (+35 lines additive — branch v4 entre godentist-fb-ig y else V1)
  - src/lib/observability/types.ts (+1 line — Rule 3 blocking fix: AgentId union extension)
tech-stack:
  added: []
  patterns:
    - "Dynamic import doble (anti cold-lambda race): pre-warm en Promise.all top + await import dentro del branch — consistente con godentist-fb-ig precedent (CLAUDE.md scope)"
    - "Set-before-run (D-10/D-12): setRespondingAgentId('somnio-sales-v4') ANTES de processMessage — captura responder aunque processMessage falle/throw"
    - "Single-route branch additive (Regla 6): inserción quirúrgica entre godentist-fb-ig y else V1 default; cero edits a branches v3/godentist/recompra/pw-confirmation/V1"
key-files:
  created:
    - .planning/standalone/somnio-sales-v4-runtime-wiring/04-SUMMARY.md
  modified:
    - src/lib/agents/production/webhook-processor.ts (+35 lines, 0 deletions — pure-additive)
    - src/lib/observability/types.ts (+1 line — AgentId union extension)
decisions:
  - D-1 honored: V4 path completamente separado de V3 — usa V4ProductionRunner (no V3); cero shared logic con godentist-fb-ig branch (que sigue usando V3ProductionRunner con agentModule='godentist-fb-ig')
  - D-13 honored: branch clonado mecánico de v3 branch (líneas 740-765) con substituciones literales — V3 → V4, somnio-sales-v3 → somnio-sales-v4, somnio-v3 → somnio-sales-v4 (collector ID matches agent_id literal del registry), 'V3 agent processing complete' → 'V4 agent processing complete'. Diferencia stylistic única: pasamos `agentModule: 'somnio-v4'` explícito por simetría con godentist (línea 770) y godentist-fb-ig (línea 798) — el v3 branch no lo pasa porque V3ProductionRunner default = 'somnio-v3'
  - D-15 honored: rate-limit bucket aislado vive en routes/middleware (fuera del runner). Webhook-processor no referencia rate-limit hardcoded. Cuando se active el flip (Plan 08), v4 usa el bucket 'somnio-v4' que está configurado en el rate-limit middleware
  - Regla 6 honored: cero edits a v3 / godentist / godentist-fb-ig / recompra / pw-confirmation branches; cero edits al else V1 default; pre-warm Promise.all intacto con su `import('../somnio-v4')` de Plan 12 padre
  - Pitfall 2 / B-001 mitigated: dynamic import dentro del branch + pre-warm Promise.all top forman double-guard. Si lambda cold-starts y llega webhook v4, agentRegistry.register(somnioV4Config) (side-effect de import('../somnio-v4')) está garantizado hidratado antes de `new V4ProductionRunner(...)` se ejecute
metrics:
  commits: 2 (Task 1 = deedbcd, SUMMARY = pending)
  lines_added: 35 (webhook-processor.ts) + 1 (observability/types.ts) = 36
  lines_deleted: 0 (pure-additive)
  files_created: 1 (04-SUMMARY.md)
  files_modified: 2 (webhook-processor.ts, observability/types.ts)
  tsc_clean: true (0 errores en webhook-processor.ts touched files; 2 baselines pre-existentes en domain/__tests__/conversations.test.ts NO relacionados)
  observability_tests_passing: 11/11 (collector.responding.test.ts + flush.responding.test.ts — anti-regresion del AgentId union extension)
---

# Phase somnio-sales-v4-runtime-wiring Plan 04: webhook-processor branch agentId=somnio-sales-v4 — Summary

Wave 3 webhook wiring completo: branch productivo `else if (agentId === 'somnio-sales-v4')` insertado de manera additive entre el cierre del bloque godentist-fb-ig (línea 818) y el `else { /* V1 path */ }` (línea 854). Branch DORMIDO post-deploy — Plan 08 SQL flip activa la regla en `routing_rules` que enruta tráfico Somnio a `somnio-sales-v4` (cero tráfico hoy = cero impacto a prod).

## Insertion location

| Bloque | Líneas (post-edit) |
|---|---|
| `if (agentId === 'somnio-sales-v3')` | 740-765 (intocado) |
| `} else if (agentId === 'godentist')` | 766-791 (intocado) |
| `} else if (agentId === 'godentist-fb-ig')` | 792-818 (intocado) |
| **`} else if (agentId === 'somnio-sales-v4')`** | **819-853 ← NUEVO** |
| `} else { // V1 path — unchanged (default)` | 854-870 (intocado) |

Branch insertion = 35 líneas additivas:
- 12 líneas de comments / JSDoc (rationale + anti Pitfall 2 + dynamic-only contract)
- 3 líneas dynamic imports + runner instantiation
- 2 líneas setRespondingAgentId (set-before-run D-10/D-12)
- 11 líneas runner.processMessage(...) call con input shape paritario v3/godentist/godentist-fb-ig
- 7 líneas getCollector().recordEvent + logger.info close

## Diff snippet (before / after)

**Before (líneas 818-823):**
```typescript
      logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
    } else {
      // V1 path — unchanged (default)
      await import('../somnio')
      const { UnifiedEngine } = await import('../engine/unified-engine')
      const engine = new UnifiedEngine(adapters, { workspaceId })
```

**After (líneas 818-858):**
```typescript
      logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
    } else if (agentId === 'somnio-sales-v4') {
      // Standalone: somnio-sales-v4-runtime-wiring (Plan 04, D-1, D-13, D-15)
      // V4 path — uses V4ProductionRunner clonado de V3 (D-13).
      // Anti-Pitfall 2 / B-001 cold-lambda race: double pre-warm
      //   (1) Promise.all top (línea ~231) ya importa '../somnio-v4'.
      //   (2) await import('../somnio-v4') aquí dentro del branch garantiza
      //       que agentRegistry.register(somnioV4Config) (side-effect de
      //       src/lib/agents/somnio-v4/index.ts) esté hidratado antes de
      //       instanciar el runner. DYNAMIC IMPORT ONLY — consistente con
      //       godentist-fb-ig precedent. NO static `import { V4ProductionRunner }
      //       from '../engine/v4-production-runner'` al top-level del archivo.
      await import('../somnio-v4')
      const { V4ProductionRunner } = await import('../engine/v4-production-runner')
      const runner = new V4ProductionRunner(adapters, { workspaceId, agentModule: 'somnio-v4' })

      // D-10, D-12: capture responder BEFORE processMessage (set-before-run).
      getCollector()?.setRespondingAgentId('somnio-sales-v4')

      engineOutput = await runner.processMessage({
        sessionId: '',
        conversationId,
        contactId: contactId!,
        message: messageContent,
        workspaceId,
        history: [],
        phoneNumber: phone,
        messageTimestamp: input.messageTimestamp,
      })

      getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
        agentId,
        conversationId,
        contactId,
      })
      logger.info({ conversationId, agentId }, 'V4 agent processing complete')
    } else {
      // V1 path — unchanged (default)
      await import('../somnio')
      const { UnifiedEngine } = await import('../engine/unified-engine')
      const engine = new UnifiedEngine(adapters, { workspaceId })
```

## Pre-warm verification (Pitfall 2 / B-001 mitigation)

El bloque `Promise.all` cold-start del padre (línea 225-233) ya tenía `import('../somnio-v4')` desde Plan 12 standalone padre. Plan 04 verifica intacto y añade el segundo guard del double-pre-warm pattern:

```bash
$ awk '/await Promise.all\(\[/,/\]\)/' src/lib/agents/production/webhook-processor.ts | grep "import('../somnio-v4')"
      import('../somnio-v4'), // Standalone: somnio-sales-v4 (D-13, D-16 — sin preload branch)
```

Cero edits al bloque pre-warm — verificado por `git diff`. El nuevo `await import('../somnio-v4')` dentro del branch (línea 830) es el segundo guard, ejecutado ANTES de `new V4ProductionRunner(...)`.

**Razón del double-pre-warm (CLAUDE.md godentist-fb-ig scope, Pitfall 2):** En Vercel cold lambdas, los lazy imports en branches solo se cargan cuando el branch ejecuta. Si el routing-engine valida `agent_id='somnio-sales-v4'` ANTES de que el módulo `somnio-v4` esté hidratado en agentRegistry, falla con `unregistered agent_id` → fallback_legacy. Pre-warm en Promise.all top resuelve esto antes del routing. Dynamic import dentro del branch es consistencia stylistic + defensa-en-profundidad si Promise.all algún día cambia.

## D-10/D-12 set-before-run evidence

`setRespondingAgentId('somnio-sales-v4')` se llama en línea 835, **antes** de `await runner.processMessage(...)` en línea 837. Si el runner throws (network error, schema rejection, etc.), el observability collector ya tiene marcado el responder como `'somnio-sales-v4'` — NO se queda en `null` ni en el agent_id anterior del request. Mismo pattern que v3 (línea 747), godentist (línea 773), godentist-fb-ig (línea 800).

## Branch dormido post-deploy (D-1, Regla 6)

Razones por las que este Plan es deployable hoy SIN feature flag:

1. **Sin routing rule activa apuntando a `somnio-sales-v4`:** la regla la crea Plan 08 SQL flip. Hoy `routerDecidedAgentId` nunca = `'somnio-sales-v4'` para tráfico Somnio (la regla activa apunta a `somnio-sales-v3` o V1 default).
2. **agentRegistry.register(somnioV4Config) ya está activo desde Plan 12 padre** — el dropdown del routing-editor lista v4 como opción pero no hay regla creada por el operador.
3. **Resultado:** branch inerte hasta el momento del flip. Cero impacto a prod. Regla 6 satisfecha sin necesidad de feature flag (mismo patrón que `somnio-sales-v3-pw-confirmation` shipped 2026-04-28 con activación diferida).
4. **Reversibilidad:** si Plan 08 falla, rollback = `UPDATE routing_rules SET active=false WHERE name='Somnio v4 routing (post-flip)'` (CONTEXT.md SQL pre-formado).

## Verification gates (todos PASS — 10/10)

| # | Gate | Resultado |
|---|---|---|
| 1 | `grep -q "agentId === 'somnio-sales-v4'" webhook-processor.ts` | PASS |
| 2 | `grep -q "import('../somnio-v4')" webhook-processor.ts` (dynamic in branch + pre-warm) | PASS |
| 3 | `grep -q "import('../engine/v4-production-runner')" webhook-processor.ts` (dynamic) | PASS |
| 4 | NO static `import { V4ProductionRunner } from '...'` (count = 0) | PASS |
| 5 | `grep -q "setRespondingAgentId('somnio-sales-v4')" webhook-processor.ts` | PASS |
| 6 | `grep -q "V4 agent processing complete" webhook-processor.ts` | PASS |
| 7 | Pure-additive diff (deletions = 0) | PASS |
| 8 | Cero edits a otras branches (somnio-sales-v3 / godentist / godentist-fb-ig / V1) | PASS |
| 9 | `npx tsc --noEmit` errors en webhook-processor.ts | PASS (0 errores) |
| 10 | Pre-warm `import('../somnio-v4')` en Promise.all intacto | PASS (1 match preserved) |

Branch order verificado:

```
740: if (agentId === 'somnio-sales-v3')
766: } else if (agentId === 'godentist')
792: } else if (agentId === 'godentist-fb-ig')
819: } else if (agentId === 'somnio-sales-v4')   ← NUEVO
854: } else { // V1 path
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extender `AgentId` union en `src/lib/observability/types.ts` para incluir `'somnio-sales-v4'`**

- **Found during:** Task 1 — al ejecutar `npx tsc --noEmit` post-edit, TS2345 error: `Argument of type '"somnio-sales-v4"' is not assignable to parameter of type 'AgentId'`. La línea ofensora: `getCollector()?.setRespondingAgentId('somnio-sales-v4')` (línea 835).
- **Issue:** El tipo `AgentId` (definido en `src/lib/observability/types.ts:33`) es un union literal cerrado: `'somnio-v3' | 'godentist' | 'godentist-fb-ig' | 'somnio-recompra' | 'somnio-recompra-v1' | 'somnio-v2' | 'crm-reader' | 'crm-writer'`. Sin extender, `setRespondingAgentId('somnio-sales-v4')` no compila → bloqueante para Task 1 declare done.
- **Fix:** Añadir `'somnio-sales-v4'` al union — cambio aditivo de 1 valor literal type. Comentario inline: `// Standalone: somnio-sales-v4-runtime-wiring (Plan 04, D-1)`.
- **Files modified:** `src/lib/observability/types.ts` (+1 línea).
- **Commit:** `deedbcd` (incluido en mismo commit Task 1).
- **Impact assessment:** Cambio aditivo — `'somnio-sales-v4'` solo se emite desde el nuevo branch v4 del webhook-processor. Cero impacto a:
  - Otros branches (v3, godentist, godentist-fb-ig, recompra, pw-confirmation, V1) que siguen pasando los literales existentes del union.
  - `collector.ts:setRespondingAgentId` que acepta el parameter como `AgentId` — el union extendido sigue siendo asignable.
  - `agent_observability_events.responding_agent_id` (DB column TEXT) que acepta cualquier string — el union es solo type-level.
  - 11/11 observability tests verdes post-fix (`collector.responding.test.ts` + `flush.responding.test.ts`) — cero regresiones.
- **Rationale:** Plan listed `files_modified` solo `webhook-processor.ts`. La extensión de `observability/types.ts` no estaba en la lista pero es **bloqueante** para que el branch v4 compile. Aplicar Rule 3 es correcto — sin esto el plan no puede declarar Task 1 done. **NO viola Regla 6** (cero impacto a v3/godentist/recompra/pw-confirmation/V1 — todos siguen funcionando con los literales existentes del union extendido).
- **Sibling precedent:** Plan 01 SUMMARY ya documentó la misma operación para `EngineConfig.agentModule` union (línea 158 de `src/lib/agents/engine/types.ts`) — patrón establecido en este standalone para extensiones aditivas de unions cuando un nuevo agente se inserta runtime.

### Auth gates

Ninguno. Plan 04 es 100% código + types — no toca secretos ni env vars. Las env vars (GOOGLE_GENERATIVE_AI_API_KEY + OPENAI_API_KEY_SALESV4) ya quedaron confirmadas en Plan 01 Task 2.

## Threat Flags

Ninguno. Cero nueva surface de seguridad:
- Branch v4 reusa el mismo path de routing decision (`routerDecidedAgentId`) que las branches v3/godentist/godentist-fb-ig/recompra/pw-confirmation — la auth y workspace isolation están en `routeAgent(...)` upstream.
- `V4ProductionRunner` usa los mismos adapters (Storage, Timer, Messaging, Orders, Debug) que `V3ProductionRunner` que ya pasaron threat-model en standalone padre.
- AgentId union extension es solo type-level — cero runtime side-effects.
- Cero nuevos endpoints, cero nuevas auth paths, cero nuevos schema changes en DB.

## Known Stubs

Ninguno hard. El branch está completo y compila. La activación productiva (atomic flip de routing_rules) es Plan 08 — eso es deuda planificada, no stub. Hasta entonces, el branch está dormido por diseño (D-1, Regla 6).

## Próximo paso

**Plan 05 / Wave 3 (paralelo a este Plan 04):** modelo swap Haiku → (Gemini 2.5 Flash-Lite + GPT-4o mini) en los 3 calls activos de v4 (`comprehension.ts:84`, `sub-loop/index.ts:54`, `sub-loop/nunca-decir-check.ts:34`). Después del Plan 05 viene Wave 4 (Plan 06 NoRepetitionFilter rewire) y Wave 5 (Plan 07 smoke wave A sandbox + Plan 08 atomic flip prod, absorbe Plan 13 padre).

## Self-Check

**Status: PASSED**

Verificaciones ejecutadas post-write:

| # | Check | Resultado |
|---|---|---|
| 1 | Files created — 04-SUMMARY.md | FOUND (este archivo) |
| 2 | Commits exist — deedbcd (Task 1) | FOUND via `git log --oneline -3` |
| 3 | Gate 1: branch v4 present | PASS |
| 4 | Gate 2: dynamic import('../somnio-v4') | PASS |
| 5 | Gate 3: dynamic import('../engine/v4-production-runner') | PASS |
| 6 | Gate 4: NO static import V4ProductionRunner from ... (count=0) | PASS |
| 7 | Gate 5: setRespondingAgentId('somnio-sales-v4') | PASS |
| 8 | Gate 6: 'V4 agent processing complete' logger | PASS |
| 9 | Gate 7: pure-additive diff (deletions=0) | PASS |
| 10 | Gate 8: cero edits a otras branches | PASS |
| 11 | Gate 9: tsc --noEmit clean en webhook-processor.ts | PASS (0 errores) |
| 12 | Gate 10: pre-warm import('../somnio-v4') en Promise.all intacto | PASS |
| 13 | Branch order: somnio-sales-v3 → godentist → godentist-fb-ig → somnio-sales-v4 → else V1 | PASS |
| 14 | Regla 6: git diff vacío en branches v3/godentist/godentist-fb-ig/recompra/pw-confirmation/V1 | PASS |
| 15 | Observability tests post-AgentId-extension: 11/11 | PASS |
