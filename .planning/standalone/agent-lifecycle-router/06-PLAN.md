---
phase: agent-lifecycle-router
plan: 06
type: execute
wave: 4                       # B-4 wave shift: was 3, now 4
depends_on: [03, 05]           # Plan 03 cache invalidate + Plan 05 dry-run; transitively 02 + 01
files_modified:
  - src/app/(dashboard)/agentes/routing/page.tsx
  - src/app/(dashboard)/agentes/routing/editor/page.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/ConditionBuilder.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/FactPicker.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/TagPicker.tsx
  - src/app/(dashboard)/agentes/routing/editor/_components/SimulateButton.tsx
  - src/app/(dashboard)/agentes/routing/audit/page.tsx
  - src/app/(dashboard)/agentes/routing/_actions.ts
autonomous: true
requirements_addressed: [ROUTER-REQ-06, ROUTER-REQ-12]
user_setup: []

must_haves:
  truths:
    - "Las 5 surfaces D-06 existen como rutas: lista de reglas (`/agentes/routing`), editor de regla (`/agentes/routing/editor?id=...` o `?new=1`), audit log viewer (`/agentes/routing/audit`). Catalog de facts es un panel embed dentro del editor (read-only). Boton 'Simular cambio' es un componente del editor."
    - "TODAS las mutaciones van via Server Actions en `_actions.ts` que invocan `src/lib/domain/routing.ts` (Regla 3). NUNCA `createAdminClient` en componentes UI o routes. Verificable: `grep -rn 'createAdminClient' 'src/app/(dashboard)/agentes/routing/'` retorna VACIO."
    - "Server actions: `createOrUpdateRuleAction(rule)`, `deleteRuleAction(ruleId)`, `simulateAction(candidateRules)`. Cada una llama `revalidatePath('/agentes/routing')` post-write y `invalidateWorkspace(workspaceId)` (Plan 03 cache) para que el siguiente webhook vea reglas frescas inmediatamente en la misma lambda."
    - "Editor valida con Ajv (`validateRule` import de Plan 02) BEFORE `createOrUpdateRuleAction`. Errores se muestran inline. NO permite submit con rule invalida."
    - "Boton 'Simular cambio' invoca Server Action que llama `dryRunReplay({ workspaceId, candidateRules: [editedRule + activeRules], daysBack: 7 })`. Resultado se renderea en panel lateral del editor: changed_count, before/after distribution, lista de conversation_ids afectadas (clickable a `/conversaciones/<id>`)."
    - "Tag picker autocompleta sobre tags existentes en el workspace (lectura via domain layer). Boton 'Crear tag nuevo' inline llama domain `assignTag` o crea tag standalone (verificar API existente). Tag queda disponible immediatamente en el select sin recargar pagina."
    - "Audit log viewer pagina la tabla `routing_audit_log` por (workspace_id, decided_at DESC), default 50 rows. Filtros: reason, lifecycle_state, agent_id, fecha. Cada row muestra facts_snapshot expandible."
    - "Funcionalidad primero — la UI sigue patrones de las admin pages existentes (ver `src/app/(dashboard)/configuracion/whatsapp/templates/builder/`). NO se invierte tiempo en UI polish (decision usuario 2026-04-25)."
    - "W-3 fix: el FactPicker en el editor FILTRA facts por `valid_in_rule_types` segun el rule_type seleccionado. Cuando se edita un `lifecycle_classifier`, los facts con `valid_in_rule_types=ARRAY['agent_router']` (ej: lifecycle_state, recompraEnabled) se OCULTAN. Cuando se edita `agent_router`, todos los facts visibles. Filtro en el cliente, no requiere round-trip."
    - "W-6 fix: server action createOrUpdateRuleAction invoca un helper validateRulePriorityUnique(workspaceId, ruleType, priority, excludeRuleId?) ANTES de upsertRule. En collision retorna { success: false, error: 'Ya existe una regla {tipo} con priority {N}: <rule.name>. Cambia la priority o desactiva la otra regla primero.' } — error inline en form, NO 500 del DB UNIQUE constraint."
    - "B-4 fix: este plan SOLO importa `listAllTags` desde `@/lib/domain/tags` (creada por Plan 02 Task 3). NO crea ni extiende domain functions."
  artifacts:
    - path: "src/app/(dashboard)/agentes/routing/_actions.ts"
      provides: "Server Actions: createOrUpdateRuleAction, deleteRuleAction, simulateAction"
      exports: ["createOrUpdateRuleAction", "deleteRuleAction", "simulateAction"]
    - path: "src/app/(dashboard)/agentes/routing/page.tsx"
      provides: "Surface 1: Lista de reglas (D-06.1)"
    - path: "src/app/(dashboard)/agentes/routing/editor/page.tsx"
      provides: "Surface 2 + 3 + 4: Editor + boton Simular + catalog facts panel (D-06.2,3,4)"
    - path: "src/app/(dashboard)/agentes/routing/audit/page.tsx"
      provides: "Surface 5: Audit log viewer (D-06.5)"
  key_links:
    - from: "src/app/(dashboard)/agentes/routing/_actions.ts"
      to: "src/lib/domain/routing.ts (upsertRule, deleteRule, listFactsCatalog) + src/lib/agents/routing/dry-run.ts (dryRunReplay) + src/lib/agents/routing/cache.ts (invalidateWorkspace)"
      via: "imports + invocation"
      pattern: "from '@/lib/domain/routing'|from '@/lib/agents/routing/(dry-run|cache)'"
    - from: "editor page Submit handler"
      to: "_actions.ts:createOrUpdateRuleAction"
      via: "server action invocation"
      pattern: "createOrUpdateRuleAction"
    - from: "SimulateButton component"
      to: "_actions.ts:simulateAction → dry-run.ts:dryRunReplay"
      via: "server action invocation"
      pattern: "simulateAction"
---

<objective>
Wave 3 — Admin form (D-06: las 5 surfaces) sin UI polish (functional first per usuario decision 2026-04-25). Toda mutacion via Server Actions → domain layer (Regla 3).

Purpose: (1) Hacer accionable la edicion de reglas para el editor humano (tu) sin tocar SQL Studio. (2) Integrar dry-run en el flow de save (boton "Simular cambio" con preview lateral). (3) Audit log viewer para que post-rollout puedas auditar decisiones del router.

Output: 8 archivos UI (4 pages + 4 components + 1 actions). Sigue patron de `src/app/(dashboard)/configuracion/whatsapp/templates/builder/` (admin form existente con server actions y dynamic rendering).

**CRITICAL — Regla 3:** Server Actions son el unico ingreso a domain layer. Componentes UI NO importan `createAdminClient`. Verificable: `grep -rn createAdminClient 'src/app/(dashboard)/agentes/routing/'` retorna VACIO.

**CRITICAL — D-12 + Pitfall 5:** Editor valida con Ajv (`validateRule`) antes de submit. Server Action revalida tambien (defense-in-depth — no confiar del client).

**CRITICAL — Pitfall 3:** `createOrUpdateRuleAction` llama `invalidateWorkspace(workspaceId)` post-write. Esto borra el cache LRU de la misma lambda. La consistency cross-lambda sigue gobernada por el TTL 10s + version-column revalidation. UI muestra mensaje informativo "Los cambios pueden tardar hasta 10 segundos en aplicarse en todos los servidores".

**Functional first (usuario decision 2026-04-25):** Sigue patron de `whatsapp/templates/builder/` — formularios sencillos con validacion inline, sin animaciones, sin gradientes. Use `Card`, `Button`, `Input`, `Select` de shadcn ya existentes en el proyecto.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-06 las 5 surfaces, D-10 dry-run integrado
@CLAUDE.md  # Regla 3 (domain layer), Regla 6 (proteger agente — admin form NO flippea flag aqui, eso es Plan 07)
@src/lib/domain/routing.ts  # creado Plan 02
@src/lib/agents/routing/dry-run.ts  # creado Plan 05
@src/lib/agents/routing/cache.ts  # creado Plan 03 — invalidateWorkspace
@src/lib/agents/routing/schema/validate.ts  # creado Plan 02
@src/lib/domain/tags.ts  # tag CRUD para TagPicker
@src/app/(dashboard)/configuracion/whatsapp/templates/builder/  # patron canonico admin form a seguir

<interfaces>
<!-- Server Action signatures -->
'use server'

export async function createOrUpdateRuleAction(rule: Partial<RoutingRule>): Promise<{ success: true; ruleId: string } | { success: false; error: string }>

export async function deleteRuleAction(ruleId: string): Promise<{ success: true } | { success: false; error: string }>

export async function simulateAction(input: {
  candidateRules: RoutingRule[]
  daysBack: number
}): Promise<DryRunResult>

<!-- Workspace context — admin pages bajo (dashboard) layout ya tienen workspace context via cookie/context -->
import { getCurrentWorkspaceId } from '@/lib/workspace/context'  // verificar nombre exacto en el proyecto
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server Actions (_actions.ts) — TODAS las mutaciones via domain layer</name>
  <read_first>
    - src/lib/domain/routing.ts (Plan 02 — exports)
    - src/lib/agents/routing/dry-run.ts (Plan 05)
    - src/lib/agents/routing/cache.ts (Plan 03)
    - src/lib/agents/routing/schema/validate.ts (Plan 02)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/ (patron canonico — leer 1-2 archivos para confirmar como obtienen workspaceId del usuario logged)
  </read_first>
  <action>
    **Paso 1 — Crear `src/app/(dashboard)/agentes/routing/_actions.ts`** con server actions:

    ```typescript
    'use server'

    import { revalidatePath } from 'next/cache'
    import { upsertRule, deleteRule, listRules, type RoutingRule } from '@/lib/domain/routing'
    import { dryRunReplay, type DryRunResult } from '@/lib/agents/routing/dry-run'
    import { invalidateWorkspace } from '@/lib/agents/routing/cache'
    import { validateRule } from '@/lib/agents/routing/schema/validate'
    // Nombre exacto del helper que obtiene workspace del logged user — verificar en el proyecto
    // (probablemente getServerWorkspaceId o similar en src/lib/workspace/...)
    import { getCurrentWorkspaceId } from '@/lib/workspace/server'  // AJUSTAR si nombre distinto

    /**
     * W-6 fix: server-side priority uniqueness pre-check.
     * Returns inline error string if collision; null if priority is free.
     */
    async function validateRulePriorityUnique(
      workspaceId: string,
      ruleType: 'lifecycle_classifier' | 'agent_router',
      priority: number,
      excludeRuleId?: string,
    ): Promise<string | null> {
      const result = await listRules({ workspaceId })
      if (!result.success) return null  // listRules failure already surfaced elsewhere
      const collision = result.data.find(r =>
        r.active &&
        r.rule_type === ruleType &&
        r.priority === priority &&
        r.id !== excludeRuleId,
      )
      if (collision) {
        return `Ya existe una regla ${ruleType} con priority ${priority}: '${collision.name}'. Cambia la priority o desactiva la otra regla primero.`
      }
      return null
    }

    export async function createOrUpdateRuleAction(
      rule: Partial<RoutingRule>,
    ): Promise<{ success: true; ruleId: string } | { success: false; error: string }> {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) return { success: false, error: 'No workspace context' }

      // Defense-in-depth: validate again on server (client may bypass)
      const v = validateRule(rule)
      if (!v.ok) return { success: false, error: `Schema invalido: ${v.errors.join('; ')}` }

      // W-6 fix: priority uniqueness pre-check ANTES del DB upsert
      if (rule.rule_type && typeof rule.priority === 'number') {
        const collision = await validateRulePriorityUnique(
          workspaceId,
          rule.rule_type,
          rule.priority,
          rule.id,  // exclude self when editing
        )
        if (collision) return { success: false, error: collision }
      }

      const result = await upsertRule({ workspaceId }, rule as any)
      if (!result.success) return result

      // Invalidate same-lambda cache so next webhook sees fresh rules immediately.
      // Cross-lambda eventual consistency bounded by 10s TTL + version-column revalidation.
      invalidateWorkspace(workspaceId)

      revalidatePath('/agentes/routing')
      revalidatePath('/agentes/routing/editor')

      return { success: true, ruleId: result.data.id }
    }

    export async function deleteRuleAction(
      ruleId: string,
    ): Promise<{ success: true } | { success: false; error: string }> {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) return { success: false, error: 'No workspace context' }

      const result = await deleteRule({ workspaceId }, ruleId)
      if (!result.success) return result

      invalidateWorkspace(workspaceId)
      revalidatePath('/agentes/routing')
      return { success: true }
    }

    export async function simulateAction(input: {
      candidateRules: RoutingRule[]
      daysBack: number
    }): Promise<DryRunResult> {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) throw new Error('No workspace context')

      return dryRunReplay({
        workspaceId,
        candidateRules: input.candidateRules,
        daysBack: input.daysBack,
      })
    }
    ```

    **Paso 2 — Verificar Regla 3 enforcement**:
    ```bash
    grep -q "createAdminClient" "src/app/(dashboard)/agentes/routing/_actions.ts"
    # Esperado: VACIO (exit 1 / no match)
    grep -q "from '@/lib/domain/routing'" "src/app/(dashboard)/agentes/routing/_actions.ts"
    # Esperado: present
    ```

    **Paso 3 — Commit**:
    ```bash
    mkdir -p "src/app/(dashboard)/agentes/routing"
    git add "src/app/(dashboard)/agentes/routing/_actions.ts"
    git commit -m "feat(agent-lifecycle-router): Plan 06 Task 1 — Server Actions (domain layer Regla 3)"
    ```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>grep -q "use server" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>grep -q "from '@/lib/domain/routing'" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>grep -q "invalidateWorkspace" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>grep -q "validateRule" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>grep -q "validateRulePriorityUnique" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>! grep -q "createAdminClient" "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
    <automated>npx tsc --noEmit "src/app/(dashboard)/agentes/routing/_actions.ts"</automated>
  </verify>
  <acceptance_criteria>
    - 3 server actions exportadas: `createOrUpdateRuleAction`, `deleteRuleAction`, `simulateAction`.
    - Cada action obtiene workspaceId del server context (no del body).
    - `createOrUpdateRuleAction` valida con `validateRule` antes de invocar domain.
    - **W-6 fix:** `createOrUpdateRuleAction` invoca `validateRulePriorityUnique(workspaceId, ruleType, priority, excludeRuleId?)` ANTES de `upsertRule`. En collision retorna `{ success: false, error: 'Ya existe una regla {tipo} con priority {N}: ...' }` con mensaje exacto.
    - Cada mutating action llama `invalidateWorkspace(workspaceId)` y `revalidatePath('/agentes/routing')`.
    - Regla 3 enforcement: NO `createAdminClient` en este archivo.
    - tsc compila.
  </acceptance_criteria>
  <done>
    - Server Actions listas para que las pages las invoquen.
  </done>
</task>

<task type="auto">
  <name>Task 2: Lista de reglas + audit log viewer (Surfaces 1 y 5)</name>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx (patron de listas — Card, Table, Button)
    - src/lib/domain/routing.ts (listRules signature)
    - "src/app/(dashboard)/agentes/routing/_actions.ts" (Task 1)
  </read_first>
  <action>
    **Paso 1 — Crear `src/app/(dashboard)/agentes/routing/page.tsx`** (Surface 1: Lista de reglas, D-06.1):

    Server component que llama `listRules({ workspaceId })` desde domain layer. Renderea tabla con columnas: prioridad, nombre, tipo, output, activa (toggle), ultima_edicion. Acciones: editar (link a `/editor?id=`), nueva regla (link a `/editor?new=1`), eliminar (form con server action).

    Estructura minima sin polish (functional first):

    ```tsx
    import Link from 'next/link'
    import { listRules } from '@/lib/domain/routing'
    import { getCurrentWorkspaceId } from '@/lib/workspace/server'
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
    import { Button } from '@/components/ui/button'
    import { Badge } from '@/components/ui/badge'

    export default async function RoutingRulesPage() {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) return <div>No workspace context</div>

      const result = await listRules({ workspaceId })
      const rules = result.success ? result.data : []

      return (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Routing Rules</h1>
            <div className="flex gap-2">
              <Link href="/agentes/routing/audit"><Button variant="outline">Audit log</Button></Link>
              <Link href="/agentes/routing/editor?new=1"><Button>+ Nueva regla</Button></Link>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b">
                  <tr>
                    <th className="p-3 text-left">Prioridad</th>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Output</th>
                    <th className="p-3 text-left">Activa</th>
                    <th className="p-3 text-left">Ultima edicion</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">{r.priority}</td>
                      <td className="p-3 font-mono">{r.name}</td>
                      <td className="p-3"><Badge variant="outline">{r.rule_type}</Badge></td>
                      <td className="p-3 font-mono text-xs">{JSON.stringify((r.event as any).params)}</td>
                      <td className="p-3">{r.active ? <Badge>activa</Badge> : <Badge variant="secondary">inactiva</Badge>}</td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(r.updated_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
                      <td className="p-3"><Link href={`/agentes/routing/editor?id=${r.id}`}><Button size="sm" variant="outline">Editar</Button></Link></td>
                    </tr>
                  ))}
                  {rules.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No hay reglas. <Link href="/agentes/routing/editor?new=1" className="underline">Crear la primera</Link></td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )
    }
    ```

    **Paso 2 — Crear `src/app/(dashboard)/agentes/routing/audit/page.tsx`** (Surface 5: Audit log viewer, D-06.5):

    Server component que lee `routing_audit_log` via domain layer (agregar `listAuditLog({ workspaceId, limit, filter })` a domain.routing.ts si no esta, ver pasos abajo). Renderea tabla con columnas: decided_at, contact_id, agent_id, reason, lifecycle_state, fired_router_rule_id, latency_ms, facts_snapshot (collapsible).

    Filtros (URL searchParams): `?reason=`, `?agent_id=`, `?from=`, `?to=`. Default 50 rows.

    **Paso 3 — Agregar `listAuditLog` a `src/lib/domain/routing.ts`**:

    ```typescript
    export interface AuditLogFilter {
      reason?: 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy'
      agent_id?: string | null
      from?: string  // ISO timestamp
      to?: string
      limit?: number  // default 50
    }

    export async function listAuditLog(
      ctx: DomainContext,
      filter: AuditLogFilter = {},
    ): Promise<DomainResult<RoutingAuditEntry[]>> {
      const supabase = createAdminClient()
      let query = supabase
        .from('routing_audit_log')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .order('decided_at', { ascending: false })
        .limit(filter.limit ?? 50)
      if (filter.reason) query = query.eq('reason', filter.reason)
      if (filter.agent_id !== undefined) query = filter.agent_id === null
        ? query.is('agent_id', null)
        : query.eq('agent_id', filter.agent_id)
      if (filter.from) query = query.gte('decided_at', filter.from)
      if (filter.to) query = query.lte('decided_at', filter.to)
      const { data, error } = await query
      if (error) return { success: false, error: error.message }
      return { success: true, data: (data ?? []) as RoutingAuditEntry[] }
    }
    ```

    Y un test rapido para listAuditLog en `domain.test.ts` (extiende el archivo creado en Plan 02).

    **Paso 4 — Implementar audit page** consumiendo `listAuditLog`:

    ```tsx
    import { listAuditLog } from '@/lib/domain/routing'
    import { getCurrentWorkspaceId } from '@/lib/workspace/server'
    // ... etc
    export default async function AuditPage({ searchParams }: { searchParams: { reason?: string; agent_id?: string; from?: string; to?: string } }) {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) return <div>No workspace</div>
      const result = await listAuditLog({ workspaceId }, {
        reason: searchParams.reason as any,
        agent_id: searchParams.agent_id,
        from: searchParams.from,
        to: searchParams.to,
        limit: 50,
      })
      const rows = result.success ? result.data : []
      // render table with collapsible facts_snapshot column
      // ... (estructura similar a la de listado de rules — server component)
    }
    ```

    **Paso 5 — Verificar tsc + commit**:
    ```bash
    npx tsc --noEmit "src/app/(dashboard)/agentes/routing/page.tsx" "src/app/(dashboard)/agentes/routing/audit/page.tsx" src/lib/domain/routing.ts
    git add "src/app/(dashboard)/agentes/routing/page.tsx" "src/app/(dashboard)/agentes/routing/audit/page.tsx" src/lib/domain/routing.ts
    git commit -m "feat(agent-lifecycle-router): Plan 06 Task 2 — list rules page + audit log viewer (Surfaces 1+5)"
    ```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/routing/page.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/agentes/routing/audit/page.tsx"</automated>
    <automated>grep -q "listRules" "src/app/(dashboard)/agentes/routing/page.tsx"</automated>
    <automated>grep -q "listAuditLog" "src/app/(dashboard)/agentes/routing/audit/page.tsx"</automated>
    <automated>grep -q "listAuditLog" src/lib/domain/routing.ts</automated>
    <automated>! grep -q "createAdminClient" "src/app/(dashboard)/agentes/routing/page.tsx"</automated>
    <automated>! grep -q "createAdminClient" "src/app/(dashboard)/agentes/routing/audit/page.tsx"</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `page.tsx` (lista) y `audit/page.tsx` existen como server components.
    - Ambos llaman a domain layer (listRules, listAuditLog) — NO a Supabase directo.
    - Lista muestra columnas D-06.1: prioridad, nombre, tipo, output, activa, ultima_edicion.
    - Audit muestra columnas: decided_at, contact_id, agent_id, reason, lifecycle_state, latency_ms, facts_snapshot.
    - Audit acepta searchParams para filtros: reason, agent_id, from, to.
    - `listAuditLog` agregada a `src/lib/domain/routing.ts`.
    - tsc pasa.
  </acceptance_criteria>
  <done>
    - Surfaces 1 y 5 funcionales.
  </done>
</task>

<task type="auto">
  <name>Task 3: Editor con condition builder, fact picker, tag picker, simulate button (Surfaces 2-4)</name>
  <read_first>
    - "src/app/(dashboard)/agentes/routing/_actions.ts" (Task 1 — server actions)
    - src/lib/domain/routing.ts (getRule, listFactsCatalog)
    - src/lib/domain/tags.ts (assignTag — y verificar si hay listTagsForWorkspace)
    - src/lib/agents/routing/schema/validate.ts (validateRule client-side preview)
    - src/lib/agents/routing/dry-run.ts (DryRunResult shape)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/ (patron client component admin form con server action submit)
  </read_first>
  <action>
    **Paso 1 — Crear `src/app/(dashboard)/agentes/routing/editor/page.tsx`** (server component que carga datos iniciales y pasa a client component):

    ```tsx
    import { getRule, listFactsCatalog } from '@/lib/domain/routing'
    import { listAllTags } from '@/lib/domain/tags'  // verificar nombre exacto, agregar si no existe
    import { getCurrentWorkspaceId } from '@/lib/workspace/server'
    import { RoutingRuleEditorClient } from './_components/editor-client'

    export default async function RuleEditorPage({ searchParams }: { searchParams: { id?: string; new?: string } }) {
      const workspaceId = await getCurrentWorkspaceId()
      if (!workspaceId) return <div>No workspace</div>

      const factsResult = await listFactsCatalog()
      const facts = factsResult.success ? factsResult.data : []

      const tagsResult = await listAllTags({ workspaceId })
      const tags = tagsResult.success ? tagsResult.data : []

      let initialRule = null
      if (searchParams.id) {
        const r = await getRule({ workspaceId }, searchParams.id)
        if (r.success) initialRule = r.data
      }

      return (
        <RoutingRuleEditorClient
          initialRule={initialRule}
          facts={facts}
          tags={tags.map((t: any) => t.name)}
          workspaceId={workspaceId}
        />
      )
    }
    ```

    **Paso 2 — Crear `src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx`** (client component grande — donde vive todo el form):

    Este componente debe contener:
    - Inputs: name (text), priority (number), rule_type (select), active (switch).
    - Output picker:
      - Si `rule_type=lifecycle_classifier`: Select con los 8 estados D-03.
      - Si `rule_type=agent_router`: Input/Select con agent_id (string permitido + opcion "null = human_handoff").
    - `<ConditionBuilder>` recursivo que arma el JSON `conditions` (all/any/not + leaves).
    - `<SimulateButton>` que llama `simulateAction({ candidateRules: [editedRule], daysBack: 7 })` y muestra resultado en panel lateral.
    - Boton "Guardar" que llama `createOrUpdateRuleAction(rule)`.
    - Validacion inline con `validateRule` (import directo en client — el JSON Schema es serializable, Ajv corre en browser).

    Estructura skeleton (NO polish, solo functional):

    ```tsx
    'use client'

    import { useState } from 'react'
    import { useRouter } from 'next/navigation'
    import { validateRule } from '@/lib/agents/routing/schema/validate'
    import { createOrUpdateRuleAction, simulateAction } from '../../_actions'
    import { ConditionBuilder } from './ConditionBuilder'
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
    import { Button } from '@/components/ui/button'
    import { Input } from '@/components/ui/input'
    import { Label } from '@/components/ui/label'
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
    import { Switch } from '@/components/ui/switch'

    const LIFECYCLE_STATES = ['new_prospect', 'order_in_progress', 'in_transit', 'just_received', 'dormant_buyer', 'abandoned_cart', 'reactivation_window', 'blocked']

    export function RoutingRuleEditorClient(props: { initialRule: any; facts: any[]; tags: string[]; workspaceId: string }) {
      const router = useRouter()
      const [rule, setRule] = useState(props.initialRule ?? {
        schema_version: 'v1',
        rule_type: 'lifecycle_classifier',
        name: '',
        priority: 100,
        conditions: { all: [] },
        event: { type: 'route', params: { lifecycle_state: 'new_prospect' } },
        active: true,
      })
      const [errors, setErrors] = useState<string[]>([])
      const [simResult, setSimResult] = useState<any>(null)
      const [isSubmitting, setIsSubmitting] = useState(false)
      const [isSimulating, setIsSimulating] = useState(false)

      const validation = validateRule(rule)

      async function onSimulate() {
        setIsSimulating(true)
        try {
          const result = await simulateAction({ candidateRules: [rule], daysBack: 7 })
          setSimResult(result)
        } catch (e) {
          setSimResult({ error: e instanceof Error ? e.message : String(e) })
        } finally {
          setIsSimulating(false)
        }
      }

      async function onSave() {
        if (!validation.ok) {
          setErrors(validation.errors)
          return
        }
        setIsSubmitting(true)
        const result = await createOrUpdateRuleAction(rule)
        setIsSubmitting(false)
        if (!result.success) {
          setErrors([result.error])
          return
        }
        router.push('/agentes/routing')
      }

      return (
        <div className="flex gap-4 p-6">
          <Card className="flex-1">
            <CardHeader><CardTitle>{props.initialRule ? 'Editar regla' : 'Nueva regla'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={rule.name} onChange={e => setRule({ ...rule, name: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={rule.rule_type} onValueChange={v => setRule({ ...rule, rule_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifecycle_classifier">lifecycle_classifier (Layer 1)</SelectItem>
                    <SelectItem value="agent_router">agent_router (Layer 2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad (1..100000)</Label>
                <Input type="number" value={rule.priority} onChange={e => setRule({ ...rule, priority: parseInt(e.target.value, 10) })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={rule.active} onCheckedChange={v => setRule({ ...rule, active: v })} />
                <Label>Activa</Label>
              </div>
              <div>
                <Label>Output</Label>
                {rule.rule_type === 'lifecycle_classifier' ? (
                  <Select value={(rule.event.params as any).lifecycle_state} onValueChange={v => setRule({ ...rule, event: { type: 'route', params: { lifecycle_state: v } } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LIFECYCLE_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="agent_id (ej: somnio-recompra-v1) o vacio para human_handoff"
                      value={(rule.event.params as any).agent_id ?? ''}
                      onChange={e => setRule({ ...rule, event: { type: 'route', params: { agent_id: e.target.value || null } } })}
                    />
                    <p className="text-xs text-muted-foreground">Vacio = human_handoff (bot no responde)</p>
                  </div>
                )}
              </div>
              <div>
                <Label>Condiciones</Label>
                <ConditionBuilder
                  value={rule.conditions}
                  onChange={c => setRule({ ...rule, conditions: c })}
                  facts={props.facts}
                  tags={props.tags}
                />
              </div>
              {errors.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold mb-1">Errores:</p>
                  <ul className="list-disc list-inside space-y-1">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {!validation.ok && validation.errors.length > 0 && (
                <div className="text-xs text-yellow-600">Schema warnings: {validation.errors.join('; ')}</div>
              )}
              <div className="flex gap-2">
                <Button onClick={onSave} disabled={!validation.ok || isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </Button>
                <Button variant="outline" onClick={onSimulate} disabled={isSimulating}>
                  {isSimulating ? 'Simulando...' : 'Simular cambio'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Los cambios pueden tardar hasta 10 segundos en aplicarse en todos los servidores.</p>
            </CardContent>
          </Card>
          <div className="w-96">
            <Card>
              <CardHeader><CardTitle>Resultado simulacion</CardTitle></CardHeader>
              <CardContent>
                {!simResult && <p className="text-muted-foreground text-sm">Click "Simular cambio" para ver el impacto en los ultimos 7 dias.</p>}
                {simResult?.error && <p className="text-red-600 text-sm">{simResult.error}</p>}
                {simResult && !simResult.error && (
                  <div className="space-y-3 text-sm">
                    <div><strong>Total inbound (7d):</strong> {simResult.total_inbound}</div>
                    <div><strong>Cambiarian:</strong> {simResult.summary.changed_count}</div>
                    <div>
                      <strong>Antes:</strong>
                      <pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(simResult.summary.before, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Despues:</strong>
                      <pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(simResult.summary.after, null, 2)}</pre>
                    </div>
                    <details>
                      <summary className="cursor-pointer">Ver conversaciones afectadas ({simResult.decisions.filter((d: any) => d.changed).length})</summary>
                      <ul className="text-xs mt-2 space-y-1">
                        {simResult.decisions.filter((d: any) => d.changed).slice(0, 50).map((d: any) => (
                          <li key={d.conversation_id}>
                            <a href={`/conversaciones/${d.conversation_id}`} className="underline">{d.conversation_id.slice(0, 8)}</a>: {d.current_decision?.reason}/{d.current_decision?.agent_id ?? 'null'} → {d.candidate_decision.reason}/{d.candidate_decision.agent_id ?? 'null'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader><CardTitle>Facts disponibles</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-xs space-y-2">
                  {props.facts.map(f => (
                    <li key={f.name}>
                      <code className="font-mono">{f.name}</code> <span className="text-muted-foreground">({f.return_type})</span>
                      <p className="text-muted-foreground">{f.description}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )
    }
    ```

    **Paso 3 — Crear `src/app/(dashboard)/agentes/routing/editor/_components/ConditionBuilder.tsx`** (recursivo all/any/not + leaves).

    Esqueleto minimo:
    ```tsx
    'use client'
    import { Button } from '@/components/ui/button'
    import { Input } from '@/components/ui/input'
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

    const OPERATORS = ['equal','notEqual','lessThan','lessThanInclusive','greaterThan','greaterThanInclusive','in','notIn','contains','doesNotContain','daysSinceAtMost','daysSinceAtLeast','tagMatchesPattern','arrayContainsAny','arrayContainsAll']

    export function ConditionBuilder({ value, onChange, facts, tags }: any) {
      // value puede ser: { all: [...] }, { any: [...] }, { not: ... }, o leaf { fact, operator, value }
      // Componente recursivo. Renderea segun shape.
      // Sin pulir — solo funcional.
      // ... implementacion recursiva (see RuleEditorClient flow)
    }
    ```

    El executor implementa el componente recursivo siguiendo el JSON Schema (v1) — `all`/`any` como contenedores de N items; `not` como contenedor de 1 item; leaf con (fact: select, operator: select, value: input/array).

    **W-3 fix: FactPicker filtro por rule_type.** El `<ConditionBuilder>` recibe `props.facts` (array completo) + `props.ruleType: 'lifecycle_classifier' | 'agent_router'`. Antes de renderear el dropdown del fact, filtra:

    ```typescript
    // Inside ConditionBuilder.tsx (or in editor-client.tsx before pasarlo a ConditionBuilder)
    const visibleFacts = props.facts.filter(f =>
      Array.isArray(f.valid_in_rule_types) && f.valid_in_rule_types.includes(props.ruleType)
    )
    ```

    Pasarlo como `<select>` options. Cuando el usuario cambia `rule_type` en el formulario, el filtro re-evalua automaticamente (props re-render).

    **Acceptance W-3:** test manual del editor — cambiar rule_type a `lifecycle_classifier` debe ocultar `lifecycle_state` y `recompraEnabled` del fact picker; cambiar a `agent_router` debe mostrarlos.

    **Paso 4 — Verificar que `listAllTags` esta disponible** (B-4 fix: Plan 02 Task 3 ya la creo). Plan 06 SOLO importa.

    ```bash
    grep -q "export async function listAllTags" src/lib/domain/tags.ts
    ```

    Si falla -> Plan 02 Task 3 incompleto, BLOCKER. NO proceder, NO recrearla aqui.

    **Paso 5 — Verificar tsc + commit**:
    ```bash
    npx tsc --noEmit
    git add "src/app/(dashboard)/agentes/routing/editor/"
    git commit -m "feat(agent-lifecycle-router): Plan 06 Task 3 — editor (rule form + condition builder + simulate panel + facts catalog) Surfaces 2-4 + W-3 fact picker filter"
    ```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/routing/editor/page.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/agentes/routing/editor/_components/ConditionBuilder.tsx"</automated>
    <automated>grep -q "createOrUpdateRuleAction" "src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx"</automated>
    <automated>grep -q "simulateAction" "src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx"</automated>
    <automated>grep -q "validateRule" "src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx"</automated>
    <automated>! grep -rn "createAdminClient" "src/app/(dashboard)/agentes/routing/" --include="*.tsx"</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Editor existe con condition builder + 8 lifecycle states selector + agent_id input + simulate button + facts catalog panel.
    - Submit invoca `createOrUpdateRuleAction` (server action) — NO fetch directo.
    - Simulate invoca `simulateAction` y renderea panel lateral con changed_count + before/after + lista de decisiones cambiadas.
    - Validacion inline via `validateRule` del cliente (Ajv corre browser).
    - Mensaje "Los cambios pueden tardar hasta 10 segundos" presente en UI.
    - Regla 3 enforcement: NO `createAdminClient` en componentes UI.
    - tsc compila.
  </acceptance_criteria>
  <done>
    - Surfaces 2, 3, 4 funcionales. Las 5 surfaces D-06 completas.
  </done>
</task>

</tasks>

<verification>
- 4 pages + 4 components + 1 actions = 9 archivos UI creados.
- Las 5 surfaces D-06 funcionales.
- Regla 3 enforcement en TODA la UI: cero createAdminClient.
- Server Actions invalidan cache LRU + revalidatePath post-write.
- Editor valida con Ajv (Pitfall 5 + 2).
- Simulate boton invoca dry-run.
</verification>

<success_criteria>
- Usuario puede crear/editar/eliminar reglas desde la UI sin tocar SQL Studio.
- Usuario puede simular cambios antes de aplicarlos.
- Usuario puede ver audit log de decisiones del router post-rollout.
- Plan 07 puede usar este admin form para crear las parity rules de Somnio.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/06-SUMMARY.md` documentando:
- 9 archivos UI creados.
- Confirmacion Regla 3 (grep result).
- Hooks para Plan 07 (admin form usable para crear parity rules de Somnio).
- Limitaciones aceptadas (functional first, sin polish).
</output>
