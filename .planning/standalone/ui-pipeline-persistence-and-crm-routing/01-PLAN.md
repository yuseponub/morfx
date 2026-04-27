---
phase: ui-pipeline-persistence-and-crm-routing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/crm/pedidos/page.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
autonomous: true
requirements_addressed: [PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]
user_setup: []

must_haves:
  truths:
    - "F5 sobre `/crm/pedidos?pipeline=<uuid valido>` mantiene el pipeline `<uuid>` activo en el kanban (PERSIST-01)."
    - "Compartir la URL `/crm/pedidos?pipeline=<uuid>` con otro usuario del mismo workspace muestra ese pipeline activo en el kanban (PERSIST-02)."
    - "Volver a `/crm/pedidos` sin query param carga el ultimo pipeline elegido por el usuario en ese workspace (read de localStorage `morfx_active_pipeline:<workspaceId>`), validando que el id existe en `pipelines[]` (PERSIST-03 + D-03 + D-04)."
    - "Hacer click en una pestaña de pipeline NO dispara una request `/crm/pedidos?_rsc=...` (no re-fetch de getOrders/getPipelines/getActiveProducts/getTagsForScope) — verificable en DevTools Network panel (PERSIST-04 + Pitfall 1)."
    - "El cambio de pipeline en UI persiste a localStorage `morfx_active_pipeline:<workspaceId>` Y actualiza la URL via `window.history.replaceState` (no `router.replace`) — D-01 + D-05."
    - "Si la URL trae `?pipeline=<id>` que NO existe en `pipelines[]`, el server cae al `defaultPipeline.id` silenciosamente, sin toast, sin error (D-03 + D-04)."
    - "El `<OrdersView/>` queda envuelto en `<Suspense fallback={null}>` en `pedidos/page.tsx` (Pitfall 4 — defensa contra Next 16 prerender enforcement de useSearchParams)."
    - "Build local pasa: `npm run lint && npm run build` (TS strict + Suspense boundary check)."
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/page.tsx"
      provides: "Server component con searchParams: Promise<{...}> awaited, validacion de pipeline contra pipelines[], Suspense wrapper, prop activeWorkspaceId pasada al cliente."
      contains: "searchParams: Promise<"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      provides: "Cliente con: prop activeWorkspaceId, constante ACTIVE_PIPELINE_STORAGE_KEY_PREFIX, handler handlePipelineChange (state + localStorage + history.replaceState), useEffect de hidratacion one-shot post-mount con empty deps, cableado de PipelineTabs y del effect de ?order=<id> al nuevo handler."
      contains: "handlePipelineChange"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/page.tsx"
      to: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      via: "props defaultPipelineId={resolvedPipelineId} + activeWorkspaceId={workspaceId ?? null}"
      pattern: "defaultPipelineId=\\{resolvedPipelineId\\}|activeWorkspaceId=\\{workspaceId"
    - from: "handlePipelineChange (orders-view.tsx)"
      to: "URL via window.history.replaceState + localStorage scoped por workspace"
      via: "window.history.replaceState + localStorage.setItem"
      pattern: "window\\.history\\.replaceState|morfx_active_pipeline:"
    - from: "useEffect de hidratacion (orders-view.tsx, empty deps)"
      to: "lectura de localStorage + validacion contra pipelines[] + setActivePipelineId + history.replaceState"
      via: "one-shot post-mount, eslint-disable react-hooks/exhaustive-deps"
      pattern: "ACTIVE_PIPELINE_STORAGE_KEY_PREFIX.*activeWorkspaceId"
---

<objective>
Wave 1 — Persistencia del pipeline activo en `/crm/pedidos` (kanban) usando URL query param + localStorage scoped por workspace + `window.history.replaceState` shallow URL update. Cubre PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04.

Purpose: arreglar estructuralmente (no parche) el bug de que F5 vuelve al default pipeline. Implementa el patron canonico de Next 16 documentado en RESEARCH.md: server resuelve `?pipeline=` vs default y pasa prop al cliente; cliente sincroniza state + localStorage + URL en cada cambio sin disparar re-fetch RSC.

Output: 2 archivos modificados con diffs literales tomados de RESEARCH.md §"Server pedidos/page.tsx — full new shape" y §"Client orders-view.tsx — diff at the relevant lines".

**CRITICAL — Regla 6 spirit (D-13):** este plan TOCA `pedidos/page.tsx` y `orders-view.tsx` que sirven tanto a v1 como v2. Las ediciones son ADITIVAS (nuevo prop opcional, nuevo handler que envuelve el setter, nuevo effect de hidratacion). El comportamiento default cuando NO hay `?pipeline=` y NO hay localStorage queda IDENTICO al de hoy (server resuelve `defaultPipeline.id`). v1 y v2 ven el mismo OrdersView; el unico cambio percibido en v1 es "ahora respeta `?pipeline=` si lo pasas" — un strict-superset benigno.

**CRITICAL — Pitfall 1 (HIGH severity, RESEARCH §Pitfall 1):** NO usar `router.replace` para el cambio de pipeline. `OrdersPage` hace `Promise.all([getOrders, getPipelines, getActiveProducts, getTagsForScope])` y `router.replace` re-ejecuta los 4 server actions en cada click. USAR `window.history.replaceState` que integra con `useSearchParams` per Next 16 docs sin re-fetch RSC.

**CRITICAL — Pitfall 2 (RESEARCH §Pitfall 2):** El `useEffect` de hidratacion DEBE tener empty dep array `[]` con `// eslint-disable-next-line react-hooks/exhaustive-deps`. Poner `searchParams` o `pipelines` en deps + llamar a `replaceState` adentro NO causa loop por la naturaleza de replaceState (vs router.replace), pero la intencion es one-shot post-mount, asi que empty deps documenta intent.

**CRITICAL — Pitfall 3 (RESEARCH §Pitfall 3):** NO leer `localStorage` en el initializer de `useState` — causaria `ReferenceError: localStorage is not defined` en SSR. SIEMPRE en `useEffect` post-mount.

**CRITICAL — Pitfall 4 (RESEARCH §Pitfall 4):** `OrdersView` llama `useSearchParams()` (linea 141). Sin Suspense boundary, prod build de Next 16 puede fallar o degradar a CSR. Wrap defensivo en `pedidos/page.tsx`.

**CRITICAL — Pitfall 6 (RESEARCH §Pitfall 6):** localStorage SIEMPRE scoped por workspace via `morfx_active_pipeline:${workspaceId}`. Si `activeWorkspaceId === null`, NO leer NI escribir (early return).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md  # decisiones D-01..D-13 (especialmente D-01 URL+localStorage, D-02 server resuelve, D-03 validacion, D-05 scoping por workspace, D-06 no tocar pipeline-tabs.tsx)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md  # §Architecture Patterns Pattern 1 (server async searchParams), Pattern 2 (window.history.replaceState), Pattern 3 (post-mount hydration); §Pitfalls 1-6; §Code Examples (Server pedidos/page.tsx full new shape lineas 455-540 + Client orders-view.tsx diff lineas 542-660)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md  # Pattern Map: 4 idioms existentes en codebase (Pattern A localStorage namespace, Pattern B URLSearchParams build, Pattern C async searchParams, Pattern D Suspense wrapper, Pattern E one-shot mount empty deps); 2 NEW pattern flags (handlePipelineChange composed handler + window.history.replaceState — primer uso en codebase)
@CLAUDE.md  # Regla 0 (GSD complete), Regla 1 (push a Vercel post code change), Regla 6 (proteger comportamiento legacy — la rama v1 SIN ?pipeline= debe seguir igual)
@src/app/(dashboard)/crm/contactos/page.tsx  # canonical analog en el mismo codebase: searchParams: Promise<{...}> awaited (lineas 61-69)
@src/app/(dashboard)/agentes/routing/audit/page.tsx  # canonical analog: AuditPageProps con searchParams Promise (lineas 22-42)
@src/app/(dashboard)/configuracion/integraciones/page.tsx  # canonical analog: <Suspense fallback={...}> wrapper en (dashboard) page (lineas 7, 99-104)
@src/app/(dashboard)/crm/contactos/components/contacts-table.tsx  # canonical analog: URLSearchParams idiom (lineas 53-64)
@src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx  # NO se toca (D-06) — solo lectura para confirmar localStorage 'morfx_open_pipelines' (linea 15) sigue igual y la validacion `pipelines.some(p => p.id === id)` (linea ~48) es el predicado canonico para D-03
@src/app/(dashboard)/crm/pedidos/page.tsx  # archivo a modificar — 53 lineas hoy, sin searchParams ni Suspense
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx  # archivo a modificar — useSearchParams ya importado (linea 4), useRouter ya disponible (linea 140-141), patron localStorage existente en lineas 64-66 + 434-476 + 454-462

<interfaces>
<!-- Schema de OrdersViewProps (VERIFIED orders-view.tsx:114-124, lineas exactas) -->
interface OrdersViewProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
  user: User | null
  currentUserId?: string
  isAdminOrOwner?: boolean
  // ← APPEND in this plan:
  activeWorkspaceId: string | null   // NEW — para D-05 scoping localStorage
}

<!-- Constantes localStorage existentes (VERIFIED orders-view.tsx:64-66) -->
const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'
const SORT_FIELD_STORAGE_KEY = 'morfx_kanban_sort_field'
const SORT_DIR_STORAGE_KEY = 'morfx_kanban_sort_dir'
// ← APPEND in this plan (line 67):
const ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'   // NEW (D-05)

<!-- Validacion canonica contra pipelines[] (predicado D-03) -->
// VERIFIED en pipeline-tabs.tsx:48 y orders-view.tsx:479: ambos usan
//   pipelines.some(p => p.id === id) o pipelines.find(p => p.id === id)
// Replicar mismo predicado en page.tsx (server validacion D-03) y orders-view.tsx (hidratacion D-03)

<!-- Estructura del PipelineTabs callsite ANTES (VERIFIED orders-view.tsx:947-952) -->
<PipelineTabs
  pipelines={pipelines}
  activePipelineId={activePipelineId}
  onPipelineChange={setActivePipelineId}        // ← cambiar a handlePipelineChange
  onOpenPipelines={setOpenPipelineIds}
/>

<!-- Estructura del effect de ?order=<id> ANTES (VERIFIED orders-view.tsx:266-280) -->
React.useEffect(() => {
  const orderId = searchParams.get('order')
  if (orderId) {
    const order = orders.find(o => o.id === orderId)
    if (order) {
      if (order.pipeline_id !== activePipelineId) {
        setActivePipelineId(order.pipeline_id)         // ← LINE 273: swap to handlePipelineChange
      }
      setViewingOrder(order)
      router.replace('/crm/pedidos', { scroll: false })
    }
  }
}, [searchParams, router, orders, activePipelineId])  // ← LINE 280: append handlePipelineChange dep
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Modificar `pedidos/page.tsx` — async searchParams + validacion + Suspense + prop activeWorkspaceId</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Code Examples "Server pedidos/page.tsx — full new shape" (lineas 455-540) — copiar verbatim
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §Decisiones D-02 (server resuelve), §D-03 (validacion contra pipelines[]), §D-04 (caida silenciosa al default)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md §Pattern C (async searchParams) y §Pattern D (Suspense wrapper)
    - src/app/(dashboard)/crm/pedidos/page.tsx (estado actual — 53 lineas, sin searchParams)
    - src/app/(dashboard)/crm/contactos/page.tsx:61-69 (analog canonico de async searchParams en el mismo codebase)
    - src/app/(dashboard)/configuracion/integraciones/page.tsx:7 + 99-104 (analog canonico de Suspense wrapper en (dashboard))
  </read_first>
  <action>
    **Paso 1 — Reemplazar `src/app/(dashboard)/crm/pedidos/page.tsx` completo** con el contenido literal siguiente. NO paraphrase, NO reordenar imports, NO "optimizar". El diff resultante debe matchear exactamente el shape de RESEARCH.md §"Server pedidos/page.tsx — full new shape" (lineas 455-540):

    ```typescript
    import { Suspense } from 'react'
    import { createClient } from '@/lib/supabase/server'
    import { cookies } from 'next/headers'
    import { getOrders, getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
    import { getActiveProducts } from '@/app/actions/products'
    import { getTagsForScope } from '@/app/actions/tags'
    import { OrdersView } from './components/orders-view'

    export default async function OrdersPage({
      searchParams,
    }: {
      searchParams: Promise<{
        pipeline?: string
        new?: string
        order?: string
        contact_id?: string
      }>
    }) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // Get workspace membership for admin/owner check
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value

      let isAdminOrOwner = false
      if (user && workspaceId) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .single()
        isAdminOrOwner = membership?.role === 'admin' || membership?.role === 'owner'
      }

      // Read URL state (D-01/D-02). Promise-shaped per Next 15+/16 App Router.
      const params = await searchParams
      const requestedPipelineId = params.pipeline

      // Ensure at least one pipeline exists
      const defaultPipeline = await getOrCreateDefaultPipeline()

      // Fetch all data in parallel (contacts removed — ContactSelector is now self-contained)
      const [orders, pipelines, products, tags] = await Promise.all([
        getOrders(),
        getPipelines(),
        getActiveProducts(),
        getTagsForScope('orders')
      ])

      // Validate URL param against workspace pipelines (D-03).
      // Silent fallback to default if invalid (D-04).
      const validRequested = requestedPipelineId
        ? pipelines.find(p => p.id === requestedPipelineId)
        : undefined
      const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id

      return (
        <div className="flex flex-col h-full">
          {/* Suspense boundary required by Next 16 for any client component that
              calls useSearchParams(). OrdersView does (line 141), but no boundary
              exists today — works only because this route is dynamically rendered
              via cookies(). Adding the boundary defensively (Pitfall 4). */}
          <Suspense fallback={null}>
            <OrdersView
              orders={orders}
              pipelines={pipelines}
              products={products}
              tags={tags}
              defaultPipelineId={resolvedPipelineId}
              defaultStageId={defaultPipeline?.stages[0]?.id}
              user={user}
              currentUserId={user?.id}
              isAdminOrOwner={isAdminOrOwner}
              activeWorkspaceId={workspaceId ?? null}
            />
          </Suspense>
        </div>
      )
    }
    ```

    **Paso 2 — Verificar que el diff es minimo y matchea el shape esperado.** Las diferencias vs el archivo actual de 53 lineas son:
    - Linea 1: agregar `import { Suspense } from 'react'`
    - Signature de la funcion: pasa de `OrdersPage()` a `OrdersPage({ searchParams }: { searchParams: Promise<{...}> })`
    - Despues del `isAdminOrOwner` check, antes de `getOrCreateDefaultPipeline`: agregar `const params = await searchParams; const requestedPipelineId = params.pipeline`
    - Despues del `Promise.all`: agregar `const validRequested = ... ; const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id`
    - JSX: agregar `<Suspense fallback={null}>` wrapper alrededor de `<OrdersView/>`
    - Prop `defaultPipelineId={defaultPipeline?.id}` → `defaultPipelineId={resolvedPipelineId}`
    - Prop nuevo: `activeWorkspaceId={workspaceId ?? null}` (despues de `isAdminOrOwner`)

    El bloque de `getOrders/getPipelines/getActiveProducts/getTagsForScope` queda IGUAL.
    El bloque de `cookieStore.get('morfx_workspace')` queda IGUAL.
    El bloque de `workspace_members.select('role')` queda IGUAL.

    **Paso 3 — Validar localmente con TS strict + ESLint:**
    ```bash
    npm run lint -- src/app/(dashboard)/crm/pedidos/page.tsx
    npx tsc --noEmit
    ```
    Si TS se queja porque `OrdersViewProps` no tiene `activeWorkspaceId`, ese fix viene en Task 2 (planeado en este mismo plan). En ese caso, continuar a Task 2 y validar TS al final del Task 2.

    **Paso 4 — NO commit todavia.** Este task se commitea junto con Task 2 en Task 3 (build atomico per-plan).
  </action>
  <verify>
    <automated>test -f src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "import { Suspense } from 'react'" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "searchParams: Promise<{" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "const params = await searchParams" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "pipelines.find(p => p.id === requestedPipelineId)" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "<Suspense fallback={null}>" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "defaultPipelineId={resolvedPipelineId}" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>grep -q "activeWorkspaceId={workspaceId ?? null}" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
    <automated>! grep -q "defaultPipelineId={defaultPipeline?.id}" src/app/(dashboard)/crm/pedidos/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - El archivo importa `Suspense` desde `'react'` en la primera linea.
    - La funcion `OrdersPage` recibe `{ searchParams }: { searchParams: Promise<{ pipeline?: string; new?: string; order?: string; contact_id?: string }> }`.
    - Existe `const params = await searchParams` Y `const requestedPipelineId = params.pipeline`.
    - Existe `const validRequested = requestedPipelineId ? pipelines.find(p => p.id === requestedPipelineId) : undefined` (D-03 validacion).
    - Existe `const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id` (D-04 caida silenciosa).
    - El JSX envuelve `<OrdersView/>` en `<Suspense fallback={null}>` (Pitfall 4).
    - `<OrdersView/>` recibe `defaultPipelineId={resolvedPipelineId}` (no `defaultPipeline?.id` — verificar via `! grep`).
    - `<OrdersView/>` recibe `activeWorkspaceId={workspaceId ?? null}` (NEW prop, D-05).
    - El bloque de `cookieStore.get('morfx_workspace')`, `workspace_members.select('role')`, `getOrders/getPipelines/getActiveProducts/getTagsForScope`, `defaultPipeline = await getOrCreateDefaultPipeline()` queda byte-identical.
    - `npm run lint -- src/app/(dashboard)/crm/pedidos/page.tsx` pasa (TS strict puede fallar temporalmente hasta Task 2 — aceptable si solo es por `activeWorkspaceId` no declarado en `OrdersViewProps`).
  </acceptance_criteria>
  <done>
    - Archivo modificado segun shape RESEARCH.md, NO commit todavia.
  </done>
</task>

<task type="auto">
  <name>Task 2: Modificar `orders-view.tsx` — prop activeWorkspaceId, constante storage key, handlePipelineChange handler, useEffect de hidratacion, cableado a PipelineTabs y al effect de ?order=</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Code Examples "Client orders-view.tsx — diff at the relevant lines" (lineas 542-660) — copiar verbatim
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §Decisiones D-01 (URL+localStorage hibrido), §D-02 (hidratacion en mount), §D-03 (validar contra pipelines[]), §D-05 (key scoped por workspace)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md §Pattern A (localStorage namespace) §Pattern B (URLSearchParams build) §Pattern E (one-shot post-mount empty deps); §"NEW PATTERN FLAG" para handlePipelineChange (composed handler) y window.history.replaceState (primer uso en codebase)
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (estado actual — lineas 4 useSearchParams import, 64-66 storage keys, 114-124 OrdersViewProps interface, 129-139 destructure, 154-156 setActivePipelineId useState, 266-280 effect de ?order=, 434-452 effect canonico de hidratacion existente, 454-462 handleViewModeChange canonico, 947-952 PipelineTabs callsite)
    - src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx:48 (predicado de validacion `pipelines.some(p => p.id === id)` — replicar)
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-64 (idiom URLSearchParams build canonico)
  </read_first>
  <action>
    **Paso 1 — Editar el interface `OrdersViewProps` (orders-view.tsx, lineas 114-124).** Agregar `activeWorkspaceId: string | null` como ultima prop:

    ```typescript
    interface OrdersViewProps {
      orders: OrderWithDetails[]
      pipelines: PipelineWithStages[]
      products: Product[]
      tags: Tag[]
      defaultPipelineId?: string
      defaultStageId?: string
      user: User | null
      currentUserId?: string
      isAdminOrOwner?: boolean
      activeWorkspaceId: string | null
    }
    ```

    **Paso 2 — Editar el destructure de la funcion `OrdersView` (lineas 129-139).** Agregar `activeWorkspaceId` al final, antes del `}: OrdersViewProps`:

    ```typescript
    export function OrdersView({
      orders,
      pipelines,
      products,
      tags,
      defaultPipelineId,
      defaultStageId,
      user,
      currentUserId,
      isAdminOrOwner,
      activeWorkspaceId,
    }: OrdersViewProps) {
    ```

    **Paso 3 — Agregar la constante `ACTIVE_PIPELINE_STORAGE_KEY_PREFIX` despues de la linea 66.** El bloque de constantes pasa de 3 a 4:

    ```typescript
    const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'
    const SORT_FIELD_STORAGE_KEY = 'morfx_kanban_sort_field'
    const SORT_DIR_STORAGE_KEY = 'morfx_kanban_sort_dir'
    const ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'   // D-05 (Standalone ui-pipeline-persistence-and-crm-routing)
    ```

    **Paso 4 — Agregar el handler `handlePipelineChange` inmediatamente despues del `useState` de `activePipelineId` (despues de la linea 156, antes del `useState` de `openPipelineIds` en linea 159).**

    ```typescript
    // Wrapper que compone setActivePipelineId + localStorage WRITE (D-05) + URL replaceState (D-01).
    // CRITICAL — Pitfall 1: usa window.history.replaceState en vez de router.replace para
    // evitar re-fetch de OrdersPage's 4-way Promise.all (getOrders/getPipelines/getActiveProducts/
    // getTagsForScope) en cada click de tab. replaceState integra con useSearchParams en Next 16
    // sin disparar transition del Router.
    //
    // Composes:
    //   - localStorage WRITE pattern de handleViewModeChange (lineas 454-462) con try/catch silencioso.
    //   - URLSearchParams build de contacts-table.tsx:53-64 con commit verb DIFERENTE (replaceState, no router.push).
    //
    // Flagged en PATTERNS.md como NEW PATTERN — primer combinacion de state + localStorage + replaceState
    // en este codebase. Inlined intencionalmente per "Don't Hand-Roll" mandate de RESEARCH.md.
    const handlePipelineChange = React.useCallback((newId: string) => {
      setActivePipelineId(newId)

      // Persist to localStorage scoped por workspace (D-05). Si no hay workspace, skip silencioso (Pitfall 6).
      if (activeWorkspaceId) {
        try {
          localStorage.setItem(
            `${ACTIVE_PIPELINE_STORAGE_KEY_PREFIX}${activeWorkspaceId}`,
            newId,
          )
        } catch {
          // localStorage disabled / quota — silent (matches existing idiom L460).
        }
      }

      // Reflect in URL (D-01). Use replaceState (NOT router.replace) — Pitfall 1.
      try {
        const params = new URLSearchParams(searchParams.toString())
        params.set('pipeline', newId)
        window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
      } catch {
        // Defensive — should never throw on the client.
      }
    }, [activeWorkspaceId, searchParams])
    ```

    **Paso 5 — Modificar el effect de `?order=<id>` en lineas 266-280 — swap el setter linea 273 por `handlePipelineChange` Y agregar `handlePipelineChange` al dep array linea 280.**

    Antes (lineas 266-280):
    ```typescript
    React.useEffect(() => {
      const orderId = searchParams.get('order')
      if (orderId) {
        const order = orders.find(o => o.id === orderId)
        if (order) {
          if (order.pipeline_id !== activePipelineId) {
            setActivePipelineId(order.pipeline_id)
          }
          setViewingOrder(order)
          router.replace('/crm/pedidos', { scroll: false })
        }
      }
    }, [searchParams, router, orders, activePipelineId])
    ```

    Despues:
    ```typescript
    React.useEffect(() => {
      const orderId = searchParams.get('order')
      if (orderId) {
        const order = orders.find(o => o.id === orderId)
        if (order) {
          if (order.pipeline_id !== activePipelineId) {
            handlePipelineChange(order.pipeline_id)
          }
          setViewingOrder(order)
          router.replace('/crm/pedidos', { scroll: false })
        }
      }
    }, [searchParams, router, orders, activePipelineId, handlePipelineChange])
    ```

    Nota: el `router.replace('/crm/pedidos', { scroll: false })` que limpia el `?order=` ahora tambien limpia el `?pipeline=` que `handlePipelineChange` acababa de escribir. Esto es ACEPTADO per RESEARCH.md §Open Questions Q1 — localStorage ya tiene el valor escrito, F5 sigue funcionando via la hydration effect, y el state local `activePipelineId` es correcto. NO expandir scope para preservar `?pipeline=` aqui.

    **Paso 6 — Agregar el useEffect de hidratacion inmediatamente despues del effect existente de localStorage (despues de la linea 452).**

    ```typescript
    // Hydrate active pipeline desde localStorage on mount IF la URL no especifica ?pipeline= (D-02).
    // One-shot post-mount; deps intencionalmente vacias (Pitfall 2 — searchParams en deps + replaceState
    // adentro NO causa loop con replaceState [vs router.replace], pero queremos one-shot post-mount).
    //
    // Composes:
    //   - localStorage READ + try/catch idiom de lineas 434-452 (mismo archivo).
    //   - pipelines.some(p => p.id === stored) validacion de pipeline-tabs.tsx:48 (D-03).
    // New: replaceState mirror para que F5 subsiguiente respete la eleccion (URL es source of truth).
    React.useEffect(() => {
      // URL takes precedence — server ya resolvio el pipeline desde el query param.
      if (searchParams.get('pipeline')) return
      // Sin workspace, no hay scope para localStorage (Pitfall 6).
      if (!activeWorkspaceId) return

      try {
        const stored = localStorage.getItem(
          `${ACTIVE_PIPELINE_STORAGE_KEY_PREFIX}${activeWorkspaceId}`,
        )
        if (!stored) return
        // D-03 validacion contra pipelines[] del workspace (RLS-filtered upstream).
        if (!pipelines.some(p => p.id === stored)) return
        // Already correct — el server-resolved default coincide con el stored.
        if (stored === activePipelineId) return

        setActivePipelineId(stored)
        // Reflect in URL para que F5 subsiguiente mantenga la eleccion.
        const params = new URLSearchParams(searchParams.toString())
        params.set('pipeline', stored)
        window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
      } catch {
        // Silent — matches existing idiom (lineas 449-451).
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    ```

    **Paso 7 — Editar el JSX del callsite de PipelineTabs (lineas 947-952).** Cambiar `onPipelineChange={setActivePipelineId}` a `onPipelineChange={handlePipelineChange}`:

    Antes:
    ```typescript
    <PipelineTabs
      pipelines={pipelines}
      activePipelineId={activePipelineId}
      onPipelineChange={setActivePipelineId}
      onOpenPipelines={setOpenPipelineIds}
    />
    ```

    Despues:
    ```typescript
    <PipelineTabs
      pipelines={pipelines}
      activePipelineId={activePipelineId}
      onPipelineChange={handlePipelineChange}
      onOpenPipelines={setOpenPipelineIds}
    />
    ```

    **Paso 8 — NO tocar `pipeline-tabs.tsx`.** D-06 lock: la constante `LOCAL_STORAGE_KEY = 'morfx_open_pipelines'` (linea 15) y toda la logica del componente queda IGUAL. La nueva key `morfx_active_pipeline:<wsId>` es independiente.

    **Paso 9 — NO tocar el effect de `?new=true` (lineas 257-263).** RESEARCH §Open Questions Q2 confirma que ese effect tambien hace `router.replace('/crm/pedidos', { scroll: false })` — mismo trade-off que Q1, ACEPTADO por defer.

    **Paso 10 — NO tocar el `useState` de `activePipelineId` en lineas 154-156.** Sigue siendo `defaultPipelineId || pipelines[0]?.id || null`. El server ya resolvio `defaultPipelineId` desde la URL si fue valido, asi que ese valor inicial cubre el F5 (PERSIST-01) y el share-link (PERSIST-02). El nuevo effect cubre el last-visit (PERSIST-03). El nuevo handler cubre el switch (PERSIST-04).
  </action>
  <verify>
    <automated>test -f src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "activeWorkspaceId: string | null" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "const handlePipelineChange = React.useCallback" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "window.history.replaceState(null, '', \`/crm/pedidos?\${params.toString()}\`)" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "}, \[activeWorkspaceId, searchParams\])" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "onPipelineChange={handlePipelineChange}" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>! grep -q "onPipelineChange={setActivePipelineId}" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "handlePipelineChange(order.pipeline_id)" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>! grep -q "setActivePipelineId(order.pipeline_id)" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "if (searchParams.get('pipeline')) return" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "if (!pipelines.some(p => p.id === stored)) return" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "eslint-disable-next-line react-hooks/exhaustive-deps" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -c "morfx_active_pipeline:" src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</automated>
    <automated>grep -q "LOCAL_STORAGE_KEY = 'morfx_open_pipelines'" src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `OrdersViewProps` interface tiene `activeWorkspaceId: string | null` como ultima prop.
    - El destructure de `OrdersView` incluye `activeWorkspaceId`.
    - Constante `ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'` existe en el bloque junto a las otras 3 storage keys (cerca de linea 67).
    - `const handlePipelineChange = React.useCallback(...)` existe con dep array `[activeWorkspaceId, searchParams]`, hace `setActivePipelineId(newId)`, llama `localStorage.setItem` scoped por workspace en try/catch, y llama `window.history.replaceState(null, '', \`/crm/pedidos?\${params.toString()}\`)` en try/catch.
    - El effect de `?order=<id>` (lineas 266-280) usa `handlePipelineChange(order.pipeline_id)` (no `setActivePipelineId`) y tiene `handlePipelineChange` en su dep array.
    - El nuevo `useEffect` de hidratacion existe con: empty deps `[]`, comentario `eslint-disable-next-line react-hooks/exhaustive-deps`, early returns para `searchParams.get('pipeline')` y `!activeWorkspaceId`, lectura de localStorage con prefix scoped, validacion `pipelines.some(p => p.id === stored)`, llamada a `setActivePipelineId(stored)` y a `window.history.replaceState`.
    - El JSX `<PipelineTabs/>` callsite usa `onPipelineChange={handlePipelineChange}` (verificar via `! grep` que ya NO usa `setActivePipelineId`).
    - `pipeline-tabs.tsx:15` sigue teniendo `LOCAL_STORAGE_KEY = 'morfx_open_pipelines'` byte-identical (D-06 lock).
    - El conteo de `morfx_active_pipeline:` debe ser >= 4 (constante + handler write + effect read + effect URL update).
    - El effect de `?new=true` y el `useState` de `activePipelineId` quedan byte-identical.
  </acceptance_criteria>
  <done>
    - 4 ediciones aplicadas en orders-view.tsx: prop, constante, handler, hidratacion effect, cableado.
    - pipeline-tabs.tsx no tocado.
    - NO commit todavia — esto va junto con Task 1 en Task 3.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build local + commit atomico + push a Vercel (Regla 1)</name>
  <read_first>
    - .claude/rules/code-changes.md (commits atomicos en espanol con Co-authored-by Claude)
    - CLAUDE.md §Regla 1 (push a Vercel post-cambios)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §D-11 (testing manual, no automated tests requeridos)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Validation Architecture §Sampling Rate (per-task `npm run lint`, per-merge `npm run build`)
  </read_first>
  <action>
    **Paso 1 — Verificar TS strict + ESLint sobre los 2 archivos modificados:**
    ```bash
    npm run lint -- src/app/(dashboard)/crm/pedidos/page.tsx src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    npx tsc --noEmit
    ```
    Si TS o ESLint reportan errores REALES (no warnings), VOLVER a Tasks 1-2 y arreglar antes de continuar.

    Errores aceptados (warnings):
    - El `eslint-disable-next-line react-hooks/exhaustive-deps` antes del effect de hidratacion debe silenciar la regla — si ESLint aun se queja, verificar que el comentario este EN LA LINEA INMEDIATAMENTE ANTERIOR al `}, [])`.

    **Paso 2 — Build local completo (valida Suspense boundary requirement bajo prod constraints — Pitfall 4):**
    ```bash
    npm run build
    ```
    Esto debe terminar sin errores. Si falla con "Missing Suspense boundary with useSearchParams" o similar, verificar que Task 1 envolvio correctamente `<OrdersView/>` en `<Suspense fallback={null}>`.

    **Paso 3 — Diff sanity check:** confirmar que las modificaciones son las esperadas (no archivos extra tocados):
    ```bash
    git status --short | grep -E '^(M|A|\\?\\?) '
    ```
    Debe listar SOLO:
    - `M src/app/(dashboard)/crm/pedidos/page.tsx`
    - `M src/app/(dashboard)/crm/pedidos/components/orders-view.tsx`

    Si aparece otro archivo modificado (ej. `pipeline-tabs.tsx`, `sidebar.tsx`, `crm/page.tsx`), VOLVER a Tasks 1-2 y revertir esos cambios — pertenecen a Plan 02 o a ningun plan.

    **Paso 4 — Stage los archivos:**
    ```bash
    git add src/app/(dashboard)/crm/pedidos/page.tsx \
            src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    ```

    **Paso 5 — Commit atomico (mensaje en espanol con Co-authored-by Claude per .claude/rules/code-changes.md):**
    ```bash
    git commit -m "$(cat <<'EOF'
    feat(crm-pedidos): persistir pipeline activo via URL + localStorage scoped por workspace

    Resuelve PERSIST-01..04 del standalone ui-pipeline-persistence-and-crm-routing.

    - pedidos/page.tsx: leer searchParams.pipeline (Promise async per Next 16),
      validar contra pipelines[] del workspace (D-03), pasar resolvedPipelineId
      y activeWorkspaceId al cliente. Wrap defensivo en Suspense (Pitfall 4).
    - orders-view.tsx: nuevo handler handlePipelineChange (state + localStorage
      + window.history.replaceState — Pitfall 1, NO router.replace para evitar
      re-fetch de getOrders/getPipelines/getActiveProducts/getTagsForScope en cada
      click). Nuevo useEffect one-shot post-mount que hidrata desde localStorage
      cuando la URL no trae ?pipeline= (D-02 + Pitfall 2 empty deps). Cableado
      del effect ?order=<id> al nuevo handler para preservar la eleccion.

    Regla 6 spirit (D-13): cambios aditivos, comportamiento por defecto sin
    ?pipeline= y sin localStorage queda identico al de hoy. v1 y v2 ven el
    mismo OrdersView.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    **Paso 6 — Push a Vercel (Regla 1):**
    ```bash
    git push origin main
    ```

    Vercel preview deploy se dispara automaticamente. Plan 03 (manual QA) corre los 5 test cases sobre el preview en Somnio workspace con `ui_dashboard_v2.enabled=true`.

    **Paso 7 — Anunciar al executor que Plan 02 puede correr en paralelo desde el inicio (mismo wave 1, archivos disjuntos).**
  </action>
  <verify>
    <automated>git log -1 --format=%s | grep -qF "feat(crm-pedidos): persistir pipeline activo via URL"</automated>
    <automated>git log -1 --name-only | grep -q "src/app/(dashboard)/crm/pedidos/page.tsx"</automated>
    <automated>git log -1 --name-only | grep -q "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"</automated>
    <automated>! git log -1 --name-only | grep -q "src/components/layout/sidebar.tsx"</automated>
    <automated>! git log -1 --name-only | grep -q "src/app/(dashboard)/crm/page.tsx"</automated>
    <automated>! git log -1 --name-only | grep -q "pipeline-tabs.tsx"</automated>
    <automated>git log -1 --format=%b | grep -q "Co-Authored-By: Claude"</automated>
    <automated>git status --short | grep -q "^$" || test "$(git status --short | wc -l)" -le 5</automated>
  </verify>
  <acceptance_criteria>
    - `npm run lint` pasa sobre los 2 archivos sin errores.
    - `npm run build` pasa sin errores (valida Suspense boundary + TS strict prod).
    - Commit atomico con mensaje empezando con `feat(crm-pedidos): persistir pipeline activo via URL`.
    - Commit incluye SOLO los 2 archivos del plan (pedidos/page.tsx + orders-view.tsx). Verificable via `! git log -1 --name-only | grep -q sidebar` (Plan 02 file no tocado).
    - Mensaje de commit incluye `Co-Authored-By: Claude` (per rules).
    - `git push origin main` exitoso, Vercel preview deploy en cola.
    - Resto de archivos del git status sin tocar (no se contamina con cambios extra).
  </acceptance_criteria>
  <done>
    - 2 archivos modificados, build pasa, commit en main, pushed a Vercel.
    - Plan 03 (QA manual) puede arrancar una vez Plan 02 tambien haya pusheado.
  </done>
</task>

</tasks>

<verification>
- `pedidos/page.tsx` recibe `searchParams: Promise<{...}>`, resuelve y valida `pipeline` contra `pipelines[]`, pasa `resolvedPipelineId` + `activeWorkspaceId` al cliente, y envuelve `<OrdersView/>` en `<Suspense fallback={null}>`.
- `orders-view.tsx` agrega prop `activeWorkspaceId`, constante `ACTIVE_PIPELINE_STORAGE_KEY_PREFIX`, handler `handlePipelineChange` (state + localStorage + replaceState), useEffect de hidratacion one-shot, y cablea `<PipelineTabs/>` + el effect de `?order=` al nuevo handler.
- `pipeline-tabs.tsx` byte-identical (D-06 lock).
- `npm run lint && npm run build` pasan localmente.
- Commit atomico en `main` con mensaje en espanol + Co-Authored-By Claude.
- Push a Vercel exitoso (Regla 1).
</verification>

<success_criteria>
- PERSIST-01 cubierto: F5 sobre `/crm/pedidos?pipeline=<uuid>` muestra ese pipeline activo (server-side resolution).
- PERSIST-02 cubierto: share-link funciona (mismo path).
- PERSIST-03 cubierto: vuelta a `/crm/pedidos` sin query carga el ultimo elegido (hydration effect).
- PERSIST-04 cubierto: click en tabs NO dispara `_rsc` request (`replaceState`).
- Plan 02 puede correr en paralelo (archivos disjuntos: sidebar.tsx + crm/page.tsx).
- Plan 03 (manual QA) tiene un Vercel preview deploy listo en Somnio para correr los 5 test cases de D-11.
</success_criteria>

<output>
Despues de completar, crear `.planning/standalone/ui-pipeline-persistence-and-crm-routing/01-SUMMARY.md` documentando:
- Commit hash del commit atomico de Task 3.
- Confirmacion de que `npm run lint && npm run build` pasaron localmente.
- Confirmacion de que `git push origin main` completo (Vercel deploy preview URL si esta disponible).
- Lista de los 4 requirements cubiertos (PERSIST-01..04) con la linea/archivo donde se implementa cada uno.
- Confirmacion de que pipeline-tabs.tsx, sidebar.tsx, y crm/page.tsx NO fueron tocados en este plan.
- Cualquier nota de pitfall encontrado durante la implementacion (ej. ESLint warning resuelto via `eslint-disable-next-line`).
</output>
