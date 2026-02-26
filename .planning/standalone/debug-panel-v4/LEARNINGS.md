# Standalone: Debug Panel v4.0 - Learnings

**Fecha:** 2026-02-26
**Duración:** ~45 min (5 plans across 3 waves)
**Plans ejecutados:** 5

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| FilteredTemplateEntry property access wrong | Plan specified `f.templateId` but actual type is `f.template.templateId` | Executor auto-fixed by reading the actual no-repetition-types.ts interface | Always read the actual type file before writing record calls that reference complex types |
| `.concat()` broke TypeScript literal type narrowing | `array.concat(otherArray)` widens `'pass' as const` to `string` | Used spread `[...a, ...b]` instead | Prefer spread over concat when arrays contain literal types |
| dp4-04 Pipeline tab import reverted by parallel dp4-05 | Both plans modified panel-container.tsx; dp4-05 read the file before dp4-04 committed | dp4-05 executor restored the PipelineTab import when wiring BloquesTab | When parallel plans modify the same file, the later-finishing plan must re-read the file state |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Debug data flows through SomnioAgentOutput | Separate debug channel, direct adapter calls from agent | Agent already returns output to engine; adding fields to output is the natural flow path. Engine then passes to adapter. |
| All DebugTurn fields optional (`?:`) | Required fields with defaults | Backward compatibility with saved localStorage sessions that have old DebugTurn objects |
| rulesChecked re-evaluates all 4 classifier rules | Store only the triggered rule | Full visibility in Classify tab: developer sees which rules were checked and which triggered |
| Template selection reconstructed from orchestrator result | Extend orchestrator to expose selection internals | Orchestrator doesn't expose TemplateManager details; reconstruction from result.intent + result.templates is sufficient |
| No-rep disabled records `{ enabled: false }` explicitly | Leave undefined when disabled | Frontend can distinguish "feature OFF" from "no data" (old session) |
| Timer controls → Config, timer display stays in Ingest | Move everything to Config, or keep everything in Ingest | Controls are config (set once), display is monitoring (watch during conversation). Different purposes. |
| Paraphrasing section DEFERRED | Build it with mock data | No recordParaphrasing() method or engine capture exists. Building UI without data pipeline is waste. |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| DebugPanelTabId (types.ts) | tab-bar.tsx, debug-tabs.tsx, panel-container.tsx | Removing 'intent' and adding 3 new IDs breaks 4 files simultaneously | Must update all 4 files in the same commit; TAB_ICONS Record<> catches missing keys at compile time |
| Parallel plans (dp4-04 + dp4-05) | panel-container.tsx | Both plans modify the same file; second plan can overwrite first plan's changes | Executor detected the issue and restored missing imports when wiring its own component |
| SomnioAgent early returns | Engine debug recording | SILENCIOSO/HANDOFF early returns skip the normal output path; debug data must be set BEFORE the return | Initialize debug tracking variables at processMessage start, populate at each gate, attach before every return statement |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Bottom-up execution order: types → adapters → agent output → engine instrumentation → frontend tabs
- Wave-based parallelism: Plans 02+03 (engine + tabs) ran in parallel without conflicts
- ARCHITECTURE.md as single source of truth: all 5 plans referenced it for pipeline structure
- Research phase mapped exact line numbers for insertion points — executors found them immediately

### Lo que NO hacer
- Don't add UI tabs before the data pipeline exists (types + adapters + agent output + engine recording)
- Don't use `.concat()` with literal-typed arrays in TypeScript — use spread
- Don't assume orchestrator exposes internal details — reconstruct from result when needed
- Don't modify the same file in truly-parallel plans without awareness of merge conflicts

### Patrones a seguir
- **Debug field pattern**: Optional field on output → if-guarded record call → undefined in adapter means "didn't execute"
- **Tab registration**: 4-file update (types.ts, debug-tabs.tsx, tab-bar.tsx, panel-container.tsx) — always together
- **Section-per-card**: Each debug section is a bordered card with icon heading + empty state message
- **Graceful undefined**: Every new tab section checks its debug field before rendering

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| DebugParaphrasing type + recordParaphrasing() + engine capture + Bloques tab section | Baja | Cuando se instrumente paraphrasing en el pipeline |
| pending_templates display in Estado tab | Baja | Cuando SandboxState incluya pending_templates field |
| intentsVistos is `{intent, orden, timestamp}[]` but Estado tab only shows `.intent` | Baja | Could show timestamp on hover |
| No turn navigation in Bloques tab (always shows latest) | Media | Could add turn chips like Pipeline tab |

## Notas para el Módulo

- El Debug Panel ahora tiene 8 tabs: Pipeline, Classify, Bloques (visible por defecto), Tools, Estado, Tokens, Ingest, Config (ocultos)
- Máximo 3 tabs visibles simultáneamente (drag-and-drop para reordenar/toggle)
- DebugTurn es el tipo central: 5 campos originales + 11 campos v4.0 — todos opcionales
- SandboxDebugAdapter tiene 15 record methods que acumulan datos y los expone via getDebugTurn()
- ProductionDebugAdapter tiene 15 no-op stubs (zero overhead en producción)
- El data flow completo: SomnioAgent → agentOutput → UnifiedEngine → debug.recordX() → SandboxDebugAdapter → DebugTurn → React tabs

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
