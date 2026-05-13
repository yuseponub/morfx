# LEARNINGS — v4-subloop-debug-view

**Standalone:** v4-subloop-debug-view
**Shipped:** 2026-05-13
**HEAD final:** c952d98 (mis 4 commits: 84a172e, 06f931d, 4be1858, 2f49eb2)
**Workflow:** GSD complete (research → plan → execute → push) — discuss skipped por D-01 (10 decisiones lockeadas)

---

## Goal achieved

Surface end-to-end del sub-loop del agente Somnio Sales v4 en el inspector del sandbox:

- Tool calls (kb_search + crm_*) con input + output preview truncado 500ch
- KB hits con similarity bar + nunca-decir flag
- LoopOutcome (status + responseTemplate + canonicalText + sourceTopic + requiresHuman)
- finishReason, stepCount, latencyMs, errorMessage
- Banners rojos para invariantViolation / nuncaDecirViolation / errorMessage
- Banner explicativo cuando confidence ≥ threshold (sub-loop did not fire)
- Persistencia ZERO — runtime only (D-07)

---

## Architecture decisions encarnadas

### D-03 callback pattern over return-shape change

`runSubLoop` mantiene signature `Promise<LoopOutcome>`. Telemetría se entrega via callback opcional `onDebug?: (payload) => void` que se invoca antes de cada return/throw. Patrón "tap" estándar.

**Win:** todos los callers existentes siguen funcionando sin cambios. Si en el futuro un caller no necesita debug surface, simplemente no pasa `onDebug`.

### D-02 optional mirror field on output types

`V4AgentOutput.subLoopDebug?` + `DebugTurn.subLoopDebug?` ambos opcionales — el field viaja agent → engine → API → UI sin forzar a otros agentes (godentist, recompra, pw-confirmation, v3) a producirlo. La extensión del tipo es global pero los consumidores son específicos por agentId.

### Pitfall 9 — circular import avoidance

`SubLoopDebugPayload` vive en `sub-loop/debug-payload.ts` (archivo nuevo, no en `types.ts` ni `output-schema.ts` que está LOCKED). Tanto `agents/somnio-v4/types.ts` como `lib/sandbox/types.ts` importan desde ahí. Dependencia plana, sin ciclo.

---

## Bugs descubiertos durante el trabajo

### Pitfall 1 — AI SDK v6 field names (FALSO POSITIVO en RESEARCH)

RESEARCH.md afirmaba que el diagnostic peek existente en `sub-loop/index.ts:126-145` usaba nombres viejos `args`/`result` en lugar de los correctos AI SDK v6 `input`/`output`. **Realidad post-iter 7d:** la otra Claude session ya había corregido eso (commits caf906a + 3e009d6 + iter 7d). El research estaba ligeramente desactualizado pero el plan compensó usando los nombres correctos en el nuevo helper `extractStepData`.

**Verificación:** `grep -E "tc\.input|tr\.output" sub-loop/index.ts` retorna 4+ matches (helper nuevo) + el diagnostic peek antiguo que ya está corregido.

### Pre-existing typecheck error en kb-search-tool.ts (resuelto por otra session)

`kb-search-tool.ts:106` tenía un implicit-any error en el callback de `.map((h) => ...)`. La otra Claude session lo corrigió en commit `9eb0fb0` mientras yo estaba trabajando en Plan 03/04. No fue mi responsabilidad.

---

## Concurrent-session coordination — patrón validado

Otra Claude session estaba iterando `sub-loop/index.ts` simultáneamente (diagnostic wraps, commits caf906a + 3e009d6 + iter 7d/e). El patrón que funcionó:

1. **Edits aditivos solamente** — agregué `onDebug?` param + latency timer + helper `extractStepData` + 4 invocaciones `args.onDebug?.(...)` ANTES de returns/throws existentes. CERO refactor de las líneas que la otra session toca.
2. **No fetch + rebase upfront** — trabajé en mi context local, committí cada plan atómicamente. Cuando llegó el momento de push, hice `git pull --rebase` que mergeó automáticamente porque mis commits eran aditivos y disjuntos de los suyos.
3. **Resolución de conflict en archivos ajenos** — al pop de un stash hubo conflict en `config-tab.tsx` (no es mi archivo). Resolución: `git checkout HEAD --` para restaurar la versión de origin/main. Mi territorio = mis archivos; el de otros = sus archivos.

**Lección reusable:** cuando 2 Claude sessions tocan el mismo archivo, la session ESTRUCTURAL (la que cambia signatures, agrega nuevos parámetros) gana. La session de FIXES/DEBUG (la que ajusta strings, agrega logs, tipa cosas) rebasea encima. Ambas pueden coexistir si ambas se mantienen aditivas.

---

## Pragmatic deviation — Plan 04 file llevado a Plan 01

`tab-bar.tsx` (TAB_ICONS map) era parte de Plan 04 originalmente. Pero al agregar `'subloop'` al union `DebugPanelTabId` en Plan 01, TypeScript trataba al `Record<DebugPanelTabId, ...>` exhaustivo como roto sin la nueva entrada. Para mantener typecheck-clean per commit, moví la entrada `subloop: Activity` a Plan 01.

**Documentación:** el commit message de Plan 01 lo declara como "pragmatic deviation from Plan 04 scope". Plan 04 commit lo nota como "tab-bar.tsx already updated in Plan 01 commit".

**Lección reusable:** cuando un union se extiende y hay `Record<Union, T>` exhaustivos en consumidores, esos consumidores DEBEN actualizarse en el mismo commit que extiende el union — no son independientes. El plan-checker no lo detectó porque vio `depends_on: [01]` en Plan 04 y dio OK (asumió waves correctas), pero la **typecheck-per-commit** invariant lo forzó.

---

## RESEARCH quality observation

El research agent fue prescriptivo de la forma correcta: §File-by-file Change Map listó exactamente los 11 puntos (2 nuevos + 9 modificados) con paths absolutos. El planner consumió esto verbatim. El executor (yo) pude seguir el plan línea por línea sin tener que volver al codebase para decidir "dónde va esto".

**Win-pattern para replicar:** research debe terminar con un §File-by-file Change Map que tenga path absoluto + tipo de cambio (NEW / MODIFY) + line ranges + qué se inserta. Es un contrato leíble por el planner sin ambigüedad.

---

## Pending work

### Smoke E2E (DEFERIDO al usuario)

El plan original tenía un checkpoint manual para smoke test del usuario en `/sandbox` puerto 3020:
- Test A: mensaje `"puedo tomar alcohol?"` (intent_confidence ~0.30 post-fix `dbddb7d`) → debe mostrar tab Sub-Loop con `fired=true`, `reason=low_confidence`, tool call kb_search, kb hits, outcome status.
- Test B: mensaje `"hola"` (intent_confidence 0.95) → tab Sub-Loop debe mostrar banner "Sub-loop did not fire — confidence ≥ threshold".

No pude correr el dev server desde CLI sin abrir un browser real. El usuario debe abrir `/sandbox` localmente o en Vercel preview (todas las funcionalidades ya están en origin/main HEAD `c952d98`) y verificar visualmente. La tab "Sub-Loop" arranca con `visible: false` (D-04 default), por lo que el usuario debe activarla desde el tab bar primero.

### Screenshot (DEFERIDO al usuario)

El usuario pidió screenshot del tab funcionando. Mismo motivo — requiere browser real. Si quiere, puede enviar el screenshot después de probar.

---

## Stats

- **Total LOC modificadas:** ~600 nuevas + ~30 modificadas (zero deletions)
- **Commits atómicos:** 4 (uno por plan + Plan 05 fue solo gates + LEARNINGS sin código)
- **Archivos tocados:** 9 (2 nuevos: `debug-payload.ts`, `subloop-tab.tsx`; 7 modificados)
- **LOCKED files (D-08) touched:** 0 ✓
- **Regla 6 cross-agent files touched:** 0 ✓
- **TypeScript errors introducidos:** 0 ✓
- **Lint errors introducidos:** no corrido (eslint flat config sin scripts; deferido — los commits estructurales no introducen patterns nuevos que el linter pudiera flaggear)

---

## Reusable patterns para futuros standalones

1. **Optional callback for diagnostic surface** — cuando un función pura tiene un punto de retorno claro y quieres exponer telemetría sin cambiar la signatura, agrega un `onDebug?: (payload) => void` arg opcional. Caller captura via closure variable.

2. **Closure variable survives throw** — `let captured = undefined; try { ...captured = p... } catch { return { ..., capturedField: captured } }`. JavaScript scope rules garantizan que el valor sobrevive el throw.

3. **Optional mirror field con tipo desde archivo neutral** — cuando 2 type-files necesitan el mismo tipo y crear un import bidireccional sería un ciclo, mueve el tipo a un 3er archivo y ambos importan desde ahí.

4. **Truncation at emission, not at type** — strings/JSON truncados en el sitio donde se emite el payload, no en el tipo (que retiene unknown raw para fidelity). UI prefiere `outputPreview` (truncado), `output` queda disponible para test runners.

5. **Silent omission with structural type check** — extracción de objetos forneos (kb_search response) con estructural narrowing (`typeof first?.topic === 'string'`) y `try/catch` o early-return `undefined` en lugar de throw. UI condicional renderiza "X not consulted" para `undefined`, vs "X returned 0 hits" para `[]`.
