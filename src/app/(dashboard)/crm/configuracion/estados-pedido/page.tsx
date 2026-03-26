import { getOrderStates, getClosureTagConfigs } from '@/app/actions/order-states'
import { getPipelines } from '@/app/actions/pipelines'
import { getTagsForScope } from '@/app/actions/tags'
import { OrderStateList } from './components/order-state-list'
import { ClosureTagConfigPanel } from './components/closure-tag-config'

export default async function OrderStatesPage() {
  const [states, pipelines, closureConfigs, orderTags] = await Promise.all([
    getOrderStates(),
    getPipelines(),
    getClosureTagConfigs(),
    getTagsForScope('orders'),
  ])

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Estados de Pedido</h1>
        <p className="text-muted-foreground">
          Configura los estados que aparecen como indicadores en las conversaciones de WhatsApp.
          Asigna etapas del pipeline a cada estado para agruparlas visualmente.
        </p>
      </div>
      <OrderStateList states={states} pipelines={pipelines} />

      <div className="mt-8">
        <ClosureTagConfigPanel
          configs={closureConfigs}
          pipelines={pipelines}
          tags={orderTags}
        />
      </div>
    </div>
  )
}
