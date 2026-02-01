'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { QuickReply } from '@/lib/whatsapp/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QuickReplyForm } from './quick-reply-form'
import { deleteQuickReply, deleteQuickReplyMedia } from '@/app/actions/quick-replies'
import { toast } from 'sonner'
import { MessageSquare, Edit, Trash2, ImageIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface QuickReplyListProps {
  quickReplies: QuickReply[]
}

export function QuickReplyList({ quickReplies }: QuickReplyListProps) {
  const router = useRouter()
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)

  if (quickReplies.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg">No hay respuestas rapidas</h3>
          <p className="text-muted-foreground">
            Crea respuestas rapidas para agilizar la atencion al cliente
          </p>
        </CardContent>
      </Card>
    )
  }

  async function handleDelete(reply: QuickReply) {
    try {
      // Delete media from storage if exists
      if (reply.media_url) {
        await deleteQuickReplyMedia(reply.media_url)
      }
      const result = await deleteQuickReply(reply.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Respuesta eliminada')
      router.refresh()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {quickReplies.map((reply) => (
          <Card key={reply.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    /{reply.shortcut}
                  </code>
                  {reply.media_url && (
                    <span className="text-muted-foreground" title="Incluye imagen">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingReply(reply)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar respuesta</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta accion no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(reply)}>
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Thumbnail preview */}
              {reply.media_url && reply.media_type === 'image' && (
                <div className="mb-2">
                  <Image
                    src={reply.media_url}
                    alt="Preview"
                    width={80}
                    height={80}
                    className="rounded border object-cover"
                    style={{ width: '80px', height: '80px' }}
                  />
                </div>
              )}

              <p className="text-sm text-muted-foreground line-clamp-3">
                {reply.content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingReply} onOpenChange={() => setEditingReply(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Respuesta Rapida</DialogTitle>
          </DialogHeader>
          {editingReply && (
            <QuickReplyForm
              quickReply={editingReply}
              onSuccess={() => setEditingReply(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
