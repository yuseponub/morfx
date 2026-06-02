# RESEARCH — somnio-v4-turn-ledger

**Researched:** 2026-05-28
**Domain:** Agent state persistence / serialization (somnio-sales-v4, DORMANT)
**Confidence:** HIGH (todo verificado en código — archivo:línea citado)
**Standalone:** #1 de 3 (turn-ledger → CRM-al-sub-loop → híbrido template+RAG)

---

## User Constraints (from CONTEXT.md + DISCUSSION-LOG.md)

### Locked Decisions (D-01..D-12)
- **D-01** Approach = Unified Turn Ledger. NO bolt-on, NO event-sourcing.
- **D-02** Cognición intra-turno (`mergeAnalysis → mergedState → decisiones`) INTACTA. Cero cambio a qué sales-action/template se elige.
- **D-03** Ledger captura: `comprehension` (intents+confidence), `atendido[]` (template_intent / sales_action / kb_topic / handoff / silence), `crmActions[]`, `modeTransition`, `messagesSent`.
- **D-04** `crmActions` shape = `{tool, args, result, code?, origen, stageAtTime?}` — diseñado para recibir el sub-loop orquestador del standalone #2.
- **D-05** La rama RAG DEBE registrar su efecto (`kb_topic` con sourceTopic + responseConfidence + turno + texto). **Hueco central.**
- **D-06** Dims nuevas se leen en turnos FUTUROS (deserialize al inicio), nunca intra-turno → cero behavior change.
- **D-07** Commit = frontera transaccional; alinea con interrupción SIN cambiar el mecanismo.
- **D-08** 3 capas seguridad CRM DEFERIDAS al standalone #2. El ledger solo no debe cerrar esa puerta.
- **D-09** v4 DORMANT → Regla 6 satisfecha; tocar SOLO archivos somnio-v4-specific + runner v4.
- **D-10** Actualizar `somnio-v4/ARCHITECTURE.md` (Regla 4) + corregir descripción `crm_mutation`.
- **D-11** `TurnLedger` tipo explícito + `commitTurn()` único. NO versión liviana.
- **D-12** "Single commit" = único punto de PERSISTENCIA, NO mutaciones diferidas. Working state muta vivo en memoria; commit serializa una vez al final.

### Out of scope (deferido — NO investigado aquí)
- Mover CRM/createOrder al sub-loop (standalone #2).
- 3 capas seguridad CRM (standalone #2).
- Híbrido template+RAG (standalone #3).
- Cambiar decisiones deterministas.
- Tocar interruption-system-v2.

---

## Summary

El estado v4 se serializa hoy con un patrón **flat key→string** (`serializeState`/`deserializeState` en `state.ts:287-392`) que aplana `datos` + mete metadata v4 con prefijo `_v4:` dentro de `datosCapturados`. EXCEPCIÓN: `accionesEjecutadas` ya migró a **first-class** — es un parámetro separado en deserialize, un campo separado en serialize, un campo en `V4AgentInput`/`V4AgentOutput`, y se persiste en su **propia columna JSONB `acciones_ejecutadas`** (migración `20260316000000`). Ese es el template exacto para las dims nuevas.

El camino de escritura tiene **8 return-paths** en `somnio-v4-agent.ts` (guard, silence, has-messages, 3× en mapOutcome, 2× interrupt-CKPT). Cada uno llama `serializeState(...)` o devuelve `input.*` crudo. El bug central: la rama RAG (`mapOutcomeToAgentOutput:844-983`) llama `serializeState(state)` PERO `state` (el `mergedState`) **no contiene** `sourceTopic`/`responseConfidence`/`texto` del `LoopOutcome` — esos campos viven solo en `outcome.*` (parámetro local) y se pierden en el commit. El ledger cierra esto: `commitTurn(workingState, ledger)` serializa AMBOS.

**Veredicto Q-02 (migración): SÍ, se recomienda UNA migración** que agregue una columna JSONB `turn_ledger_dims` (o columnas separadas `kb_topics_atendidos` + `crm_actions`) a `session_state`. Razón verificada (runner `v4-production-runner.ts:362-365`): `saveState` escribe **columnas top-level** y *Supabase rechaza un UPDATE a una columna inexistente* ("Failed to update session state"). Las dims podrían en teoría caber en `datos_capturados` (jsonb) con keys `_v4:`, pero eso (a) contradice el patrón first-class que `accionesEjecutadas` estableció deliberadamente (comentario "quick-009"), (b) ensucia `datos_capturados` con blobs grandes (texto generado), (c) complica el debug panel. La columna dedicada es el patrón canónico del proyecto.

**Primary recommendation:** Definir `interface TurnLedger` en `types.ts`. Agregar `commitTurn(workingState: AgentState, ledger: TurnLedger): SerializedTurn` en `state.ts` que envuelve `serializeState` + añade las dims de efecto. Reemplazar los 8 sitios `return {...serializeState...}` por construcción del ledger + `commitTurn`. Threading: nuevos campos en `V4AgentInput` (deserialize) + `V4AgentOutput` (persist), nueva columna JSONB en `session_state` (1 migración, Regla 5). Backward-compat graceful (default `[]`/`{}`) idéntico a `accionesEjecutadas`. v4-only → Regla 6 por construcción.

---

## Architectural Responsibility Map

| Capability | Tier owner | Archivo:línea | Notas |
|---|---|---|---|
| Cognición intra-turno (decide qué hacer) | Agente (working state vivo) | `somnio-v4-agent.ts:158-540` | INTACTO (D-02) |
| Registro de efectos (ledger) | Agente (acumulador en memoria) | nuevo, en `processUserMessage`/`processSystemEvent` | NUEVO |
| Serialización commit único | `state.ts` `commitTurn` (nuevo) wrap de `serializeState` | `state.ts:287` | NUEVO wrap |
| Persistencia física a DB | Runner `saveState` → SessionManager → `session_state` | `v4-production-runner.ts:967-972` | + columna nueva |
| Restore al inicio del turno | Runner build `V4AgentInput` → `deserializeState` | `v4-production-runner.ts:301-355` + `state.ts:326` | + param nuevo |
| Surfacing visual ("state real") | Sandbox debug panel (state-tab / nuevo) | `sandbox/components/debug-panel/` | Q-04 |
| Frontera transaccional vs interrupt | Runner CKPT-0..7 + agent CKPT-1/2 + subloop CKPT-3/4/5 | (no tocar) | commit DESPUÉS de sends OK |

---

## Q-01 (D-11 resuelto) — Tipo `TurnLedger` + `commitTurn()`

Confirmado en discuss. Research nota de implementación:

- **`TurnLedger` NO sustituye `AgentState`.** Son dos cosas (D-12): `AgentState` = working state (muta vivo, lo leen decisiones); `TurnLedger` = acumulador de efectos (se llena durante el turno, nadie lo lee intra-turno). `commitTurn(workingState, ledger)` los funde en el commit.
- **Precedente de tipo a espejar** (Q-07): el patrón más cercano es `V4AgentOutput` (`types.ts:190-286`) — ya es un "acumulador de outcome" que carga `intentInfo`, `subLoopReason`, `subLoopDebug`, `salesTrackInfo`, etc. Y `StateChanges` (`state.ts:34-42`) es un "delta del turno" puro. **Recomendación: `TurnLedger` modelado como `StateChanges` (objeto plano de efectos del turno), serializado vía `commitTurn` como `accionesEjecutadas` se serializa.** NO modelarlo como debug payload (esos son runtime-only, D-07 de v4-subloop-debug-view — nunca persisten; el ledger SÍ persiste).

---

## Q-02 (CRÍTICA, Regla 5) — Persistencia de `session_state`

### Schema verificado de `session_state`

`SessionState` TS interface (`src/lib/agents/types.ts:281-300`):
```
session_id, intents_vistos (IntentRecord[]), templates_enviados (string[]),
datos_capturados (Record<string,string>), pack_seleccionado, proactive_started_at,
first_data_at, min_data_at, ofrecer_promos_at, updated_at
```
**`acciones_ejecutadas` NO está en la interface TS** pero SÍ existe como columna (migración `20260316000000_v3_acciones_ejecutadas_column.sql`):
```sql
ALTER TABLE session_state ADD COLUMN acciones_ejecutadas JSONB DEFAULT '[]';
```
El runner la lee como `rawState.acciones_ejecutadas` con cast `as any` (`v4-production-runner.ts:303-304`) porque no está tipada. La escribe vía `saveState({ acciones_ejecutadas: output.accionesEjecutadas })` (`v4-production-runner.ts:971`).

### Dónde se persiste el output de serializeState

Flujo completo (verificado):
1. `serializeState(state)` → `{ datosCapturados, packSeleccionado, intentsVistos, templatesEnviados, accionesEjecutadas }` (`state.ts:287-321`).
2. Agente devuelve esos campos en `V4AgentOutput` (`somnio-v4-agent.ts:627-638`).
3. Runner (PATH B / normal) llama `saveState(sessionId, { datos_capturados, intents_vistos, pack_seleccionado, acciones_ejecutadas })` (`v4-production-runner.ts:967-972`) + un segundo `saveState({ templates_enviados })` (`:977-979`).
4. `StorageAdapter.saveState` (`engine-adapters/production/storage.ts:83-87`) → `SessionManager.updateState`.
5. `SessionManager.updateState` (`session-manager.ts:355-371`) hace `supabase.from('session_state').update({...updates, updated_at}).eq('session_id', id)`.

### ¿Migración SÍ o NO? → **SÍ (recomendado)**

**Constraint dura verificada** (`v4-production-runner.ts:362-365`, comentario textual):
> "session_state has no dedicated top-level columns for them — writing `{'_v3:agent_module': ...}` at the top level would try to target a column that doesn't exist and Supabase rejects the UPDATE ('Failed to update session state')."

Por eso `_v3:preloaded` / `_v3:agent_module` viven DENTRO de `datos_capturados` (jsonb). Hay dos rutas válidas:

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A — Columna(s) JSONB dedicada(s) (RECOMENDADO)** | Migración: `ALTER TABLE session_state ADD COLUMN turn_ledger_dims JSONB DEFAULT '{}'` (o `kb_topics_atendidos` + `crm_actions` separadas) | Patrón canónico (= `accionesEjecutadas`); `datos_capturados` limpio; debug panel lee columna directa; texto generado grande NO contamina datos del cliente | Requiere migración aplicada en prod ANTES de deploy (Regla 5) |
| **B — Keys `_v4:` dentro de `datos_capturados`** | `serializeState` escribe `datosCapturados['_v4:kbTopics'] = JSON.stringify(...)` | Cero migración | Contradice el patrón first-class deliberado de quick-009; blobs grandes en datos del cliente; `deserializeState` ya filtra `_v4:` keys (`state.ts:337`) así que NO se devuelven como datos — habría que parsearlas manual como hace el fallback de accionesEjecutadas (`state.ts:362-382`); ensucia el state-tab JSON |

**Recomendación: Opción A.** Modelar EXACTAMENTE como `acciones_ejecutadas`:

```sql
-- Migración recomendada (idempotente, patrón de 20260316000000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='session_state' AND column_name='turn_ledger_dims'
  ) THEN
    ALTER TABLE session_state ADD COLUMN turn_ledger_dims JSONB DEFAULT '{}';
  END IF;
END $$;
```

Una sola columna `turn_ledger_dims` (jsonb objeto) que contiene `{ kbTopicsAtendidos: KbTopicRegistrado[], crmActions: CrmActionRegistrada[], ... }` es más barata de evolucionar que N columnas (standalones #2/#3 añadirán dims). El planner decide granularidad; ambas funcionan.

**Regla 5 (BLOQUEANTE):** la migración se crea en `supabase/migrations/`, se PAUSA pidiendo al usuario aplicarla en prod, se ESPERA confirmación, y SOLO entonces se pushea el código que la usa. v4 DORMANT mitiga el riesgo (0 sesiones activas escriben la columna) pero la regla aplica igual.

---

## Q-03 — `kb_topic`: dimensión separada vs `atendido[]` unificado

D-03 propone `atendido[]` unificado con discriminador `kind`. **Confirmado viable** — es el patrón TS estándar (discriminated union, ya usado en el codebase: `Invocation` en `types.ts:382-397`, `SystemEvent` en `:329-331`, `SalesEvent` en `:334-336`). Recomendación:

```ts
type Atendido =
  | { kind: 'template_intent'; intent: string; templateIds: string[] }
  | { kind: 'sales_action'; accion: TipoAccion; templateIds: string[] }
  | { kind: 'kb_topic'; topic: string; confidence: number; texto: string; turno: number }
  | { kind: 'handoff'; reason: string }
  | { kind: 'silence' }
```

Para persistencia, `atendido[]` cabe entero en `turn_ledger_dims.atendido`. NO requiere dimensión física separada — el discriminador hace el trabajo en deserialize. (Q-03 = unificado, confirmado.)

---

## Q (Pattern) — Flujo first-class de `accionesEjecutadas` (TEMPLATE EXACTO)

End-to-end verificado — replicar esto para las dims nuevas:

| Paso | Archivo:línea | Qué hace |
|---|---|---|
| Campo en state | `types.ts:50` (`accionesEjecutadas: AccionRegistrada[]`) | en `AgentState` |
| Init default | `state.ts:71` (`accionesEjecutadas: []`) | `createInitialState` |
| Deserialize param | `state.ts:331` (param `accionesEjecutadas = []`) | **param separado**, no dentro de datosCapturados |
| Deserialize restore + backward-compat | `state.ts:357-383` | prefiere param; fallback parsea `_v4:accionesEjecutadas` legacy (string[] → AccionRegistrada[]) |
| Serialize campo | `state.ts:319` (`accionesEjecutadas: state.accionesEjecutadas`) | campo separado del return; comentario `:305` "now flows as its own field (quick-009), not inside datosCapturados" |
| Input contract | `types.ts:152` (`accionesEjecutadas?: AccionRegistrada[]`) | en `V4AgentInput` |
| Output contract | `types.ts:221` (`accionesEjecutadas: AccionRegistrada[]`) | en `V4AgentOutput` |
| Runner restore | `v4-production-runner.ts:301-310` | lee columna `acciones_ejecutadas`, fallback `_v3:` key |
| Runner seed | `:334`, `:350` | pasa a `V4AgentInput.accionesEjecutadas` |
| Runner persist | `:971` `saveState({ acciones_ejecutadas: output.accionesEjecutadas })` | columna dedicada |
| Sandbox engine restore/persist | `engine-v4.ts:278`, `:462`, `:500` | mismo campo first-class en `SandboxState` |
| Sandbox state type | `sandbox/types.ts:257` | `accionesEjecutadas: AccionRegistrada[]` |
| Migration | `20260316000000_v3_acciones_ejecutadas_column.sql` | `JSONB DEFAULT '[]'` |
| Debug panel render | `state-tab.tsx:73-90` | badges por acción |

**Pitfall de tipado:** la columna NO está en la interface `SessionState` (`types.ts:281`). El runner accede vía `as any` (`v4-production-runner.ts:303`). Para las dims nuevas, **agregar el campo a `SessionState`** evita ese cast (mejora sobre el precedente).

---

## Q-03b — Mapa COMPLETO del camino de escritura actual

Sitios que llaman `serializeState` / construyen output con state persistible (todo `somnio-v4-agent.ts` salvo nota):

| # | Sitio | Línea | Qué serializa | Captura efecto RAG/CRM? |
|---|---|---|---|---|
| R1 | Guard R0/R1 blocked (handoff) | `:274` serialize, `:275-309` return | mergedState | N/A (no RAG ni CRM) |
| R2 | Natural silence | `:575` serialize, `:576-623` return | mergedState | NO (silence no se registra como atendido) |
| R3 | Has-messages (happy path) | `:627` serialize, `:629-688` return | mergedState (incl. acciones push `:551-558`, templates `:561-565`) | CRM: parcial (`crmAction:true` flag `:556`, sin tool/args/result). RAG: N/A |
| R4 | mapOutcome no_match→handoff | `:919-928` | mergedState | **NO** (knowledgeQueried solo en debug/observability) |
| R5 | mapOutcome generated (RAG) | `:947-956` | mergedState | **NO ← BUG CENTRAL** (responseText/sourceTopic/responseConfidence en `outcome.*`, no en state) |
| R6 | mapOutcome template | `:973-982` | mergedState | NO |
| R7 | CKPT-1 interrupt | `:142-154` return `input.*` crudo | input crudo (descarta turno) | N/A (interrupt → descartar, D-07) |
| R8 | CKPT-2 interrupt | `:340-352` return `input.*` crudo | input crudo (descarta turno) | N/A |
| R9 | catch error | `:693-709` return `input.*` crudo | input crudo | N/A |
| R10 | processSystemEvent (timer) | `:784` serialize, `:790-827` return | state (acciones push `:768-775`, templates `:778-782`) | CRM timer: parcial flag |

`mapOutcomeToAgentOutput` se llama desde 3 sitios (`:249` low_confidence/razonamiento, `:465` cas_reject) — todos pasan `state: mergedState`, NUNCA el `outcome` se serializa.

**Lo que `commitTurn` debe consolidar:** R1, R2, R3, R4, R5, R6, R10 (los 7 commits reales). R7/R8/R9 NO (interrupt/error = descartar turno, D-07). El ledger se construye incrementalmente durante el turno y `commitTurn` lo funde en cada uno de los 7 return-paths reales. **Clave para D-05:** R4/R5/R6 (mapOutcome) reciben `outcome` como argumento → ahí se construye el `atendido: {kind:'kb_topic',...}` desde `outcome.sourceTopic/responseConfidence/responseText`.

---

## Q-04 (contrato agente↔runner) — qué persiste el runner y dónde

`V4AgentOutput` campos persistibles (`types.ts:215-221`): `intentsVistos`, `templatesEnviados`, `datosCapturados`, `packSeleccionado`, `accionesEjecutadas`.

Runner los persiste así:
- PATH B/normal: `saveState({ datos_capturados, intents_vistos, pack_seleccionado, acciones_ejecutadas })` (`v4-production-runner.ts:967-972`) + `saveState({ templates_enviados })` (`:977-979`).
- PATH A (interrupt zero-sends): `saveState({ intents_vistos: rolled-back, datos_capturados: {...input, _v3:pendingUserMessage}, pack, acciones })` (`:948-957`) — rollback parcial, sin turns.
- `subLoopDebug`, `intentInfo`, `decisionInfo`, etc. NO se persisten (runtime-only, van a debug adapter `:1070-1080`).

**Por qué la rama RAG pierde sourceTopic/confidence (verificado):** `mapOutcomeToAgentOutput` (`:844`) recibe `outcome: LoopOutcome` con `sourceTopic`/`responseConfidence`/`responseText` (schema `output-schema.ts:43-62`). Pero solo serializa `state` (`:858 const serialized = serializeState(state)`) — `state` no tiene esos campos. El único rastro es `decisionInfo.templateIntents: ['generated:'+sourceTopic]` (`:954`) que es debug runtime, NO persistido. → en el siguiente turno, `deserializeState` no tiene forma de saber que "apnea" ya se respondió por RAG. **Esto es exactamente lo que D-05 cierra.**

**Implicación para el runner:** debe añadirse `turnLedgerDims` (o las dims) a `V4AgentOutput`, leerse en restore (`:301-355` zona), y persistirse con un campo más en el `saveState` PATH B (`:967-972`). PATH A NO persiste dims (descarta turno, consistente con D-07). El sandbox `engine-v4.ts` necesita el cambio espejo (`:494-501` newState + `:278` restore).

---

## Q-04 (debug panel) — surfacing del ledger

Estructura verificada:
- Tabs declarados como `DebugPanelTabId` union (`sandbox/types.ts:357-374`): `pipeline | classify | bloques | tools | state | tokens | ingest | config | subloop | interruption`.
- `TAB_ICONS` es un `Record<DebugPanelTabId, Icon>` EXHAUSTIVO (`tab-bar.tsx:24-35`) — **typecheck falla si agregas un tab id sin icono** (invariante documentado, anti-Pitfall 6 de v4-subloop-debug-view).
- Archivos de tab existentes: `state-tab.tsx`, `subloop-tab.tsx`, `interruption-tab.tsx`, etc. en `src/app/(dashboard)/sandbox/components/debug-panel/`.
- Patrón de tab nuevo (precedente Sub-Loop tab del standalone v4-subloop-debug-view, Interruption tab de debounce-v2): (1) agregar id al union, (2) agregar icono al `TAB_ICONS` Record, (3) crear `<x>-tab.tsx`, (4) cablear en `debug-tabs.tsx`/`panel-container.tsx`, (5) alimentar payload vía `DebugTurn` (engine-v4 lo construye, `engine-v4.ts:519-589`).

**Recomendación para "state visual real":** dado que el ledger SE persiste (a diferencia del subLoopDebug runtime-only), hay 2 caminos:
- **Mínimo (recomendado dentro de scope):** extender el **state-tab existente** (`state-tab.tsx`) con secciones nuevas "KB Topics Atendidos" y "CRM Actions" — mismo patrón badge que "Acciones Ejecutadas" (`state-tab.tsx:73-90`). El state-tab ya lee `SandboxState`; basta agregar las dims a `SandboxState` y renderizarlas. Cero tab nuevo, cero cambio a `TAB_ICONS`.
- **Completo (posible follow-up):** un tab "Ledger" dedicado mostrando el `atendido[]` timeline + crmActions table por turno. Q-04 del discuss preguntó si es scope de este standalone o follow-up → **research recomienda: extender state-tab en este standalone (barato, cierra "state visual real"), diferir tab dedicado a follow-up si el usuario quiere timeline por-turno.** El planner/usuario decide.

---

## Q-06 — Alineación con interrupción (NO tocar interruption-system-v2)

Checkpoints relativos al commit (verificado):
- CKPT-1 (post-comprehension) `somnio-v4-agent.ts:128-156`, CKPT-2 (post-state-machine) `:326-354`: interrupt → `return input.* crudo` con `errorMessage: 'interrupted_at_ckpt_N'`. **El turno se descarta (no serializa).** Consistente con D-07: commit no ocurrió → nada que revertir.
- Sub-loop CKPT-3/4/5: interrupt surface como `outcome.reason='interrupted_at_ckpt_N'` → `mapOutcome:911-918` propaga como `errorMessage` (NO handoff — fix de debounce-v2-interrupt-reprocess Pitfall 7).
- Runner CKPT-0 (post-acquire) + CKPT-6 (pre-send-loop) + CKPT-7.N (per-template). El `saveState` real ocurre **DESPUÉS** del send-loop (`v4-production-runner.ts:932-972`), en el bloque "5-post POST-SEND".

**Conclusión:** `serializeState`/persistencia YA ocurre al final (post-send), que es exactamente la frontera transaccional que D-07 describe. `commitTurn` NO mueve la frontera — solo enriquece el payload que ya se serializa en ese punto. El working state (incl. el ledger acumulado en memoria) es efímero hasta el `saveState` post-send. Path A (`:944-962`) descarta el turno (rollback intents + pending). Path B reprocess (`:858-868`) usa `carryState` = estado serializado de la iteración previa → **el ledger debe incluirse en `carryState`** para que un reprocess Path B no pierda los efectos ya registrados (ej. un kb_topic respondido en msg1 que el reprocess de msg2 no debe re-responder). Esto es un cable a `carryState` (runner `:859-866` + engine `:456-463`), NO un cambio al módulo de interrupción.

**Pitfall:** NO persistir el ledger en Path A (zero-sends) — consistente con que Path A descarta el turno. NO emitir lock events ni tocar `checkpoint()`. El ledger es ortogonal al lock.

---

## Q-07 — Precedente de tipo "acumulador de outcome"

| Candidato | Archivo | Apto como modelo de `TurnLedger`? |
|---|---|---|
| `StateChanges` | `state.ts:34-42` | **SÍ** — delta del turno puro, computado, plano. Mejor modelo conceptual. |
| `V4AgentOutput` | `types.ts:190-286` | Parcial — ya acumula outcome pero mezcla persistible + runtime-only. El ledger es subset persistible. |
| `AccionRegistrada[]` | `types.ts:314-319` | **SÍ** — patrón de "registro por turno con origen". `kbTopicsAtendidos` / `crmActions` deben verse igual. |
| `SubLoopDebugPayload` | `sub-loop/debug-payload.ts` | **NO** — runtime-only, NUNCA persiste (D-07 de su standalone). El ledger SÍ persiste. No confundir. |
| `Invocation` (discriminated union) | `types.ts:382-397` | **SÍ** — modelo para `atendido[]` con `kind` discriminador. |

---

## Q-08 (Gate Regla 6) — verificar CERO impacto en v3/godentist/recompra/pw-confirmation

v4 DORMANT (0 workspaces — confirmado en memoria). Las dims son v4-only. Greps verificables (baseline ya corrido — todos 0):

```bash
# 1. Ningún agente no-v4 importa código v4 (baseline: 0 — verificado)
grep -rln "somnio-v4\|somnio-sales-v4\|turn-ledger\|TurnLedger\|commitTurn\|kbTopicsAtendidos\|turn_ledger_dims" \
  src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/
# Esperado: 0 matches

# 2. Cambios de código confinados a archivos v4-specific + runner v4
git diff --name-only | grep -vE "src/lib/agents/somnio-v4/|src/lib/agents/engine/v4-production-runner.ts|src/lib/sandbox/types.ts|src/app/\(dashboard\)/sandbox/components/debug-panel/|supabase/migrations/.*turn_ledger|src/lib/agents/types.ts"
# Esperado: 0 (salvo ARCHITECTURE.md / docs)

# 3. La migración NO altera columnas existentes (solo ADD COLUMN idempotente)
grep -E "DROP|ALTER COLUMN|RENAME" supabase/migrations/*turn_ledger*
# Esperado: 0 matches

# 4. serializeState/deserializeState signature backward-compat (param opcional default)
grep -n "deserializeState" src/lib/agents/somnio-v4/state.ts
# Verificar: nuevo param con default ([] o {}) — no rompe callers existentes
```

**Nota sobre `types.ts` compartido:** `src/lib/agents/types.ts` (donde vive `SessionState`) lo usan TODOS los agentes. Agregar `turn_ledger_dims?: ...` como **campo opcional** a `SessionState` es aditivo y no rompe v3/etc. (nadie lo lee). Verificar que sea opcional. Alternativa más segura: NO tocar `SessionState` y usar `as any` como hace `acciones_ejecutadas` hoy — pero eso perpetúa el cast feo. Research recomienda campo opcional en `SessionState` (aditivo, type-safe, Regla 6 OK por opcionalidad).

---

## Don't Hand-Roll

| Problema | NO construir | Usar | Por qué |
|---|---|---|---|
| Serialización state↔DB | nuevo serializer paralelo | extender `serializeState`/`deserializeState` existentes (`state.ts:287`) | un solo serializer = un solo commit (D-11/D-12) |
| Persistencia DB | escribir Supabase directo desde agente | `saveState` → SessionManager (Regla 3) | domain/storage layer es single source |
| Backward-compat dims viejas | migración de datos | default graceful en deserialize (patrón `accionesEjecutadas` `state.ts:357-383`) | Q-05; v4 DORMANT, sesiones viejas raras |
| Discriminated union `atendido[]` | flags booleanos paralelos | `kind` discriminator (precedente `Invocation`/`SystemEvent`) | type-safe, exhaustivo |
| Debug surface | nuevo sistema de debug | extender state-tab (`state-tab.tsx`) | ledger persiste → state-tab es su hogar natural |

---

## Common Pitfalls

### P1 — Supabase rechaza UPDATE a columna inexistente
Verificado `v4-production-runner.ts:362-365`. Si pones la dim como key top-level en `saveState` SIN migración → "Failed to update session state" → turno crashea. **Mitigación:** migración primero (Regla 5) O meter en `datos_capturados` jsonb (Opción B). NUNCA un key top-level sin columna.

### P2 — Perder el outcome RAG en el commit (el bug que arreglamos)
`mapOutcomeToAgentOutput` serializa `state`, no `outcome`. Si el ledger se construye solo desde `mergedState`, R5 (generated) sigue perdiendo sourceTopic/confidence. **Mitigación:** construir el `atendido:{kind:'kb_topic'}` DESDE `outcome.*` dentro de mapOutcome (R4/R5/R6), no desde state.

### P3 — Doble-commit / double-increment en Path B reprocess
`turnCount++` vive en `mergeAnalysis` (`state.ts:158`). El ledger NO debe re-incrementar. Path B usa `carryState` (estado serializado de iter previa). Si el ledger no se incluye en `carryState`, el reprocess re-registra efectos ya commiteados. **Mitigación:** añadir dims a `carryState` (runner `:859-866`, engine `:456-463`). El ledger acumulado de iter-1 se preserva, iter-2 solo añade lo nuevo.

### P4 — Romper paridad runner ↔ sandbox
`v4-production-runner.ts` y `engine-v4.ts` NO comparten código pero DEBEN alinearse (ver `INTERRUPTION-PARITY.md`). Todo cambio de persistencia/restore/carryState debe replicarse en AMBOS. **Mitigación:** checklist de paridad en el plan; grep ambos archivos por cada campo nuevo.

### P5 — Cast `as any` perpetuado
La columna `acciones_ejecutadas` se lee con `as any` (`v4-production-runner.ts:303`) porque no está en `SessionState`. Repetir esto para las dims nuevas funciona pero es deuda. **Mitigación:** agregar campo opcional a `SessionState` interface.

### P6 — Persistir ledger en Path A (interrupt zero-sends)
Path A descarta el turno (D-07). Persistir el ledger ahí registraría efectos de un turno que nunca se envió. **Mitigación:** el `saveState` de Path A (`:948-957`) NO debe incluir las dims; solo PATH B normal (`:967-972`).

---

## State of the Art (en este codebase)

| Patrón viejo | Patrón actual | Aplicar al ledger |
|---|---|---|
| metadata dentro de `datos_capturados` con `_v3:`/`_v4:` keys | first-class field + columna JSONB dedicada (`accionesEjecutadas`, quick-009) | SÍ — columna `turn_ledger_dims` |
| `serializeState` retorna solo datos+pack | retorna 5 campos incl. accionesEjecutadas | extender a 6+ (incl. dims) o wrap con `commitTurn` |
| status `'canonical'` verbatim | status `'generated'` RAG (sourceTopic/responseConfidence) | el ledger registra `'generated'` outcomes |

---

## Assumptions Log

| # | Claim | Sección | Risk si erróneo |
|---|---|---|---|
| A1 | Una columna JSONB única `turn_ledger_dims` es preferible a N columnas separadas | Q-02 | BAJO — ambas funcionan; granularidad la decide el planner |
| A2 | Extender state-tab (no tab nuevo) cierra "state visual real" suficientemente para este standalone | Q-04 | MEDIO — el usuario pidió "reflejo visual real"; podría querer timeline por-turno (tab dedicado). Confirmar en plan/discuss |
| A3 | Agregar campo opcional a `SessionState` (compartido) es Regla-6-safe por opcionalidad | Q-08 | BAJO — verificado que es aditivo; ningún agente no-v4 lo lee |

---

## Open Questions

1. **Granularidad de columna(s)** — `turn_ledger_dims` única vs `kb_topics_atendidos` + `crm_actions` separadas. Research recomienda única (más barata de evolucionar para #2/#3). Decisión de plan.
2. **Tab dedicado "Ledger" vs extender state-tab** — A2. Research recomienda extender state-tab en este standalone; tab dedicado como follow-up opcional. Confirmar con usuario (pidió "state visual real").
3. **`atendido[]` incluye `silence`?** — D-03 lo lista. Hoy silence (R2) no se registra como acción. Si el ledger registra `{kind:'silence'}`, es info nueva (turnos donde el bot calló). Útil pero verificar que no infle el ledger. Decisión de plan.

---

## Environment Availability

| Dependency | Required by | Available | Notas |
|---|---|---|---|
| Supabase migration apply (prod) | columna `turn_ledger_dims` | Manual (Regla 5) | Usuario aplica antes de deploy |
| zod | schema dims (si se valida) | ✓ (ya usado, `output-schema.ts:1`) | — |
| Tests vitest | suite somnio-v4 | ✓ | `npx vitest run src/lib/agents/somnio-v4/__tests__/` |

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | vitest |
| Quick run | `npx vitest run src/lib/agents/somnio-v4/__tests__/state.test.ts` |
| Full suite | `npx vitest run src/lib/agents/somnio-v4/__tests__/` |

### Requirements → Test Map (propuesto)
| Req | Behavior | Test type | Comando | Existe? |
|---|---|---|---|---|
| Ledger serialize/deserialize roundtrip | dims persisten + restauran | unit | `state.test.ts::commitTurn roundtrip` | ❌ Wave 0 |
| RAG outcome registra kb_topic | mapOutcome(generated) → atendido kb_topic con sourceTopic/confidence | unit | `somnio-v4-agent.test.ts::RAG ledger` | ❌ Wave 0 |
| Backward-compat sesión sin dims | deserialize default graceful | unit | `state.test.ts::deserialize legacy` | ❌ Wave 0 (espejo de accionesEjecutadas test existente) |
| carryState incluye dims (Path B) | reprocess no pierde ledger | unit/integration | runner test | ❌ Wave 0 |
| Regla 6: agentes no-v4 sin cambio | grep + tests verdes | smoke | greps Q-08 + suite no-v4 | parcial (greps) |

### Wave 0 Gaps
- [ ] Tests de `commitTurn` roundtrip en `state.test.ts` (espejar tests existentes de `accionesEjecutadas`).
- [ ] Test de mapOutcome RAG → ledger kb_topic.
- [ ] Migración SQL `turn_ledger_dims` (idempotente, patrón `20260316000000`).

---

## Security Domain

Aplica mínimamente (sin auth/crypto nuevos). V5 Input Validation: el `texto` generado por RAG que se persiste en el ledger es output del modelo — truncar (ej. cap chars) antes de persistir para no inflar la columna jsonb (el debug payload ya trunca a 500 chars, `debug-payload.ts`). Sin PII nueva: `crmActions.args` podría contener phone/email — si se persiste, aplica la misma redacción que `crm-mutation-tools` audit trail (phone last 4, email masked) — **pero D-08 difiere las capas de observabilidad CRM al standalone #2**; aquí solo registrar shape, considerar redacción mínima en `args`.

---

## Sources

### Primary (HIGH — código verificado)
- `src/lib/agents/somnio-v4/state.ts:34-402` — serializeState/deserializeState/mergeAnalysis/StateChanges
- `src/lib/agents/somnio-v4/types.ts:42-403` — AgentState/V4AgentInput/V4AgentOutput/AccionRegistrada/Invocation
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts:81-1008` — 8 return-paths + mapOutcomeToAgentOutput
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts:35-154` — LoopOutcome (sourceTopic/responseConfidence)
- `src/lib/agents/somnio-v4/invocations.ts:125-283` — executeInvocations (CRM determinista)
- `src/lib/agents/engine/v4-production-runner.ts:276-1106` — restore + persist frontier + Path A/B + createOrder + Supabase column constraint comment
- `src/lib/agents/somnio-v4/engine-v4.ts:278-589` — sandbox paridad restore/persist/debugTurn
- `src/lib/agents/session-manager.ts:336-414` — updateState/getState/updateCapturedData
- `src/lib/agents/engine-adapters/production/storage.ts:83-136` — saveState
- `src/lib/agents/types.ts:281-300` — SessionState interface (sin acciones_ejecutadas)
- `supabase/migrations/20260316000000_v3_acciones_ejecutadas_column.sql` — patrón migración JSONB
- `src/lib/sandbox/types.ts:250-380` — SandboxState/DebugPanelTabId
- `src/app/(dashboard)/sandbox/components/debug-panel/{tab-bar,state-tab}.tsx` — tab pattern + TAB_ICONS exhaustivo
- `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` — runtime-only payload (contraste con ledger persistido)
- `src/lib/agents/somnio-v4/ARCHITECTURE.md` — descripción crm_mutation a corregir (D-10)

---

## Metadata

**Confidence breakdown:**
- Persistencia/serialización (Q-02, pattern): HIGH — verificado end-to-end con archivo:línea.
- Camino de escritura (8 paths): HIGH — leído `somnio-v4-agent.ts` completo.
- Debug panel (Q-04): HIGH — estructura verificada; recomendación state-tab vs tab nuevo = decisión de producto (A2).
- Regla 6: HIGH — grep baseline corrido (0 matches v4 en agentes no-v4).
- Migración SÍ/NO: HIGH — constraint Supabase verificado en comentario del runner.

**Research date:** 2026-05-28
**Valid until:** 30 días (codebase estable; v4 DORMANT)
