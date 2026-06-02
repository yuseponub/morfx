---
phase: 42.1-observabilidad-bots-produccion
plan: 09
type: execute
wave: 5
depends_on: [07]
files_modified:
  - src/lib/observability/repository.ts
  - src/app/actions/observability.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
autonomous: true

must_haves:
  truths:
    - "Existe repositorio de lectura con funciones listTurnsForConversation(conversationId) y getTurnDetail(turnId)"
    - "Existen server actions gated a super-user (Jose) que llaman al repositorio"
    - "En el inbox de WhatsApp hay un boton 'Debug bot' en el header del chat-view"
    - "Al hacer clic, el layout se divide en split pane (allotment): chat izquierda, panel debug derecha"
    - "El panel muestra lista de turnos de la conversacion abierta con timestamp y contadores (events/queries/ai_calls)"
    - "La lista auto-refresca cada 15s via SWR. Cuando feature flag esta OFF, la server action retorna un status field y el componente muestra 'Observabilidad desactivada — set OBSERVABILITY_ENABLED=true en Vercel'. Cuando flag ON pero sin datos, muestra 'Sin turnos registrados'"
    - "Otros usuarios (no super-user) NO ven el boton 'Debug bot'"
  artifacts:
    - path: "src/lib/observability/repository.ts"
      provides: "listTurnsForConversation, getTurnDetail"
      contains: "createRawAdminClient"
    - path: "src/app/actions/observability.ts"
      provides: "getTurnsByConversationAction, getTurnDetailAction (super-user gated)"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx"
      provides: "Contenedor del panel split"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"
      provides: "Lista vertical de turnos con seleccion"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"
      to: "src/app/actions/observability.ts"
      via: "useSWR con getTurnsByConversationAction, refreshInterval 15s"
      pattern: "useSWR"
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: "debug-panel-production"
      via: "allotment split pane conditional render"
      pattern: "allotment"
---

<objective>
Construir el layer UI del panel de observabilidad produccion: repository de lectura, server actions gated, y la vista lista (master) del split panel en el inbox WhatsApp. El detalle del turno viene en Plan 10.

Purpose: Desde el inbox WhatsApp, el super-user puede abrir un panel a la derecha y ver la lista de turnos del dia para la conversacion abierta (Decision #5 del context, Pattern allotment del research).
Output: Panel master visible, toggleable, auto-refreshing.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md
@src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
@src/lib/supabase/admin.ts
@src/lib/observability/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Repository + Server Actions gated a super-user</name>
  <files>
src/lib/observability/repository.ts
src/app/actions/observability.ts
  </files>
  <action>
1. `src/lib/observability/repository.ts`:

```typescript
import { createRawAdminClient } from '@/lib/supabase/admin' // raw para no contaminar eventos de lectura
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TurnSummary {
  id: string
  conversationId: string
  workspaceId: string
  agentId: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  eventCount: number
  queryCount: number
  aiCallCount: number
  totalTokens: number
  totalCostUsd: number
  hasError: boolean
  triggerKind: string | null
  currentMode: string | null
  newMode: string | null
}

export async function listTurnsForConversation(
  conversationId: string,
  opts: { limit?: number } = {},
): Promise<TurnSummary[]> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_observability_turns')
    .select('id, conversation_id, workspace_id, agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id,
    conversationId: r.conversation_id,
    workspaceId: r.workspace_id,
    agentId: r.agent_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    eventCount: r.event_count,
    queryCount: r.query_count,
    aiCallCount: r.ai_call_count,
    totalTokens: r.total_tokens,
    totalCostUsd: Number(r.total_cost_usd),
    hasError: r.error !== null,
    triggerKind: r.trigger_kind,
    currentMode: r.current_mode,
    newMode: r.new_mode,
  }))
}

// getTurnDetail goes in Plan 10 — stub export for now
export async function getTurnDetail(turnId: string, startedAt: string) {
  throw new Error('Not implemented until Plan 10')
}
```

2. `src/app/actions/observability.ts`:

```typescript
'use server'

import { listTurnsForConversation } from '@/lib/observability/repository'
import { createServerClient } from '@/lib/supabase/server' // o el helper habitual para auth

const SUPER_USER_EMAIL = process.env.SUPER_USER_EMAIL // p.ej. 'jose@morfx.app'

async function assertSuperUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  if (!SUPER_USER_EMAIL || user.email !== SUPER_USER_EMAIL) throw new Error('FORBIDDEN')
  return user
}

export async function getTurnsByConversationAction(conversationId: string) {
  await assertSuperUser()
  return listTurnsForConversation(conversationId, { limit: 200 })
}
```

3. Verificar que `SUPER_USER_EMAIL` es un env var existente o agregarlo al .env.example. Si el repo ya tiene un mecanismo distinto para identificar al super-user (p.ej. un user_id en config), usar ese mecanismo en vez de comparar email.

4. **Distinguir flag OFF vs sin datos.** Importar `isObservabilityEnabled` desde `@/lib/observability` y modificar `getTurnsByConversationAction` para retornar un objeto con status:

```typescript
import { isObservabilityEnabled } from '@/lib/observability'

export type GetTurnsResult =
  | { status: 'disabled' }
  | { status: 'ok'; turns: TurnSummary[] }

export async function getTurnsByConversationAction(conversationId: string): Promise<GetTurnsResult> {
  await assertSuperUser()
  if (!isObservabilityEnabled()) return { status: 'disabled' }
  const turns = await listTurnsForConversation(conversationId, { limit: 200 })
  return { status: 'ok', turns }
}
```

El componente `TurnList` (Task 2) consume esto y renderiza el mensaje "Observabilidad desactivada — set OBSERVABILITY_ENABLED=true en Vercel" cuando `status === 'disabled'`, y "Sin turnos registrados" cuando `status === 'ok'` pero `turns.length === 0`.
  </action>
  <verify>
- Build pasa
- Intento de llamar la server action desde un user no super-user retorna error FORBIDDEN
- Con super-user y conversationId valido pero sin datos (flag OFF) → retorna array vacio sin error
  </verify>
  <done>
Data layer de lectura listo. Super-user gating funcionando.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear debug-panel-production (container + turn-list) + integrar en inbox</name>
  <files>
src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx
src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx
src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
src/app/(dashboard)/whatsapp/components/chat-view.tsx
  </files>
  <action>
1. LEER `inbox-layout.tsx` y `chat-view.tsx` para entender la estructura actual del layout (columnas, props, estado del chat abierto).

2. Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx` (Client Component):

```typescript
'use client'
import useSWR from 'swr' // si no existe, usar el fetcher del proyecto o React Query — confirmar cual
import { getTurnsByConversationAction } from '@/app/actions/observability'
import type { TurnSummary } from '@/lib/observability/repository'

interface Props {
  conversationId: string
  selectedTurnId: string | null
  onSelectTurn: (turnId: string, startedAt: string) => void
}

export function TurnList({ conversationId, selectedTurnId, onSelectTurn }: Props) {
  const { data, error, isLoading } = useSWR(
    ['obs-turns', conversationId],
    () => getTurnsByConversationAction(conversationId),
    { refreshInterval: 15000, dedupingInterval: 5000 },
  )

  if (error) return <div className="p-4 text-red-500">Error: {error.message}</div>
  if (isLoading || !data) return <div className="p-4 text-zinc-500">Cargando turnos...</div>
  if (data.status === 'disabled') {
    return (
      <div className="p-4 text-amber-400 text-sm">
        Observabilidad desactivada
        <br />
        <span className="text-xs text-zinc-500">
          Set OBSERVABILITY_ENABLED=true en Vercel para activar la captura.
        </span>
      </div>
    )
  }
  const turns = data.turns
  if (turns.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        Sin turnos registrados para esta conversacion.
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full divide-y divide-zinc-800">
      {turns.map(turn => (
        <button
          key={turn.id}
          onClick={() => onSelectTurn(turn.id, turn.startedAt)}
          className={`w-full text-left p-3 hover:bg-zinc-900 ${selectedTurnId === turn.id ? 'bg-zinc-800' : ''}`}
        >
          <div className="flex justify-between text-xs text-zinc-400">
            <span>{new Date(turn.startedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</span>
            <span>{turn.durationMs}ms</span>
          </div>
          <div className="text-sm text-zinc-100 mt-1">
            {turn.agentId} · {turn.triggerKind ?? 'event'}
            {turn.hasError && <span className="ml-2 text-red-500">ERROR</span>}
          </div>
          <div className="text-xs text-zinc-500 mt-1 flex gap-2">
            <span>{turn.eventCount}ev</span>
            <span>{turn.queryCount}q</span>
            <span>{turn.aiCallCount}ai</span>
            <span>{turn.totalTokens}tok</span>
            <span>${turn.totalCostUsd.toFixed(4)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
```

Si el repo no usa SWR, buscar el patron existente (probablemente SWR o React Query ya estan). Si ninguno, usar `useEffect + useState` con setInterval manual.

3. Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { TurnList } from './turn-list'
// import { TurnDetail } from './turn-detail'  // Plan 10

interface Props {
  conversationId: string
}

export function DebugPanelProduction({ conversationId }: Props) {
  const [selectedTurn, setSelectedTurn] = useState<{ id: string; startedAt: string } | null>(null)

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-800">
      <div className="p-3 border-b border-zinc-800 text-sm font-semibold text-zinc-200">
        Debug bot · {conversationId.slice(0, 8)}
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="w-64 border-r border-zinc-800 flex-shrink-0">
          <TurnList
            conversationId={conversationId}
            selectedTurnId={selectedTurn?.id ?? null}
            onSelectTurn={(id, startedAt) => setSelectedTurn({ id, startedAt })}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedTurn ? (
            <div className="p-4 text-zinc-500 text-sm">
              Detalle del turno — implementado en Plan 10.
            </div>
          ) : (
            <div className="p-4 text-zinc-500 text-sm">
              Selecciona un turno de la lista.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

4. Modificar `inbox-layout.tsx`:
   - Importar `import { Allotment } from 'allotment'` y `import 'allotment/dist/style.css'` (si el CSS no esta ya importado globalmente).
   - Agregar estado `const [debugPanelOpen, setDebugPanelOpen] = useState(false)`.
   - Gate visibility por super-user: `const isSuperUser = ...` (reusar el helper del proyecto o pasar como prop desde el server component padre que hace la auth check).
   - Dentro del area del chat (probablemente envolviendo `ChatView`), reemplazar el contenedor actual por un `<Allotment>`:
     ```tsx
     <Allotment>
       <Allotment.Pane minSize={400}>
         <ChatView
           {...chatViewProps}
           onToggleDebug={isSuperUser ? () => setDebugPanelOpen(o => !o) : undefined}
         />
       </Allotment.Pane>
       {debugPanelOpen && isSuperUser && (
         <Allotment.Pane minSize={320} preferredSize={500}>
           <DebugPanelProduction conversationId={selectedConversationId} />
         </Allotment.Pane>
       )}
     </Allotment>
     ```

5. Modificar `chat-view.tsx`:
   - Aceptar prop `onToggleDebug?: () => void`.
   - Si existe, renderizar un boton `'Debug bot'` en el header del chat junto a los otros controles. Usar el estilo de los botones existentes del header.

6. Verificar que `allotment` esta en package.json (confirmado por el research). Si no, fallback a un layout manual con flex + handle.
  </action>
  <verify>
- Build pasa (next build)
- Dev server arranca sin errores
- Navegacion manual al inbox: el boton 'Debug bot' SOLO aparece para el super-user
- Click en el boton: el chat se divide, aparece el panel a la derecha
- Con 0 datos, muestra el mensaje "Sin turnos registrados"
- No rompe el inbox existente para usuarios regulares
  </verify>
  <done>
Panel master funcional. Lista de turnos (vacia por ahora) visible. Detalle stub hasta Plan 10.
  </done>
</task>

</tasks>

<verification>
- Build pasa
- `grep "allotment" src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` → 1+ matches
- `grep "onToggleDebug" src/app/(dashboard)/whatsapp/components/chat-view.tsx` → 1+ matches
- Regresion visual: usuarios no super-user ven el inbox identico al de antes
</verification>

<success_criteria>
Super-user puede abrir el panel debug desde el inbox y ver los turnos de la conversacion. Data layer gated correctamente.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-09-SUMMARY.md` con: arbol de componentes creados, integracion con inbox-layout, gate de super-user.
</output>
