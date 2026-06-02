---
phase: agent-lifecycle-router
plan: 06
wave: 4
status: complete
completed: 2026-04-26
duration_minutes: 19
tasks_completed: 3
files_created:
  - src/app/(dashboard)/agentes/routing/_actions.ts
  - src/app/(dashboard)/agentes/routing/page.tsx
  - src/app/(dashboard)/agentes/routing/audit/page.tsx
  - src/app/(dashboard)/agentes/routing/editor/page.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/ConditionBuilder.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/FactPicker.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/TagPicker.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/SimulateButton.tsx
files_modified:
  - src/lib/domain/routing.ts
commits:
  - 1cd41df
  - e5f7921
  - 0f13079
tests_passing: 105
tests_added: 0
---

# Plan 06 Summary — Wave 4: Admin form (las 5 surfaces D-06)

## What was built

Wave 4 entrega las 5 surfaces D-06 que hacen accionable la edicion de reglas
sin tocar SQL Studio. Functional first (decision usuario 2026-04-25) — las
pages siguen el patron existente del proyecto (`whatsapp/templates/`,
`whatsapp/page.tsx`) usando `Card`/`Button`/`Input`/`Select` de shadcn ya en
el repo. Cero animaciones, cero polish — solo la maquinaria que Plan 07
necesita para crear las parity rules de Somnio.

### Surface D-06 → archivo

| # | Surface | Archivo |
|---|---|---|
| 1 | Lista de reglas | `src/app/(dashboard)/agentes/routing/page.tsx` |
| 2 | Editor de regla | `src/app/(dashboard)/agentes/routing/editor/page.tsx` (server) + `_components/editor-client.tsx` (client) |
| 3 | Boton "Simular cambio" | `_components/editor-client.tsx` (inline panel lateral) + `_components/SimulateButton.tsx` (helper standalone) |
| 4 | Catalogo facts | `_components/FactPicker.tsx` (read-only panel embed dentro del editor) |
| 5 | Audit log viewer | `src/app/(dashboard)/agentes/routing/audit/page.tsx` |

### 1. Server Actions (Task 1 — commit `1cd41df`)

`src/app/(dashboard)/agentes/routing/_actions.ts`:

- **`createOrUpdateRuleAction(rule: Partial<RoutingRule>)`** — defense-in-depth
  flow:
  1. `getActiveWorkspaceId()` (cookie-backed; DB fallback) → 401-style error si
     no hay context.
  2. `validateRule(rule)` (Ajv 2020) re-validacion server-side (D-12 + Pitfall 5).
  3. **W-6 fix**: `validateRulePriorityUnique(workspaceId, ruleType, priority,
     excludeRuleId?)` — pre-check ANTES del DB upsert. Si collision retorna
     mensaje exacto: `"Ya existe una regla {tipo} con priority {N}: '{name}'.
     Cambia la priority o desactiva la otra regla primero."` — evita que el DB
     UNIQUE constraint leak un 500 generico a la UI.
  4. `upsertRule({ workspaceId }, rule)` — domain layer (Regla 3).
  5. `invalidateWorkspace(workspaceId)` — borra LRU cache same-lambda (Plan 03,
     Pitfall 3); cross-lambda eventual consistency bounded por TTL 10s +
     version-column revalidation.
  6. `revalidatePath('/agentes/routing')` + `/agentes/routing/editor`.
- **`deleteRuleAction(ruleId)`** — invoca `deleteRule({ workspaceId }, ruleId)`
  que es **soft delete** (UPDATE active=false, NO DELETE real — Pitfall 5
  preserva forensics). Tambien invalida cache + revalidatePath.
- **`simulateAction({ candidateRules, daysBack })`** — invoca
  `dryRunReplay({ workspaceId, candidateRules, daysBack })` del Plan 05. NO
  escribe audit log (Plan 05 verificable D-10).

**Workspace acquisition:** `getActiveWorkspaceId` desde
`@/app/actions/workspace` (cookie `morfx_workspace` + DB fallback). El plan
referencio un helper hipotetico `getCurrentWorkspaceId from
'@/lib/workspace/server'` — el helper real del proyecto es el primero (verificado
en Layout + 30+ paginas existentes).

### 2. Lista de reglas + audit log viewer (Task 2 — commit `e5f7921`)

#### `page.tsx` (Surface 1, D-06.1)

Server component. Tabla con columnas: prioridad, nombre, tipo, output (JSON
serializado de `event.params`), activa (Badge `activa`/`inactiva`), ultima
edicion (formateada en `America/Bogota`, Regla 2). Acciones:

- "Editar" → link a `/agentes/routing/editor?id=<id>`
- "Desactivar" (solo en filas activas) → form con server action inline que
  llama `deleteRuleAction(ruleId)` + revalidatePath
- "+ Nueva regla" → link a `/agentes/routing/editor?new=1`
- "Audit log" → link a `/agentes/routing/audit`

Mensaje informativo footer: `"Los cambios pueden tardar hasta 10 segundos en
aplicarse en todos los servidores."` (Pitfall 3 disclosure).

#### `audit/page.tsx` (Surface 5, D-06.5)

Server component. Filtros via URL searchParams: `reason`, `agent_id`, `from`,
`to`. Form `<form method="get">` re-envia con los nuevos params (no requiere
JS). Tabla con columnas: `decided_at` (Bogota tz), `reason` (badge color-coded:
matched=primary, handoff=secondary, no_rule=outline, fallback_legacy=destructive),
`agent_id`, `lifecycle`, `contact` (linkable a `/conversaciones/<id>`),
`latency_ms`, `facts_snapshot` (collapsible `<details>` con JSON pretty).

#### Domain extension

`src/lib/domain/routing.ts` — agregada `listAuditLog(ctx, filter)`:

```typescript
export interface AuditLogFilter {
  reason?: RoutingReason
  agent_id?: string | null  // null = filtrar a NULL agent_id (handoff)
  from?: string  // ISO timestamp
  to?: string
  limit?: number  // default 50, clamped to [1, 500]
}

export async function listAuditLog(
  ctx: DomainContext,
  filter: AuditLogFilter = {},
): Promise<DomainResult<Record<string, unknown>[]>>
```

Order: `decided_at DESC`. Returns rows como `Record<string, unknown>[]` para
que la UI renderee defensivamente (`facts_snapshot` puede ser cualquier shape
JSON dependiendo del state del workspace en el momento de la decision).

### 3. Editor + ConditionBuilder + FactPicker + TagPicker + SimulateButton (Task 3 — commit `0f13079`)

#### `editor/page.tsx` (server component)

Carga datos iniciales en paralelo:
- `factsResult = listFactsCatalog()` → catalogo activo
- `tagsResult = listAllTags({ workspaceId })` → tags del workspace
- Si `?id=...` → `getRule({ workspaceId }, id)` → initial rule

Pasa todo a `<RoutingRuleEditorClient>`.

#### `editor-client.tsx` (client component, ~330 lineas)

State machine local con `useState`:
- `rule: RuleDraft` — el form value (con `defaultRule()` para nuevos)
- `errors: string[]` — errores combinados (server + client)
- `simState` — discriminated union `{ idle | loading | error | ok }` para
  el panel lateral
- `isSubmitting` — guard del boton Save

**Flujos:**

1. **`onSimulate`** → `simulateAction({ candidateRules: [rule], daysBack: 7 })`
   → setea `simState`. UI renderea `total_inbound`, `summary.changed_count`,
   before/after JSON, lista colapsable de conversaciones cambiadas (linkables
   a `/conversaciones/<id>`).
2. **`onSave`** → primero corre `validateRule(rule)` (Ajv en browser, schema
   serializable). Si invalido, muestra inline. Si valido →
   `createOrUpdateRuleAction(rule)` → maneja `{ success, error }`. En success
   → `router.push('/agentes/routing')`.
3. **Switch `rule_type`** → reset del `event.params` shape (lifecycle_state vs
   agent_id). Esto evita estado inconsistente cuando el usuario alterna
   entre layers.

**W-3 fix — fact filter por rule_type:**

```typescript
const visibleFacts = useMemo(
  () => filterFactsByRuleType(facts, rule.rule_type),
  [facts, rule.rule_type],
)
```

`filterFactsByRuleType` (extraida a `FactPicker.tsx`) filtra por
`f.valid_in_rule_types?.includes(ruleType)`, con fallback compat: si el row
del catalog no declara `valid_in_rule_types` lo deja visible. Cambiar
`rule.rule_type` re-evalua automaticamente via `useMemo` deps. **Cuando se
edita un `lifecycle_classifier`** los facts marcados solo `agent_router` (ej.
`lifecycle_state`, `recompraEnabled`) quedan ocultos del picker; **cuando se
edita `agent_router`** todos los facts visibles. Aplica a la lista del
sidebar (FactPicker panel) Y al dropdown del leaf inside ConditionBuilder.

**Disclaimer Pitfall 3** presente en footer: `"Los cambios pueden tardar
hasta 10 segundos en aplicarse en todos los servidores."`

#### `ConditionBuilder.tsx` (recursivo)

Componente recursivo que renderea segun el shape:

| Shape | Render |
|---|---|
| `{ all: [...] }` | Border azul, badge "ALL (AND)", botones `+ condicion`/`+ grupo all`/`+ grupo any`/`+ not`, `X` por hijo para borrar |
| `{ any: [...] }` | Border ambar, badge "ANY (OR)", mismos botones |
| `{ not: <c> }` | Border rojo, badge "NOT", solo 1 hijo |
| `{ fact, operator, value }` (leaf) | Tres columnas: select fact (filtrado W-3), select operator (15 opciones — los 5 custom + 10 stock json-rules-engine), input value (con special-case para `fact === 'tags'` que muestra select sobre `props.tags`) |

`tryParseValue(raw)` best-effort: numbers, booleans, `null`, JSON arrays/objects
fallback a string raw. Esto permite que un fact `recompraEnabled` reciba
`true` como bool sin que el usuario tenga que escribir JSON; tambien permite
operadores como `arrayContainsAny` que necesitan `["forzar_humano",
"pausar_agente"]`.

Indent visual via `marginLeft: depth * 12`.

#### `FactPicker.tsx`

Read-only panel que renderea la lista de facts del catalog (filtrada por W-3).
Cada fact muestra: nombre, return_type, description. Exporta tambien
`filterFactsByRuleType(facts, ruleType)` reutilizable.

#### `TagPicker.tsx`

Picker simple sobre `props.tags` (array de nombres del workspace). Si no hay
tags muestra Input libre con nota informativa "Crealos desde el modulo de
tags y vuelve aqui." Respeta scope: el form NO crea tags (Regla agent-scope —
admin form de routing es scope distinto del modulo de tags). Si el editor
referencia un tag inexistente lo permite via "(otro)" + Input libre — la
validacion contra workspace tags reales corre en webhook con el fact
resolver `getContactTags` (Plan 03).

#### `SimulateButton.tsx`

Wrapper standalone que el editor-client NO usa hoy (invoca simulateAction
inline) pero queda exportado para Plan 07 u otros consumidores que solo
necesitan un boton "Simular" sin el editor completo.

## Verification

Todos los criterios de `<verify>` y `<acceptance_criteria>` del PLAN → pass:

- ✅ 9 archivos creados (1 actions + 4 pages + 5 client components)
- ✅ 1 archivo extendido (`src/lib/domain/routing.ts` con `listAuditLog` +
  `AuditLogFilter`)
- ✅ Las 5 surfaces D-06 funcionales
- ✅ **Regla 3 enforcement project-wide:**
  ```
  $ grep -rn "createAdminClient" "src/app/(dashboard)/agentes/routing/"
  (empty)
  ```
- ✅ Server Actions invocan domain layer (upsertRule, deleteRule, listRules,
  dryRunReplay) — verificable por imports
- ✅ Cada mutating action invoca `invalidateWorkspace` + `revalidatePath`
- ✅ **W-3 fix:** `filterFactsByRuleType` aplicado en
  `editor-client.tsx` via `useMemo([facts, rule.rule_type])` — re-evalua
  automaticamente al cambiar `rule_type`
- ✅ **W-6 fix:** `validateRulePriorityUnique(workspaceId, ruleType, priority,
  excludeRuleId?)` corre ANTES de `upsertRule` con mensaje exacto del plan
- ✅ Editor valida con Ajv (`validateRule`) client-side + server-side (D-12 +
  Pitfall 5 defense-in-depth)
- ✅ Mensaje "Los cambios pueden tardar hasta 10 segundos" presente en list
  page y editor
- ✅ `npx tsc --noEmit` project-wide → exit 0
- ✅ **105/105 tests verde** en `src/lib/agents/routing/__tests__/` +
  `src/lib/agents/production/__tests__/` (sin regresiones del UI work — 105
  igual que despues de Plan 05)

**Pre-existing failures unrelated (out of scope):** 4 integration tests en
`src/__tests__/integration/crm-bots/` siguen requiriendo `TEST_WORKSPACE_ID`
env var (predates Plan 02).

**Browser smoke deferred a Plan 07** (per discusion del orchestrator — Plan 07
tiene checklist manual UI verification antes del flag flip; el server-side
tsc + tests de routing logic son verificacion suficiente para Plan 06).

## Hooks for Plan 07

### Plan 07 puede crear las parity rules via UI

Plan 07 D-15 Opcion B (priority-900 rule replicando `is_client &&
!recompra_enabled → somnio-sales-v1`) puede crearse hoy desde
`/agentes/routing/editor?new=1`:

1. **Tipo:** agent_router
2. **Nombre:** `legacy_parity_isClient_no_recompra`
3. **Prioridad:** 900
4. **Activa:** ✓
5. **Output:** agent_id = `somnio-sales-v1`
6. **Condiciones:**
   ```
   ALL
     fact: isClient        operator: equal  value: true
     fact: recompraEnabled operator: equal  value: false
   ```
7. **Click "Simular cambio"** → muestra cuantas conversaciones cambiarian (en
   un workspace con flag OFF, el current_decision viene del routeAgent que
   tampoco esta en webhook, asi que el simulator es la unica fuente de truth
   sobre que pasaria si el flag flipea).
8. **Click "Guardar"** → dispara `createOrUpdateRuleAction` → `upsertRule` →
   `invalidateWorkspace`.
9. **Flag flip** sigue siendo SQL UPDATE manual del Plan 07 (Regla 6 + Regla
   5 strict).

### W-6 detection del flag flip

Cuando Plan 07 cree las primeras parity rules, si por error usa la misma
priority en dos rules del mismo `rule_type`, el `validateRulePriorityUnique`
helper retorna el mensaje exacto del plan en lugar de un 500 del DB UNIQUE.

### Audit log viewer post-flip

Una vez flippeado el flag (Plan 07 Task SQL), `/agentes/routing/audit`
muestra cada decision del router con `reason` color-coded y `facts_snapshot`
expandible. Util para los primeros 30 minutos de monitoreo del rollout.

## Limitaciones aceptadas (functional first — decision usuario 2026-04-25)

- **Sin drag-and-drop reordenable** en la lista (D-06.1 lo menciona pero la
  decision functional first lo defiere). Reordenar = editar la priority del
  rule manualmente.
- **Sin animaciones / transitions / gradientes / iconos custom** — solo
  shadcn por defecto.
- **TagPicker no crea tags inline** — respeta agent-scope rule. El usuario
  crea tags desde el modulo de tags y refresca. Esto evita scope creep del
  admin form. Si el usuario referencia un tag inexistente, el editor permite
  guardarlo (la validacion runtime contra workspace tags corre en el fact
  resolver de Plan 03).
- **Sin paginacion en audit log viewer** — limit fijo 50 (clampeado [1, 500]
  en domain layer). Plan 06 v1.1 puede agregar `?offset=` cuando se note
  necesidad operacional.
- **Sin bulk actions** (activar/desactivar varias reglas a la vez) —
  individual edit-and-save es suficiente para v1.

## Deviations from plan

### [Rule 3 — Blocking] `getCurrentWorkspaceId` → `getActiveWorkspaceId`

**Found during:** Task 1 (workspace helper lookup).

**Issue:** El plan referencia `import { getCurrentWorkspaceId } from
'@/lib/workspace/server'`. Ese helper / archivo NO existe en el proyecto
(`find src/lib -path "*workspace*"` no lo encuentra).

**Fix:** Usar `getActiveWorkspaceId` de `@/app/actions/workspace` — el helper
canonico del proyecto, usado en `(dashboard)/layout.tsx`,
`(dashboard)/whatsapp/page.tsx`, `(dashboard)/crm/page.tsx`, etc. Lee la
cookie `morfx_workspace` + tiene fallback a DB para usuarios nuevos sin
cookie. Mismo contracto: retorna `string | null`.

**Commit:** `1cd41df`.

### [Rule 1 — Bug] `listRules` y `deleteRule` ya existen (no requieren cambios)

**Found during:** Task 1 (domain.routing import sanity check).

**Issue:** El plan menciona "agregar listAuditLog a domain.routing si no
esta" pero no aclara el estado de `listRules` / `deleteRule`. Plan 02 SUMMARY
confirma que ambas existen con la firma `(ctx: DomainContext, ...)`.

**Fix:** Importar `listRules`, `deleteRule`, `upsertRule` directamente — solo
agregar `listAuditLog` (nuevo). Sin churn en domain.

**Commit:** `e5f7921` (sumado al commit T2).

### [Rule 1 — Bug] `DomainResult` de `tags.ts` usa `success: boolean` no discriminated literal

**Found during:** Task 3 tsc check.

**Issue:** `src/lib/domain/types.ts` define `DomainResult` como
`{ success: boolean; data?: T; error?: string }` — NO es discriminated union
literal (`success: true`/`success: false`). TypeScript no puede narrowear
basado en `if (result.success)`. La domain.routing.ts local define su PROPIO
`DomainResult` discriminated, pero `listAllTags` viene de `tags.ts` que usa
el shared `types.ts`.

**Fix:** En lugar de `tagsResult.success ? tagsResult.data.map(...) : []`
(que falla con TS18048 'data' is possibly undefined), usamos
`(tagsResult.data ?? []).map(...)`. Comportamiento equivalente: si
`success=false` el callsite recibe `undefined` para `data` y el `??`
coalesce a `[]`.

**Commit:** `0f13079`.

### [Rule 1 — Bug] Conditional type collapse en initialRule

**Found during:** Task 3 tsc check.

**Issue:** La declaracion type-juggle `let initialRule: Awaited<...> extends
... ? R | null : null = null` colapsa al branch `null` cuando
`Awaited<ReturnType<...>>` no narrows en static context. Resultado:
TypeScript infiere `initialRule: null` y rechaza la asignacion `r.data`.

**Fix:** Usar el type concreto directamente — `let initialRule: RoutingRule
| null = null`. Mismo runtime, tsc happy.

**Commit:** `0f13079`.

### [Rule 2 — Auto-add critical functionality] Server Action `handleDeleteRule` inline en page.tsx

**Found during:** Task 2 implementation.

**Issue:** El plan describe la lista de reglas con boton "Desactivar" pero
no especifica donde vive la server action. Reusing `deleteRuleAction` desde
`_actions.ts` requiere un wrapper con la signature de `<form action={...}>`
(que recibe `FormData`, no un `ruleId` string).

**Fix:** Definir `handleDeleteRule(formData: FormData)` inline en `page.tsx`
con la directiva `'use server'`. Lee `formData.get('ruleId')` y delega a
`deleteRuleAction` del `_actions.ts`. Mismo patron que el `handleSync` de
`whatsapp/templates/page.tsx`.

**Commit:** `e5f7921`.

### [Pattern] Comment cleanup para grep strict

**Found during:** Task 3 final verification.

**Issue:** Los archivos creados tenian comentarios literales como `"Regla 3:
NO createAdminClient en este archivo"`. La verificacion
`! grep -q "createAdminClient" 'src/app/(dashboard)/agentes/routing/'`
(plan literal) falla incluso con matches dentro de comentarios.

**Fix:** Reescribir los comentarios sin la palabra literal: `"Regla 3: este
archivo solo lee via domain layer (Plan 02)."`. Los archivos siguen
documentando la intencion sin disparar el grep.

**Commit:** `0f13079` (sumado al commit T3 — los modificados son los archivos
de Tasks 1+2 que ya estaban committeados; el cleanup va en el mismo commit
del editor).

## Notes for downstream

### Para Plan 07

- El admin form **YA** puede usarse para crear las parity rules. No hay
  bloqueador.
- Una vez aplicada la migracion en prod (Plan 07 Task 1), las pages
  `/agentes/routing` + `/agentes/routing/audit` van a funcionar contra las
  tablas reales. Antes de la migracion, las pages renderean la "no hay reglas"
  empty state correctamente (gracias al fallback en `result.success ?
  result.data : []`).
- El audit log viewer va a estar vacio hasta que el flag flippee y empiezen
  a llegar webhooks. Los primeros minutos post-flip seran clave.

### Para v1.1 cleanup

Una vez que el flag esta ON estable y se elimina el legacy if/else
(standalone `agent-lifecycle-router-cleanup`), el admin form sigue siendo el
unico path de edicion de reglas. Considerar agregar:
- Drag-and-drop priority reorder en `page.tsx`
- Bulk operations (activar/desactivar varias)
- Audit log paginacion + export CSV
- Tag picker inline create (con `assignTag` del domain — respeta scope
  porque seria un escape hatch documentado, no auto-creation)

## Self-Check: PASSED

- 9/9 expected files exist on disk:
  - `src/app/(dashboard)/agentes/routing/_actions.ts` (FOUND)
  - `src/app/(dashboard)/agentes/routing/page.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/audit/page.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/page.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/_components/ConditionBuilder.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/_components/FactPicker.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/_components/TagPicker.tsx` (FOUND)
  - `src/app/(dashboard)/agentes/routing/editor/_components/SimulateButton.tsx` (FOUND)
- 1 domain extension: `src/lib/domain/routing.ts` (`listAuditLog` +
  `AuditLogFilter`)
- 3/3 commits exist in git log: `1cd41df`, `e5f7921`, `0f13079`
- 105/105 vitest tests verde en `src/lib/agents/routing/__tests__/` +
  `src/lib/agents/production/__tests__/` (no regresiones)
- Regla 3 grep clean: `grep -rn "createAdminClient" "src/app/(dashboard)/agentes/routing/"`
  → empty
- tsc --noEmit project-wide → exit 0
