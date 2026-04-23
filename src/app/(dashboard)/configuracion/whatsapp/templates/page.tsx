import Link from 'next/link'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTemplates, syncTemplateStatuses } from '@/app/actions/templates'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
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

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  const templates = await getTemplates()

  if (v2) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
        {/* Editorial topbar */}
        <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos · WhatsApp
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Templates
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — plantillas de mensajes para enviar fuera de la ventana de 24h
              </em>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <form action={handleSync}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar
              </button>
            </form>
            <Link
              href="/configuracion/whatsapp/templates/nuevo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--ink-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Plus className="h-4 w-4" />
              Nuevo Template
            </Link>
          </div>
        </div>

        <div className="px-8 py-6">
          <TemplateList templates={templates} v2={v2} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
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
    </div>
  )
}
