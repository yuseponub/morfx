import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { getTemplates, syncTemplateStatuses } from '@/app/actions/templates'
import { TemplateList } from './components/template-list'
import { Button } from '@/components/ui/button'
import { RefreshCw, Plus } from 'lucide-react'

async function handleSync(): Promise<void> {
  'use server'
  await syncTemplateStatuses()
  revalidatePath('/configuracion/whatsapp/templates')
}

export default async function TemplatesPage() {
  // Sync statuses from 360dialog on page load (best effort)
  try {
    await syncTemplateStatuses()
  } catch {
    // Silently ignore sync errors - show cached data
  }

  const templates = await getTemplates()

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Templates de WhatsApp</h1>
          <p className="text-muted-foreground">
            Crea y gestiona plantillas de mensajes para enviar fuera de la
            ventana de 24h
          </p>
        </div>
        <div className="flex gap-2">
          <form action={handleSync}>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar
            </Button>
          </form>
          <Link href="/configuracion/whatsapp/templates/nuevo">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Template
            </Button>
          </Link>
        </div>
      </div>

      <TemplateList templates={templates} />
    </div>
  )
}
