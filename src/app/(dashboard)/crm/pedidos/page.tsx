import { createClient } from '@/lib/supabase/server'
import { getOrders, getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { OrdersView } from './components/orders-view'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
      />
    </div>
  )
}
