import { getQuickReplies } from '@/app/actions/quick-replies'
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

  return (
    <div className="container py-6">
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
  )
}
