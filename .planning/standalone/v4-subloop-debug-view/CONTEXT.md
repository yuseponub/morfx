---
standalone: v4-subloop-debug-view
status: pre-research
created: 2026-05-13
parent: somnio-sales-v4-runtime-wiring (Plan 07 in iter)
discuss_skipped: true (D-01 — usuario lockeo 10 decisiones directamente)
---

# CONTEXT — v4-subloop-debug-view

## Problem

El inspector del sandbox para el agente `somnio-sales-v4` muestra info del comprehension (intent, intent_confidence, threshold, subLoopReason) pero el sub-loop es una caja negra cuando dispara. No se ven:

- Tool calls (sobre todo `kb_search` query / args)
- LoopOutcome final (status, responseTemplate, canonicalText, requiresHuman)
- KB hits con similarity scores
- Invariante violations (validateLoopOutcomeInvariants throw)
- Nunca-decir violations
- Retries / finishReason / stepCount
- Errores diagnósticos wrapped en sub-loop/index.ts (caf906a + 3e009d6)

Sin esta surface, iter 7-9 de Plan 07 Smoke A (calibration / templates / KB content) son ciegas — uno tiene que leer Vercel logs para entender por qué un mensaje cayó en handoff o por qué el sub-loop emitió template genérico vs canonical.

## Goal

Una pestaña nueva en el debug-panel del sandbox (`/sandbox`) llamada **Sub-Loop** que renderice:

- Banner top: reason badge + fired indicator + finishReason + latencyMs
- Si `fired=false`: mensaje "Sub-loop did not fire — confidence ≥ threshold"
- Timeline de steps con toolName + args + result colapsables
- Sección KB Hits: topic + similarity bar + hasNuncaDecir flag
- Sección Outcome: status badge + responseTemplate + canonicalText preview
- Banners rojos para invariantViolation / nuncaDecirViolation / errorMessage

## Decisions Locked by User (D-01 .. D-10)

| ID | Decision |
|---|---|
| **D-01** | Saltar /gsd-discuss-phase. Standalone name: `v4-subloop-debug-view`. Research → Plan → Execute. |
| **D-02** | Shape de datos: agregar campo opcional `subLoopDebug` a `V4AgentOutput` (src/lib/agents/somnio-v4/types.ts) y a `DebugTurn` (src/lib/sandbox/types.ts). Campos: `fired`, `reason`, `finishReason?`, `stepCount?`, `toolCalls[]`, `toolResults[]` (result truncado 500ch), `kbHits?[]`, `outcome?`, `invariantViolation?`, `nuncaDecirViolation?`, `latencyMs?`, `errorMessage?`. |
| **D-03** | Propagación: NO cambiar return type de `runSubLoop` (sigue `Promise<LoopOutcome>`). Aceptar arg opcional `onDebug?: (debug: SubLoopDebugPayload) => void` que `runSubLoop` invoca antes de retornar. El caller guarda en variable local y lo coloca en `V4AgentOutput.subLoopDebug`. |
| **D-04** | Tab nuevo en `src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx`. Replicar patrón de `classify-tab.tsx` / `transitions-tab.tsx` / `response-tab.tsx`. |
| **D-05** | Layout específico (ver Goal arriba). |
| **D-06** | Extracción de `kbHits`: parsear los `toolResults` donde `toolName==='kb_search'`. Formato del result: array de hits con `{ topic, similarity, content, nunca_decir }`. Si parse falla, no setear kbHits. |
| **D-07** | Persistencia: cero. Es runtime-only debug en sandbox. NO escribir a `agent_observability_turns`. El payload existe en memoria por turn y se renderiza vía respuesta de action. |
| **D-08** | LOCKED files (NO MODIFICAR): `sub-loop/output-schema.ts` (D-29 Plan 02), `sub-loop/prompt.ts`, `sub-loop/tools.ts` (Plan 05). MODIFICABLE: `sub-loop/index.ts` solo para agregar onDebug callback (diagnostic wraps existentes intactos), `engine-v4.ts`, `somnio-v4-agent.ts`, `types.ts`, `sandbox/types.ts`, debug panel components. |
| **D-09** | NO modificar godentist / recompra / pw-confirmation / v3 (Regla 6 CLAUDE.md). |
| **D-10** | TypeScript estricto, zero `any` salvo casts dirigidos con comment. Tailwind como el resto del panel. Sin emojis salvo si ya hay patrón. |

## Coordination Constraint

Otra Claude session está iterando `sub-loop/index.ts` (diagnostic wraps). Antes de pushear: `git pull origin main`. Si conflict en `sub-loop/index.ts` → mi cambio (estructural) prevalece, la otra session rebasea sus diagnostic fixes.

## Files in Scope

### Read-only context
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` — LoopOutcome shape
- `src/lib/agents/somnio-v4/sub-loop/tools.ts` — tool defs (kb_search shape)
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` — kb_search returns
- `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` — invariant
- `src/lib/agents/somnio-v4/escalation.ts` — `decideSubLoopReason`
- `src/lib/agents/somnio-v4/comprehension-prompt.ts` — comprehension prompt
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — ComprehensionOutput
- `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx` — pattern reference

### Will modify
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — add `onDebug` callback
- `src/lib/agents/somnio-v4/engine-v4.ts` — capture callback, propagate
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — propagate to V4AgentOutput
- `src/lib/agents/somnio-v4/types.ts` — add `subLoopDebug` field
- `src/lib/sandbox/types.ts` — mirror `subLoopDebug` in DebugTurn
- `src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` — NEW

### Locked / off-limits
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts`
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts`
- `src/lib/agents/somnio-v4/sub-loop/tools.ts`
- `src/lib/agents/somnio-v3/**`
- `src/lib/agents/somnio-recompra/**`
- `src/lib/agents/godentist/**`
- `src/lib/agents/godentist-fb-ig/**`
- `src/lib/agents/somnio-pw-confirmation/**`

## Testing Plan

- Dev local puerto 3020 con workspace Somnio sandbox `a3843b3f-c337-4836-92b5-89c58bb98490`.
- Mensaje que dispara sub-loop (intent_confidence ~0.30 post-fix `dbddb7d` para alcohol): `"puedo tomar alcohol?"` o `"puedo si tomo licor?"`.
- Mensaje que NO dispara sub-loop: `"hola"` (confidence 0.95).
- Verificar nuevo tab muestra: `kb_search` toolCalls, toolResults, finishReason, outcome final.

## Success Criteria

- [ ] Nueva tab "Sub-Loop" en debug panel renderiza correctamente
- [ ] `subLoopDebug` payload propagado desde runSubLoop → engine-v4 → agent → sandbox API → DebugTurn → panel
- [ ] Mensaje `"puedo tomar alcohol?"` muestra: fired=true, reason=low_confidence, kb_search tool call con args, kb hits con similarity, outcome status
- [ ] Mensaje `"hola"` muestra: fired=false con banner explicativo
- [ ] Zero TypeScript errors (`pnpm typecheck`)
- [ ] Zero lints (`pnpm lint`)
- [ ] V3 / godentist / recompra / pw-confirmation / godentist-fb-ig sin tocar (`git diff` vacío en esos paths)
- [ ] Sub-loop/output-schema.ts + sub-loop/prompt.ts + sub-loop/tools.ts sin tocar
- [ ] Commits atómicos por capa (types → core → wiring → UI → smoke)
- [ ] Push a main al final + LEARNINGS.md
