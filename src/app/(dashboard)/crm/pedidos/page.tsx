import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getOrders, getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'
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

  // Resolve UI Editorial v3 flag. Fails closed to false (Regla 6, D-04).
  // The editorial-v3 reskin lives under the distinct `.theme-editorial-v3`
  // scope wired on the dashboard <main> (Plan 00). Threaded into OrdersView so
  // its additive editorial render branch (Plan 03) turns on per-workspace.
  const v3 = workspaceId ? await getIsEditorialV3Enabled(workspaceId) : false

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
          v3={v3}
        />
      </Suspense>
    </div>
  )
}
