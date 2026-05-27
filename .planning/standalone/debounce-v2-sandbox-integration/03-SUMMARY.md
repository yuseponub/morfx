---
phase: standalone-debounce-v2-sandbox-integration
plan: 03
subsystem: somnio-v4-sandbox-debug-panel
tags: [interruption-v2, sandbox, debug-panel, prop-threading, regla-6, d-15]
dependency_graph:
  requires:
    - Plan 01 (debounce-v2-sandbox-integration) — V4EngineInput lock fields shipped
    - Plan 02 (debounce-v2-sandbox-integration) — sandboxLockSessionId useState lazy init en sandbox-layout.tsx (commit ab2110bd) + collector wrap emite events a agent_observability_events
    - debounce-interruption-system-v2 (shipped 2026-05-26) — InterruptionTab component + /api/observability/events route
  provides:
    - PanelContainerProps gana sandboxSessionId?: string | null opcional
    - DebugTabsProps gana sandboxSessionId?: string | null opcional
    - sandbox-layout.tsx wirea sandboxLockSessionId al DebugTabs JSX
    - InterruptionTab via 'interruption' case ahora recibe conversationId={runtime-lock-id} (en vez de null hard-coded)
  affects:
    - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx (interface + interruption case)
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (interface + destructure + pass-through)
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (single prop addition al <DebugTabs ...>)
tech-stack:
  added: []  # zero new deps — pure prop threading
  patterns:
    - Optional prop with sensible default (null) preserves caller flexibility
    - JSDoc anchoring each new prop to the standalone + decision id (D-08)
    - Regla 6 spirit: only the consumer of the new prop (the 'interruption' case) sees behavior change; all other case branches byte-identical
key-files:
  modified:
    - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx (+15 / -5)
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (+6 / 0)
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (+1 / 0)
decisions:
  - "D-08: Interruption tab en /sandbox ahora muestra eventos reales para la sesion actual (sandboxLockSessionId → InterruptionTab.conversationId)."
  - "D-11: sessionId queda en null porque sandbox NO crea filas en agent_sessions (opcion c del DISCUSSION-LOG). El events route en /api/observability/events resuelve directo via conversation_id cuando session_id ausente (Pitfall 4 RESOLVED)."
  - "D-15: InterruptionTab component (src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx) byte-identico — shipped por parent standalone Plan 06. Verificado: git diff vs Plan 02 SUMMARY commit (b463a876) returns 0 lines."
  - "D-15: Modulo src/lib/agents/interruption-system-v2/ byte-identico — verificado: git diff stat vs b463a876 returns 0 lines."
  - "Regla 6 spirit: solo la rama case 'interruption' en panel-container.tsx consume el nuevo prop. Las otras 9 case branches (pipeline/classify/bloques/tools/state/tokens/ingest/config/subloop) son byte-identicas. Verificado: grep -A 1 'case ...' panel-container.tsx | grep -c sandboxSessionId == 0 para las non-interruption branches."
metrics:
  start: "2026-05-27"
  end: "2026-05-27"
  duration: "~10min"
  tasks: 2
  commits: 2
  loc_delta: "+22 / -5 (target ~+15 — overshoot por JSDoc completo en cada prop addition)"
---

# Phase Standalone debounce-v2-sandbox-integration Plan 03: Wire InterruptionTab to Runtime sandboxLockSessionId Summary

**One-liner:** Cablea el runtime `sandboxLockSessionId` (que Plan 02 instala en `sandbox-layout.tsx` via useState lazy init) a traves del prop chain `sandbox-layout → DebugTabs → PanelContainer → InterruptionTab` para que el debug-panel "Interruption" tab ahora consulte `/api/observability/events?conversation_id={sandboxLockSessionId}` y muestre los eventos lock_acquired/lock_released_normal/msg_aborted_path_a_combined/etc. reales que el v4 sandbox engine + route emiten via collector wrap (Plan 02 Task 2.1).

## Lo que se hizo

### Task 3.1: PanelContainerProps gana sandboxSessionId + interruption case lo consume (commit `782f56d7`)

`src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx`:

- **Interface `PanelContainerProps`**: agregado prop opcional `sandboxSessionId?: string | null` (linea 45) con JSDoc 4-lineas (lineas 41-44) documentando standalone + D-08 + el racional anti-localStorage (Pitfall 6) + comportamiento null-fallback que preserva el placeholder UX original de InterruptionTab.
- **`case 'interruption':` (linea 85)**: cambiado de `<InterruptionTab conversationId={null} sessionId={null} />` a `<InterruptionTab conversationId={props.sandboxSessionId ?? null} sessionId={null} />` (linea 94). Comentario actualizado a 7 lineas (lineas 86-93) documentando standalone + D-08 + Pitfall 6 + D-11 (sessionId stays null porque sandbox no crea agent_sessions rows) + Pitfall 4 (events route resuelve via conversation_id cuando session_id ausente).

Las otras 9 `case` branches (`pipeline`, `classify`, `bloques`, `tools`, `state`, `tokens`, `ingest`, `config`, `subloop`) byte-identicas — verificado via grep que ninguna otra referencia `sandboxSessionId` (Regla 6 spirit).

### Task 3.2: DebugTabsProps gana sandboxSessionId + pass-through + sandbox-layout JSX update (commit `0ca01a1d`)

`src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx`:

- **Interface `DebugTabsProps`** (linea 49): agregado `sandboxSessionId?: string | null` con JSDoc 3-lineas (lineas 46-48) documentando standalone + D-08 + el routing del prop a PanelContainer's interruption case.
- **Destructure** (linea 66): agregado `sandboxSessionId,` al signature de la function `DebugTabs({ ... })`.
- **Pass-through al `<PanelContainer ...>`** (linea 123): agregado `sandboxSessionId={sandboxSessionId}`.

`src/app/(dashboard)/sandbox/components/sandbox-layout.tsx`:

- **Linea 665**: agregado `sandboxSessionId={sandboxLockSessionId}` al JSX `<DebugTabs ...>` (que ya estaba renderizandose en linea 651). El estado `sandboxLockSessionId` ya estaba declarado por Plan 02 Task 2.3 (linea 67: `const [sandboxLockSessionId] = useState(() => generateSessionId())`) — Plan 03 solo lo *consume* leyendo el value y pasandolo como prop.

## Verificaciones

### Acceptance gates Task 3.1
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "sandboxSessionId?: string \| null" panel-container.tsx` | ≥1 | 1 |
| `grep -c "props.sandboxSessionId" panel-container.tsx` | ≥1 | 1 |
| `grep -c "conversationId={null} sessionId={null}" panel-container.tsx` | ==0 | 0 |
| `grep -c "conversationId={props.sandboxSessionId ?? null}" panel-container.tsx` | ≥1 | 1 |
| Typecheck panel-container errors | 0 | 0 |
| `git diff --stat b463a876 -- interruption-tab.tsx \| wc -l` | 0 | 0 |

### Acceptance gates Task 3.2
| Check | Esperado | Actual |
|---|---|---|
| `grep -c "sandboxSessionId?: string \| null" debug-tabs.tsx` | ≥1 | 1 |
| `grep -c "sandboxSessionId," debug-tabs.tsx` | ≥1 | 1 |
| `grep -c "sandboxSessionId={sandboxSessionId}" debug-tabs.tsx` | ≥1 | 1 |
| `grep -c "sandboxSessionId={sandboxLockSessionId}" sandbox-layout.tsx` | ≥1 | 1 |
| `git diff --stat b463a876 -- interruption-tab.tsx \| wc -l` | 0 | 0 |
| `git diff --stat b463a876 -- src/lib/agents/interruption-system-v2/ \| wc -l` | 0 | 0 |
| Typecheck debug-tabs.tsx + sandbox-layout.tsx errors | 0 | 0 |

### Regla 6 / D-15 zero-diff gates (vs Plan 02 SUMMARY commit `b463a876`)

```bash
git diff --stat b463a876 -- src/app/\(dashboard\)/sandbox/components/debug-panel/interruption-tab.tsx                # 0
git diff --stat b463a876 -- src/lib/agents/interruption-system-v2/                                                  # 0
```

**PASS.** El componente `InterruptionTab` (266 LOC, shipped por parent standalone Plan 06) y el modulo `interruption-system-v2/` (lock primitives, observability, redis-client, etc.) NO fueron tocados por Plan 03 — el cableo es exclusivamente prop-threading.

### Regla 6 spot-check sobre otras case branches de panel-container.tsx

```bash
grep -A 1 "case 'pipeline':\|case 'classify':\|case 'bloques':\|case 'tools':\|case 'state':\|case 'tokens':\|case 'ingest':\|case 'config':\|case 'subloop':" \
  src/app/\(dashboard\)/sandbox/components/debug-panel/panel-container.tsx | grep -c "sandboxSessionId"
# Output: 0
```

**PASS.** Solo la rama `case 'interruption':` consume el nuevo prop. Las 9 otras case branches del switch statement permanecen byte-identicas a su forma pre-Plan-03.

### Diff inspection: solo cambios anchored al nuevo prop

`panel-container.tsx` diff vs b463a876:
- (+) interface field `sandboxSessionId?: string | null` + 5 lineas JSDoc.
- (-) case 'interruption' antiguo (5 lineas: comentario + return null/null).
- (+) case 'interruption' nuevo (9 lineas: comentario extendido + return con props.sandboxSessionId).

`debug-tabs.tsx` diff vs b463a876:
- (+) interface field `sandboxSessionId?: string | null` + 3 lineas JSDoc.
- (+) destructure `sandboxSessionId,` (1 linea).
- (+) `sandboxSessionId={sandboxSessionId}` en JSX `<PanelContainer ...>` (1 linea).

`sandbox-layout.tsx` diff vs b463a876:
- (+) `sandboxSessionId={sandboxLockSessionId}` en JSX `<DebugTabs ...>` (linea 665, 1 linea).

Cero edits a `DEFAULT_TABS`, handlers (`handleReorder`/`handleToggleTab`), `visiblePanels`, render structure, ni a ninguna otra logica del archivo (Regla 6 spirit verbatim).

### TypeScript clean

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "debug-tabs\.tsx|sandbox-layout\.tsx|panel-container\.tsx"
# (empty output — cero errores en los 3 archivos modificados)
```

**PASS.**

### D-12 zero migration + D-13 sin feature flag

Plan 03 es **pure UI / prop threading**. No tocó `supabase/migrations/`, no introdujo feature flags, no creó archivos nuevos. N/A.

## Confirmacion del flow end-to-end

Pre-Plan-03:
- `sandboxLockSessionId` existe en sandbox-layout.tsx (Plan 02 Task 2.3).
- POST `/api/sandbox/process` body lo incluye + el route v4 branch HOLDER lo usa como conversation_id en el ObservabilityCollector (Plan 02 Task 2.1).
- Eventos `lock_acquired`, `lock_released_normal`, etc. se escriben a `agent_observability_events` con ese conversation_id.
- PERO el InterruptionTab en debug panel mostraba placeholder "Select a session to inspect the lock lifecycle" porque `case 'interruption':` pasaba hard-coded `conversationId={null}`.

Post-Plan-03:
- El mismo `sandboxLockSessionId` ahora fluye via prop chain sandbox-layout → DebugTabs → PanelContainer → InterruptionTab.
- InterruptionTab dispara `fetch('/api/observability/events?conversation_id={sandboxLockSessionId}&labels=lock_acquired,lock_acquire_failed_follower,...')`.
- El events route resuelve directamente via `conversation_id` (sin necesitar `session_id` — Pitfall 4 RESOLVED 2026-05-27 confirmo que `agent_observability_turns.conversation_id` es UUID NOT NULL sin FK).
- La tab renderiza los eventos con el visual del parent standalone (icons + variant badges + bogota-timestamp + JSON payload preview).

Esto satisface el output visual de **D-04** (verificar CKPTs firing) y **D-08** (real data en tab).

## Auth gates

Ninguno. El plan no requirio credenciales, OAuth, ni cron jobs.

## Deviaciones del plan

**Ninguna.** El plan se ejecuto verbatim segun el spec del 03-PLAN.md:

- LOC delta final +22/-5 ≈ target ~+15 (overshoot ligero por JSDoc completo en cada prop addition).
- Cero migraciones, cero feature flags, cero deps nuevas, cero archivos nuevos.
- Solo 3 archivos editados — exactamente los listados en frontmatter `files_modified` del 03-PLAN.md.
- Los 2 commits atomicos respetan el mapping task → commit del plan.

## Notas de implementacion

1. **`b463a876` como baseline de diff:** este es el commit del Plan 02 SUMMARY (no `main`). La rama `main` local esta atras del wave 6 (no contiene el archivo `interruption-tab.tsx` aun), entonces `git diff main` no es semanticamente comparable. El baseline correcto para validar D-15 (InterruptionTab byte-identico) es el HEAD pre-Plan-03 = Plan 02 SUMMARY commit.

2. **Parallel-execution context:** Plan 04 corre concurrentemente en la misma rama `exec/debounce-v2-wave6` modificando archivos NUEVOS en directorios `__tests__/`. Cero file overlap con Plan 03. Mis 2 commits + sus commits coexisten linealmente.

3. **JSDoc atribuible:** cada prop nuevo en las dos interfaces lleva JSDoc que cita explicitamente "Standalone: debounce-v2-sandbox-integration / Plan 03 (D-08)". Esto hace trivial el grep-de-trazabilidad para futuros mantenedores que necesiten entender por que existe el prop.

4. **`props.sandboxSessionId ?? null`** vs `props.sandboxSessionId`: el nullish coalescing es defensive — InterruptionTab acepta `conversationId: string | null` y queremos que `undefined` (cuando un futuro caller no provea el prop) caiga al placeholder UX, no rompa un type assertion. Cost = 0 LOC.

## Self-Check

- [x] `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` modificado — FOUND
- [x] `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` modificado — FOUND
- [x] `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` modificado — FOUND
- [x] Commit `782f56d7` (Task 3.1) — FOUND
- [x] Commit `0ca01a1d` (Task 3.2) — FOUND
- [x] InterruptionTab component file untouched vs b463a876 — verified (0 lines diff)
- [x] interruption-system-v2/ module untouched vs b463a876 — verified (0 lines diff)
- [x] Other case branches en panel-container.tsx no referencian sandboxSessionId — verified (grep returns 0)
- [x] TypeScript clean para los 3 archivos modificados — verified (cero errores `npx tsc --noEmit`)
- [x] D-01 + Regla 6: solo prop-threading; cero produccion code touched
- [x] D-08: cadena prop completa sandbox-layout → debug-tabs → panel-container → InterruptionTab
- [x] D-11: sessionId stays null (sandbox no crea agent_sessions rows)
- [x] D-15: InterruptionTab + modulo interruption-system-v2 byte-identicos
- [x] D-12: zero SQL migrations
- [x] D-13: sin feature flag

## Self-Check: PASSED

## Cross-reference a Plan 04 + Plan 05

- **Plan 04** (Wave 3b, runs concurrently in `exec/debounce-v2-wave6`) añade los integration tests vitest H1/H2/L1/L2/UI3. Sus tests validan que el HOLDER/FOLLOWER (Plan 02 Task 2.1) + long-poll endpoint (Plan 02 Task 2.2) emiten los eventos correctos a `agent_observability_events` con el conversation_id = sandboxLockSessionId que Plan 03 ahora wirea visualmente. Sin Plan 03, los tests pasan pero el debug-panel quedaria vacio en smoke manual — Plan 03 cierra el loop visual.

- **Plan 05** (verification + push, Wave 5) ejecuta los smokes E2E reales en sandbox UI con dos pestañas concurrentes. Confirma visualmente que el "Interruption" tab en Tab A muestra los eventos de Tab A solamente (D-09 isolation test) — cada pestaña tiene su propio sandboxLockSessionId y por tanto su propio conversation_id filter en el query a `/api/observability/events`. Plan 03 es prerequisito directo de Plan 05.

- **Push to Vercel (Regla 1):** se realizara como parte del Wave 5 / Plan 05 cuando se valide el behavior end-to-end (no por Plan 03 aisladamente, porque Plan 04 esta ejecutandose en paralelo y push prematuro fragmentaria el wave).
