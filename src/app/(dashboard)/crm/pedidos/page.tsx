import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getOrders, getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { OrdersView } from './components/orders-view'

export default async function OrdersPage() {
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

  // Ensure at least one pipeline exists
  const defaultPipeline = await getOrCreateDefaultPipeline()

  // Fetch all data in parallel (contacts removed — ContactSelector is now self-contained)
  const [orders, pipelines, products, tags] = await Promise.all([
    getOrders(),
    getPipelines(),
    getActiveProducts(),
    getTagsForScope('orders')
  ])

  return (
    <div className="flex flex-col h-full">
      <OrdersView
        orders={orders}
        pipelines={pipelines}
        products={products}
        tags={tags}
        defaultPipelineId={defaultPipeline?.id}
        defaultStageId={defaultPipeline?.stages[0]?.id}
        user={user}
        currentUserId={user?.id}
        isAdminOrOwner={isAdminOrOwner}
      />
    </div>
  )
}
