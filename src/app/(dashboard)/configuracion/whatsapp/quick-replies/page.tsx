import { cookies } from 'next/headers'
import { getQuickReplies } from '@/app/actions/quick-replies'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { QuickReplyList } from './components/quick-reply-list'
import { QuickReplyForm } from './components/quick-reply-form'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default async function QuickRepliesPage() {
  const quickReplies = await getQuickReplies()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

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
              Respuestas Rapidas
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — atajos para respuestas frecuentes (escribe / en el chat)
              </em>
            </h1>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold shadow-[0_1px_0_var(--ink-1)] hover:bg-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <Plus className="h-4 w-4" />
                Nueva Respuesta
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]">
              <DialogHeader>
                <DialogTitle className="text-[20px] font-bold tracking-[-0.01em]" style={{ fontFamily: 'var(--font-display)' }}>Crear Respuesta Rapida</DialogTitle>
              </DialogHeader>
              <QuickReplyForm v2={v2} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="px-8 py-6 max-w-[1080px]">
          <QuickReplyList quickReplies={quickReplies} v2={v2} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Respuestas Rapidas</h1>
            <p className="text-muted-foreground">
              Crea atajos para respuestas frecuentes. Escribe / en el chat para usarlas.
            </p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Respuesta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Respuesta Rapida</DialogTitle>
              </DialogHeader>
              <QuickReplyForm />
            </DialogContent>
          </Dialog>
        </div>

        <QuickReplyList quickReplies={quickReplies} />
      </div>
    </div>
  )
}
