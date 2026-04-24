---
phase: agent-forensics-panel
plan: 02
subsystem: observability-forensics
tags: [observability, ui, tabs, pure-function, whitelist, d-02, d-04, d-05]
status: shipped
completed_at: 2026-04-24T11:52:00Z
duration: ~20 min wall-clock (4 atomic tasks, no checkpoints)

dependency_graph:
  requires:
    - Plan 01 SHIPPED (TurnSummary.respondingAgentId + getDisplayAgentId helper available)
    - src/lib/observability/repository.ts (TurnDetail / TurnDetailEvent types)
    - src/components/ui/tabs.tsx (shadcn Tabs primitive, pre-existing)
    - src/app/actions/observability.ts (assertSuperUser pattern + isObservabilityEnabled gate)
  provides:
    - condenseTimeline(detail, respondingAgentId) pure function — consumed by Plans 03+04
    - CORE_CATEGORIES set (18) — source of truth for "mechanism-relevant" surface
    - MECHANISM_AI_PURPOSES set (8) — source of truth for AI call filter
    - CondensedTimelineItem type exported from src/lib/agent-forensics/condense-timeline
    - getForensicsViewAction server action — consumed by ForensicsTab today, by Plan 04 auditor later
    - DebugPanelTabs component — 3-tab scaffold (Forensics default / Raw / Auditor placeholder)
    - ForensicsTab placeholder hook point for <SessionSnapshot conversationId=...> (Plan 03 replace)
    - Auditor tab placeholder — Plan 04 replaces content
  affects:
    - Plan 03 (session snapshot): puede consumir conversationId ya recibido por ForensicsTab; reemplaza el placeholder al final del body.
    - Plan 04 (auditor): el tab Auditor existe como placeholder en tabs.tsx; reemplaza el contenido del TabsContent value="auditor".
    - Plan 05 (polish): shape UI estable, TurnDetailView intacto bajo Raw — zero regresiones.

tech_stack:
  added: []
  patterns:
    - Pure function filter (no I/O, no time, no state) — source-of-truth whitelist en UN archivo editable sin redeploy complicado
    - Discriminated server action result (disabled | ok) — mismo patron que getTurnsByConversationAction
    - Hand-rolled useEffect fetch + mountedRef + cancelled flag — zero new deps (matches turn-detail.tsx precedent)
    - Pre-computed summary en pure function → row renderer dumb (sin inline JSON.stringify)
    - Tabs shadcn con variant="line" + border-b-2 custom para underline active state
    - `void respondingAgentId` para señalar parametro reservado sin warning de unused

key_files:
  created:
    - src/lib/agent-forensics/condense-timeline.ts
    - src/lib/agent-forensics/__tests__/condense-timeline.test.ts (7 tests)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx
  modified:
    - src/app/actions/observability.ts (+49 lines — GetForensicsViewResult + getForensicsViewAction)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx (wrap right pane con DebugPanelTabs)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx (onSelectTurn signature +respondingAgentId)

decisions_confirmed:
  - D-02 misma ruta /whatsapp/...: el panel existente se envuelve con Tabs en vez de crear ruta nueva
  - D-04 whitelist de mecanismo: 18 categorias (16 core + classifier + error)
  - D-05 strict query exclusion: detail.queries nunca aparece en el condensed output
  - Regla 6 respetada: zero cambios a flujo conversacional, zero cambios a agents, zero writes a DB
  - Regla 3 respetada: server action no llama Supabase directo — delega a getTurnDetail del repository (instrumentado) y a la pure function condenseTimeline

metrics:
  commits_new: 4
  commit_range: dbefb06..06023ab
  files_created: 5
  files_modified: 3
  tests_added: 7 (condense-timeline)
  tests_suite_final: 160 passed / 7 skipped / 0 failed (unit suite, excluding 4 integration CRM bots requiring TEST_API_KEY)
  typescript_errors: 0

push:
  pushed_at: pending (post-SUMMARY)
  branch: main
  status: pending
---

# Phase agent-forensics-panel Plan 02: condensed timeline + ForensicsTab scaffold — Summary

One-liner: Agrega la logica pura `condenseTimeline(detail, respondingAgentId)` con whitelist de 18 categorias core + 8 AI purposes mecanicos, el server action super-user-gated `getForensicsViewAction`, y el scaffold de 3 tabs (Forensics default / Raw / Auditor placeholder) en el debug panel. El tab Forensics muestra header con responding agent + entry agent (cuando difieren), counters, y timeline condensado. Queries SQL ocultas totalmente (D-05); Raw tab conserva el TurnDetailView intacto a un click de distancia.

## Task Execution

| Task | Descripcion                                                            | Commit    | Estado       |
| ---- | ---------------------------------------------------------------------- | --------- | ------------ |
| 1    | condense-timeline.ts + tests vitest (RED→GREEN, 7/7 verde)             | `dbefb06` | ✅ 7/7 tests |
| 2    | observability.ts extendido con getForensicsViewAction + result union   | `69181cf` | ✅ typecheck |
| 3    | tabs.tsx + condensed-timeline.tsx + forensics-tab.tsx (3 componentes)  | `ed490fb` | ✅ typecheck |
| 4    | index.tsx wrap Tabs + turn-list.tsx propaga respondingAgentId callback | `06023ab` | ✅ 160 tests |

Rango: `dbefb06..06023ab`. Nota: entre mis commits 2 y 3 aparece un commit del usuario `d3e1948 feat(pedidos): aplicar tokens de Claude Design al kanban real` — NO pertenece a Plan 02, es trabajo paralelo del usuario en el retrofit Pedidos. No afecta este plan.

## Artifacts Created

### Pure function + tests
- `src/lib/agent-forensics/condense-timeline.ts` — 170 lineas:
  - `CORE_CATEGORIES: ReadonlySet<string>` (18 entries).
  - `MECHANISM_AI_PURPOSES: Set<string>` (8 entries).
  - `condenseTimeline(detail, respondingAgentId): CondensedTimelineItem[]`.
  - `summarizeEvent(e)` helper con branches por categoria (pipeline_decision / template_selection / guard / mode_transition / comprehension / tool_call / session_lifecycle / error / default).
  - `slim(obj, keys)` helper para reducir payload antes de JSON.stringify.
- `src/lib/agent-forensics/__tests__/condense-timeline.test.ts` — 7 tests (whitelist, D-05, sort, mechanism AI filter, summaries, error always, rest whitelist).

### UI components
- `tabs.tsx` — `DebugPanelTabs({ turnId, startedAt, respondingAgentId, conversationId })` con Tabs shadcn variant="line", Forensics default.
- `condensed-timeline.tsx` — `CondensedTimeline({ items })` row renderer dumb; `CondensedRow` con anchor EVT (cyan) / AI (purple), sequence padded a 3 digitos, summary precomputado.
- `forensics-tab.tsx` — `ForensicsTab` con hand-rolled fetch + mountedRef (matches turn-detail.tsx), 4 view states (loading/disabled/error/data). Header muestra `getDisplayAgentId(turn)` + `(entry: X)` badge cuando difiere del responding, counters (ms/tok/$/items/ERROR). Body scrollable con `<CondensedTimeline>` + snapshot placeholder para Plan 03.

## Artifacts Modified

### Server action
- `src/app/actions/observability.ts` — imports extendidos con condenseTimeline + CondensedTimelineItem; append `GetForensicsViewResult` discriminated union + `getForensicsViewAction(turnId, startedAt, respondingAgentId)` (49 lineas nuevas).

### UI integration
- `index.tsx` — remueve import `TurnDetailView`, agrega import `DebugPanelTabs`, state `selectedTurn` extendido con `respondingAgentId: string | null`, callback `onSelectTurn` 3-ario, right pane renderiza `<DebugPanelTabs>` en lugar de `<TurnDetailView>` directo.
- `turn-list.tsx` — interface `onSelectTurn` con 3er parametro `respondingAgentId`; call-site propaga `turn.respondingAgentId ?? null`.

## Dimensionamiento del condensed timeline

Con el whitelist de 18 categorias + 8 AI purposes, un turn tipico de somnio-recompra-v1 con ~19 events / ~22 queries SQL / 1 AI call condensa a:
- Queries: 0 items (D-05 excluye 100%).
- Events: depende del tipo de turn — un turn de pipeline typical muestra 3-6 items (pipeline_decision + template_selection + comprehension + pre_send_check, a veces + mode_transition o guard).
- AI calls: 1 item si el purpose es mechanism (comprehension/classifier/etc).

Estimado: **~4-8 items condensed vs ~42 items raw (19 EVT + 22 SQL + 1 AI)**, o sea reduccion de ~80-90% del ruido visual. El numero exacto dependera del turn — la verificacion observable vive en el tab Forensics mismo ("N items" en el header).

## Deviations from Plan

Ninguna desviacion de categorias Rule 1/2/3. El plan se ejecuto literal:

1. **Test file — shape ajustada al tipo TurnDetail real.** Los helpers `makeEvent`/`makeAiCall` del plan pedian campos minimos; agregue los campos requeridos por las interfaces `TurnDetailEvent` + `TurnDetailAiCall` (`promptVersionId`, `messages`, `responseContent`, `cacheCreation/ReadInputTokens`, `totalTokens`, `costUsd`, `statusCode`, `error`) para que los tests pasen con `detail as any` cast sin depender de que TypeScript tolere objetos parcialmente construidos.
2. **tabs.tsx — `variant="line"` aprovecha la API nativa del shadcn Tabs del repo.** El Tabs.tsx del proyecto (leido antes de escribir) tiene `tabsListVariants` con un variant `line` que quita el fondo gris y usa underline via `::after`. Seleccionar `variant="line"` da el look "border-b-2 underline" mas limpio que forzar classes `bg-transparent` a pelo. Preserve tambien las classes `rounded-none border-b-2 border-transparent data-[state=active]:border-primary` para garantizar el underline incluso si en el futuro el variant cambia.
3. **`index.tsx` import cleanup — `TurnDetailView` ya no se importa directamente.** Verificado con `grep -q "TurnDetailView" index.tsx` → cero matches. El componente vive ahora dentro de tabs.tsx bajo `<TabsContent value="raw">`.

No hubo auth gates durante la ejecucion.

## CLAUDE.md / Regla Compliance

- **Regla 0 (GSD completo):** TDD RED→GREEN cumplido en Task 1; commits atomicos por task; cada verify block corrido.
- **Regla 1 (push a Vercel):** push pendiente post-SUMMARY (siguiente accion).
- **Regla 3 (domain layer):** N/A — Plan 02 no muta DB. `condenseTimeline` es pure function; `getForensicsViewAction` delega a `getTurnDetail` del repository (read-only via `createRawAdminClient`).
- **Regla 6 (proteger agente en produccion):** satisfecha. Zero modificaciones a flujo conversacional, zero cambios a agents (somnio-v3, somnio-recompra-v1, godentist, crm-reader, crm-writer), zero cambios a webhooks, zero cambios a prompts/transitions. Todos los artefactos son UI-only + pure-function + read-only server action.

## Test Results

**Unit suite final (excluyendo integration CRM bots que requieren `TEST_API_KEY`):**
- `Test Files: 16 passed (16)`
- `Tests: 160 passed (160)`
- `Duration: 55.22s`

**Integration CRM bots (skipped por env vars faltantes, mismo que Plan 01):**
- `src/__tests__/integration/crm-bots/security.test.ts` — `TEST_WORKSPACE_ID` + `TEST_API_KEY` missing (pre-existente).
- `src/__tests__/integration/crm-bots/ttl-cron.test.ts` — idem.
- `src/__tests__/integration/crm-bots/writer-two-step.test.ts` — idem.
- `src/__tests__/integration/crm-bots/reader.test.ts` — idem.

**Typecheck:** `npx tsc --noEmit` → 0 errors.

**Tests nuevos Plan 02:** 7/7 passed (condense-timeline).

## Push Confirmation

Pendiente: `git push origin main` post-SUMMARY.

## Smoke Test Guidance (para el usuario)

Cuando Vercel confirme deploy Ready:

1. Abrir un conversation inbox de un workspace Somnio con cliente (`contacts.is_client=true`).
2. Abrir "Debug bot" panel.
3. Seleccionar un turn reciente post-push.
4. **Verificar:**
   - Aparecen 3 tabs arriba del detail pane: **Forensics** (selected por default) / **Raw** / **Auditor**.
   - Tab Forensics muestra header con `somnio-recompra-v1` + badge `(entry: somnio-v3)` si aplica + trigger kind + counters (ms/tok/$/N items/ERROR).
   - Body muestra 3-10 items condensados (sin SQL queries), cada fila con sequence + EVT/AI anchor + category + label + summary.
   - Al final del body: placeholder italic "Snapshot de session_state — disponible en Plan 03".
5. Click tab **Raw**: muestra el TurnDetailView original intacto (19ev + 22q + 1ai como antes).
6. Click tab **Auditor**: muestra placeholder italic "Auditor AI — disponible en Plan 04".

## Notes para Plans 03/04/05

- **Plan 03 (session snapshot):** `ForensicsTab` ya recibe `conversationId` como prop. Reemplazar el placeholder que vive al final del body (buscar string "Snapshot de session_state — disponible en Plan 03") con `<SessionSnapshot conversationId={conversationId} />`. No tocar el header ni el scroll behavior.
- **Plan 04 (auditor):** el tab Auditor ya esta en `tabs.tsx`. Reemplazar el contenido del `<TabsContent value="auditor">` con el componente que orqueste la API route `/api/agent-forensics/audit`. Plan 04 tambien RE-AGREGA el bloque `outputFileTracingIncludes` al `next.config.ts` cuando cree la route (rollback de Plan 01 Task 8 documentado en 01-SUMMARY.md post-ship issues).
- **Plan 05 (polish/SUMMARY de fase):** 
  - `condenseTimeline` es el unico sitio donde modificar el whitelist. Si Plan 05 descubre categorias adicionales necesarias, actualizar `CORE_CATEGORIES` + agregar test case correspondiente en condense-timeline.test.ts.
  - El prop `respondingAgentId` en `condenseTimeline` es `void` pero reservado — Plan 04 auditor puede activarlo con logica per-bot sin breaking change de signature.

## Self-Check: PASSED

Verificacion de artifacts:

```
FOUND: src/lib/agent-forensics/condense-timeline.ts
FOUND: src/lib/agent-forensics/__tests__/condense-timeline.test.ts
FOUND: src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx
FOUND: src/app/(dashboard)/whatsapp/components/debug-panel-production/condensed-timeline.tsx
FOUND: src/app/(dashboard)/whatsapp/components/debug-panel-production/forensics-tab.tsx
```

Verificacion de commits:

```
FOUND: dbefb06 (Task 1 — condense-timeline + tests)
FOUND: 69181cf (Task 2 — getForensicsViewAction)
FOUND: ed490fb (Task 3 — 3 componentes UI)
FOUND: 06023ab (Task 4 — integracion index.tsx + turn-list.tsx)
```

Todos los claims verificables. Plan cerrado; falta push atomico.
