import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/pipelines'
import { Button } from '@/components/ui/button'
import { PipelineList } from './components/pipeline-list'

export default async function PipelinesSettingsPage() {
  let pipelines = await getPipelines()

  // If no pipelines exist, create the default one
  if (pipelines.length === 0) {
    await getOrCreateDefaultPipeline()
    pipelines = await getPipelines()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/crm/pedidos">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver a pedidos
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Configuracion de Pipelines</h1>
        <p className="text-muted-foreground">
          Administra los pipelines y etapas de tu flujo de trabajo
        </p>
      </div>

      {/* Pipeline list with stage management */}
      <PipelineList pipelines={pipelines} />
    </div>
    </div>
  )
}
