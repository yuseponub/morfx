---
plan: 10
phase: somnio-sales-v4
wave: 5
depends_on: [02, 09]
files_modified:
  - src/lib/domain/unknown-cases.ts
  - src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx
  - src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts
  - src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx
  - src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx
  - src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx
addresses_decisions: [D-05, D-06, D-12, D-13, D-23, D-24, D-52]
addresses_research_pitfalls: []
autonomous: true
estimated_tasks: 4
must_haves:
  truths:
    - "Página /agentes/somnio-v4/unknown-cases lista clusters con tamaño y mensajes ejemplo"
    - "Usuario puede dismissCluster (marca status='dismissed' en todas las rows del cluster)"
    - "Usuario puede markPromoted (marca status='promoted', registra promoted_at)"
    - "Domain layer src/lib/domain/unknown-cases.ts existe y filtra por workspace_id (Regla 3)"
    - "page.tsx usa wrapper 'flex-1 overflow-y-auto p-6' (project pattern)"
    - "Cero importaciones createAdminClient directos en _actions.ts (Regla 3 — todas via domain)"
  artifacts:
    - path: "src/lib/domain/unknown-cases.ts"
      provides: "domain wrappers: listClusters, listUnclustered, dismissCluster, markPromoted"
      exports: ["listClusters", "listUnclustered", "dismissCluster", "markPromoted"]
    - path: "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx"
      provides: "server component admin UI"
  key_links:
    - from: "page.tsx server component"
      to: "domain layer listClusters"
      via: "await ctx-aware function"
      pattern: "listClusters"
    - from: "_actions.ts server actions"
      to: "domain layer dismissCluster / markPromoted"
      via: "'use server' directive + revalidatePath"
      pattern: "revalidatePath"
---

<objective>
Wave 3 (cierre) — UI de revisión humana de unknown_cases.

D-12 obliga a entregar el loop completo día 1: capture → cluster → review humano. Sin UI no hay quién revise. Esta interfaz vive en `/agentes/somnio-v4/unknown-cases` (Next.js App Router server component).

Operaciones soportadas:
1. Listar clusters listos (`status='ready_for_promotion'`) con tamaño + 3 mensajes ejemplo + intent dominante
2. Listar casos sin cluster (`status='pending'`)
3. Acción "Dismiss cluster" → marca `status='dismissed'` para todas las rows del cluster
4. Acción "Mark promoted" → marca `status='promoted'`, set `promoted_at` (operador resolvió creando KB doc o transition manualmente)

Regla 3 estricta: TODAS las queries pasan por `src/lib/domain/unknown-cases.ts`.

Output: 6 archivos nuevos + 1 commit autónomo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/app/(dashboard)/agentes/crm-tools/page.tsx
@src/app/(dashboard)/agentes/crm-tools/_actions.ts
@src/lib/agents/somnio-v4/config.ts
</context>

<interfaces>
<!-- Domain layer pattern (Regla 3 — único punto mutación) -->
```typescript
// src/lib/domain/unknown-cases.ts shape
export async function listClusters(ctx: { workspaceId: string }): Promise<ClusterSummary[]>
export async function listUnclustered(ctx: { workspaceId: string }): Promise<UnknownCaseRow[]>
export async function dismissCluster(ctx: { workspaceId: string }, clusterId: string): Promise<void>
export async function markPromoted(ctx: { workspaceId: string }, clusterId: string): Promise<void>
```

<!-- Page wrapper pattern (project — verificable en src/app/(dashboard)/agentes/crm-tools/page.tsx) -->
```typescript
<div className="flex-1 overflow-y-auto p-6">
  <div className="mb-6">
    <h1 className="text-2xl font-bold">Casos sin resolver — Somnio v4</h1>
  </div>
  ...
</div>
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Domain layer src/lib/domain/unknown-cases.ts</name>
  <files>src/lib/domain/unknown-cases.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/config.ts (SOMNIO_V4_AGENT_ID)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-05, D-06, D-23)
    - CLAUDE.md (Regla 3 — domain layer obligatorio)
  </read_first>
  <action>
Crear `src/lib/domain/unknown-cases.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { SOMNIO_V4_AGENT_ID } from '@/lib/agents/somnio-v4/config'

/**
 * Domain layer para agent_unknown_cases (D-05).
 * Filtra por workspace_id en TODAS las queries (Regla 3).
 * Hardcodea agent_id='somnio-sales-v4' por ahora — generalizable cuando otros agentes adopten el patrón.
 */

export interface ClusterSummary {
  clusterId: string
  size: number
  exampleMessages: string[]   // up to 3 redacted snippets
  dominantIntent: string | null
  oldestCaseAt: string         // ISO
  newestCaseAt: string
}

export interface UnknownCaseRow {
  id: string
  conversationId: string
  message: string
  intent: string | null
  confidence: number | null
  reason: string | null
  knowledgeQueried: string[]
  createdAt: string
}

export async function listClusters(ctx: { workspaceId: string }): Promise<ClusterSummary[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_unknown_cases')
    .select('id, cluster_id, message, intent, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('status', 'ready_for_promotion')
    .not('cluster_id', 'is', null)

  if (error) throw new Error(`listClusters: ${error.message}`)

  // Group by cluster_id
  const groups = new Map<string, Array<typeof data[number]>>()
  for (const row of data ?? []) {
    const cid = row.cluster_id as string
    if (!groups.has(cid)) groups.set(cid, [])
    groups.get(cid)!.push(row)
  }

  return Array.from(groups.entries()).map(([clusterId, rows]) => {
    const sortedAsc = [...rows].sort((a, b) => (a.created_at as string).localeCompare(b.created_at as string))
    const intents = rows.map((r) => r.intent).filter(Boolean) as string[]
    const intentCount = new Map<string, number>()
    for (const it of intents) intentCount.set(it, (intentCount.get(it) ?? 0) + 1)
    const dominantIntent = Array.from(intentCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      clusterId,
      size: rows.length,
      exampleMessages: sortedAsc.slice(0, 3).map((r) => r.message as string),
      dominantIntent,
      oldestCaseAt: sortedAsc[0]?.created_at as string,
      newestCaseAt: sortedAsc[sortedAsc.length - 1]?.created_at as string,
    }
  })
}

export async function listUnclustered(ctx: { workspaceId: string }): Promise<UnknownCaseRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_unknown_cases')
    .select('id, conversation_id, message, intent, confidence, reason, knowledge_queried, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('status', 'pending')
    .is('cluster_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`listUnclustered: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    message: r.message as string,
    intent: (r.intent as string) ?? null,
    confidence: (r.confidence as number) ?? null,
    reason: (r.reason as string) ?? null,
    knowledgeQueried: (r.knowledge_queried as string[]) ?? [],
    createdAt: r.created_at as string,
  }))
}

export async function dismissCluster(ctx: { workspaceId: string }, clusterId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_unknown_cases')
    .update({ status: 'dismissed' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('cluster_id', clusterId)
  if (error) throw new Error(`dismissCluster: ${error.message}`)
}

export async function markPromoted(ctx: { workspaceId: string }, clusterId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_unknown_cases')
    .update({ status: 'promoted', promoted_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('cluster_id', clusterId)
  if (error) throw new Error(`markPromoted: ${error.message}`)
}
```

**Anti-patterns aplicados:**
- Regla 3: TODA query filtra por `workspace_id`
- Workspace isolation cross-cutting (D-23)
  </action>
  <verify>
    <automated>test -f src/lib/domain/unknown-cases.ts && grep -q "listClusters" src/lib/domain/unknown-cases.ts && grep -q "dismissCluster" src/lib/domain/unknown-cases.ts && grep -q "markPromoted" src/lib/domain/unknown-cases.ts && grep -q ".eq('workspace_id', ctx.workspaceId)" src/lib/domain/unknown-cases.ts && grep -q ".eq('agent_id', SOMNIO_V4_AGENT_ID)" src/lib/domain/unknown-cases.ts</automated>
  </verify>
  <acceptance_criteria>
    - 4 funciones exportadas
    - Toda query filtra por workspace_id + agent_id
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>Domain layer listo.</done>
</task>

<task type="auto">
  <name>Task 2: page.tsx + _actions.ts</name>
  <files>src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx, src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts</files>
  <read_first>
    - src/app/(dashboard)/agentes/crm-tools/page.tsx (patrón server component analog)
    - src/app/(dashboard)/agentes/crm-tools/_actions.ts (patrón server action analog)
    - src/lib/domain/unknown-cases.ts (acabado de crear)
  </read_first>
  <action>
**A) `page.tsx`** (server component):

```typescript
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { listClusters, listUnclustered } from '@/lib/domain/unknown-cases'
import { ClusterCard } from './_components/ClusterCard'
import { UnclusteredList } from './_components/UnclusteredList'

export default async function UnknownCasesPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">No hay workspace activo. Selecciona uno para continuar.</p>
      </div>
    )
  }

  const ctx = { workspaceId }
  const [clusters, unclustered] = await Promise.all([listClusters(ctx), listUnclustered(ctx)])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Casos sin resolver — Somnio v4</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mensajes de clientes que el agente escaló a humano. Los clusters de ≥10 casos similares
          en 30 días aparecen primero — listos para promover a KB doc o transition.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Clusters listos para revisión ({clusters.length})</h2>
        {clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay clusters maduros aún.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clusters.map((c) => <ClusterCard key={c.clusterId} cluster={c} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Casos sin cluster — recientes ({unclustered.length})</h2>
        <UnclusteredList rows={unclustered} />
      </section>
    </div>
  )
}
```

**B) `_actions.ts`** (server actions):

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { dismissCluster, markPromoted } from '@/lib/domain/unknown-cases'

const ClusterIdSchema = z.object({ clusterId: z.string().uuid() })

export async function dismissClusterAction(input: { clusterId: string }): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No active workspace' }
  const parsed = ClusterIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }
  try {
    await dismissCluster({ workspaceId }, parsed.data.clusterId)
    revalidatePath('/agentes/somnio-v4/unknown-cases')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function markPromotedAction(input: { clusterId: string }): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No active workspace' }
  const parsed = ClusterIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.message }
  try {
    await markPromoted({ workspaceId }, parsed.data.clusterId)
    revalidatePath('/agentes/somnio-v4/unknown-cases')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
```

**Anti-patterns:**
- Regla 3: NO `createAdminClient` aquí — sólo el domain.
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx" && test -f "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts" && grep -q "listClusters" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/page.tsx" && grep -q "use server" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts" && grep -q "revalidatePath" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts" && [ "$(grep 'createAdminClient' \"src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_actions.ts\" | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - page.tsx server component, fetcheando vía domain
    - _actions.ts con `'use server'` + revalidatePath
    - Cero `createAdminClient` en _actions.ts (Regla 3)
    - Wrapper `flex-1 overflow-y-auto p-6` presente
  </acceptance_criteria>
  <done>Page + actions listas.</done>
</task>

<task type="auto">
  <name>Task 3: _components ClusterCard + UnclusteredList + PromoteDialog</name>
  <files>src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx, src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx, src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx</files>
  <read_first>
    - src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx (cliente component analog)
    - src/lib/domain/unknown-cases.ts (tipos ClusterSummary, UnknownCaseRow)
  </read_first>
  <action>
**A) `ClusterCard.tsx`** (cliente — botones invocan server actions):

```typescript
'use client'
import { useState, useTransition } from 'react'
import { dismissClusterAction, markPromotedAction } from '../_actions'
import type { ClusterSummary } from '@/lib/domain/unknown-cases'
import { PromoteDialog } from './PromoteDialog'

export function ClusterCard({ cluster }: { cluster: ClusterSummary }) {
  const [pending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDismiss = () => {
    if (!confirm(`¿Descartar cluster de ${cluster.size} casos?`)) return
    startTransition(async () => {
      const r = await dismissClusterAction({ clusterId: cluster.clusterId })
      if (!r.success) setError(r.error ?? 'Error desconocido')
    })
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Cluster · {cluster.size} casos</span>
        <span className="text-xs text-muted-foreground">
          {cluster.dominantIntent ? `intent: ${cluster.dominantIntent}` : 'sin intent dominante'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        {new Date(cluster.oldestCaseAt).toLocaleDateString('es-CO')} – {new Date(cluster.newestCaseAt).toLocaleDateString('es-CO')}
      </div>
      <ul className="text-sm space-y-1 mb-4">
        {cluster.exampleMessages.map((m, i) => (
          <li key={i} className="text-muted-foreground">› {m}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={() => setDialogOpen(true)}
          disabled={pending}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded"
        >
          Marcar como promovido
        </button>
        <button
          onClick={handleDismiss}
          disabled={pending}
          className="px-3 py-1.5 text-sm border rounded"
        >
          Descartar
        </button>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      <PromoteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        cluster={cluster}
      />
    </div>
  )
}
```

**B) `UnclusteredList.tsx`** (server-side renderable, sin acciones):

```typescript
import type { UnknownCaseRow } from '@/lib/domain/unknown-cases'

export function UnclusteredList({ rows }: { rows: UnknownCaseRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay casos sin cluster.</p>
  }
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-3 py-2">Mensaje</th>
            <th className="text-left px-3 py-2">Intent</th>
            <th className="text-left px-3 py-2">Confianza</th>
            <th className="text-left px-3 py-2">Razón</th>
            <th className="text-left px-3 py-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.message}</td>
              <td className="px-3 py-2">{r.intent ?? '—'}</td>
              <td className="px-3 py-2">{r.confidence?.toFixed(2) ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason ?? '—'}</td>
              <td className="px-3 py-2 text-xs">{new Date(r.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**C) `PromoteDialog.tsx`** (cliente — confirm dialog que llama markPromotedAction):

```typescript
'use client'
import { useTransition } from 'react'
import { markPromotedAction } from '../_actions'
import type { ClusterSummary } from '@/lib/domain/unknown-cases'

export function PromoteDialog({
  open,
  onClose,
  cluster,
}: {
  open: boolean
  onClose: () => void
  cluster: ClusterSummary
}) {
  const [pending, startTransition] = useTransition()

  if (!open) return null

  const handleConfirm = () => {
    startTransition(async () => {
      const r = await markPromotedAction({ clusterId: cluster.clusterId })
      if (r.success) {
        onClose()
      } else {
        alert(`Error: ${r.error}`)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-2">Marcar como promovido</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Confirma que ya creaste:
        </p>
        <ul className="text-sm list-disc pl-5 mb-4">
          <li>Un KB doc en <code>src/lib/agents/somnio-v4/knowledge/</code> (PR review obligatorio — D-52), <strong>O</strong></li>
          <li>Una nueva entrada en <code>transitions.ts</code></li>
        </ul>
        <p className="text-xs text-muted-foreground mb-4">
          Esto marcará los {cluster.size} casos como <code>status='promoted'</code>.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={pending} className="px-3 py-1.5 text-sm border rounded">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={pending} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
            {pending ? 'Marcando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx" && test -f "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/UnclusteredList.tsx" && test -f "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/PromoteDialog.tsx" && grep -q "'use client'" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx" && grep -q "dismissClusterAction" "src/app/(dashboard)/agentes/somnio-v4/unknown-cases/_components/ClusterCard.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - 3 componentes existen
    - ClusterCard + PromoteDialog son `'use client'`
    - UnclusteredList no necesita 'use client' (puro)
    - Tipos importados desde `@/lib/domain/unknown-cases`
  </acceptance_criteria>
  <done>Componentes UI listos.</done>
</task>

<task type="auto">
  <name>Task 4: Smoke render + commit + push</name>
  <files>(archivos del Plan 10)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
1. Smoke build local:
```bash
pnpm typecheck
pnpm build
# expect: build sin errores en la nueva ruta
```

2. Commit + push:
```bash
git add src/lib/domain/unknown-cases.ts src/app/\(dashboard\)/agentes/somnio-v4/
git commit -m "feat(somnio-v4): plan-10 — UI /agentes/somnio-v4/unknown-cases para review humano

- src/lib/domain/unknown-cases.ts: 4 funciones (listClusters, listUnclustered, dismissCluster, markPromoted)
  - Regla 3: workspace_id filter en cada query
- page.tsx server component con secciones clusters + unclustered
- _actions.ts con dismissClusterAction + markPromotedAction
- _components: ClusterCard (con confirmar/descartar), UnclusteredList (tabla server-side), PromoteDialog (modal cliente)
- TZ='America/Bogota' en formateo de fechas

D-12 cierre: loop completo de observation (capture → cluster → review humano)
D-24 verificado: cero imports somnio-v3
D-52 reflejado en PromoteDialog text: PR review obligatorio para KB docs

Standalone: somnio-sales-v4
Decisions: D-05, D-06, D-12, D-13, D-23, D-24, D-52

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-10"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm build` ok
    - Commit + push completados
    - Vercel deploy ok
    - Ruta `/agentes/somnio-v4/unknown-cases` accesible (manualmente verificable post-deploy)
  </acceptance_criteria>
  <done>UI shipped.</done>
</task>

</tasks>

<verification>
- Domain layer + Page + Actions + Components funcionales
- pnpm build ok
- Regla 3 respetada
</verification>

<success_criteria>
- Operador puede ir a /agentes/somnio-v4/unknown-cases y ver clusters reales tras el flip
- Loop de aprendizaje (D-12) end-to-end funcional
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/10-SUMMARY.md` con:
- Confirmación pnpm build exit 0
- Hash commit
- URL preview Vercel donde la ruta es accesible
</output>
