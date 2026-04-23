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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface QuickReplyListProps {
  quickReplies: QuickReply[]
  v2?: boolean
}

export function QuickReplyList({ quickReplies, v2: v2Prop }: QuickReplyListProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const router = useRouter()
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)

  async function handleDelete(reply: QuickReply) {
    try {
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
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined
  const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined

  if (quickReplies.length === 0) {
    if (v2) {
      return (
        <div className="text-center py-12 flex flex-col items-center gap-3">
          <MessageSquare className="h-10 w-10 text-[var(--ink-3)] opacity-50" />
          <p className="mx-h3">No hay respuestas rapidas todavia.</p>
          <p className="mx-caption">Crea respuestas rapidas para agilizar la atencion al cliente.</p>
          <p className="mx-rule-ornament">· · ·</p>
        </div>
      )
    }
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

  if (v2) {
    return (
      <>
        <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)] w-[160px]" style={v2FontSans}>Atajo</th>
                <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={v2FontSans}>Mensaje</th>
                <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)] w-[80px]" style={v2FontSans}>Media</th>
                <th className="border-b border-[var(--ink-1)] bg-[var(--paper-1)] w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {quickReplies.map((reply) => (
                <tr key={reply.id} className="hover:bg-[var(--paper-1)]">
                  <td className="px-[12px] py-[10px] border-b border-[var(--border)]">
                    <code className="text-[12px] font-bold bg-[var(--paper-2)] border border-[var(--border)] text-[var(--ink-1)] px-[8px] py-[3px] rounded-[var(--radius-2)]" style={v2FontMono}>
                      /{reply.shortcut}
                    </code>
                  </td>
                  <td className="px-[12px] py-[10px] border-b border-[var(--border)]">
                    <p className="text-[13px] text-[var(--ink-2)] line-clamp-2" style={v2FontSans}>
                      {reply.content}
                    </p>
                  </td>
                  <td className="px-[12px] py-[10px] border-b border-[var(--border)]">
                    {reply.media_url && reply.media_type === 'image' ? (
                      <Image
                        src={reply.media_url}
                        alt="Preview"
                        width={48}
                        height={48}
                        className="rounded-[var(--radius-2)] border border-[var(--border)] object-cover"
                        style={{ width: '48px', height: '48px' }}
                      />
                    ) : reply.media_url ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-2)] border border-[var(--border)] bg-[var(--paper-2)] text-[var(--ink-3)]">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--ink-3)]" style={v2FontSans}>—</span>
                    )}
                  </td>
                  <td className="px-[12px] py-[10px] border-b border-[var(--border)] text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingReply(reply)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[oklch(0.55_0.14_28)] hover:bg-[oklch(0.98_0.02_28)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[20px] font-bold tracking-[-0.01em]" style={v2FontDisplay}>Eliminar respuesta</AlertDialogTitle>
                            <AlertDialogDescription className="text-[13px] text-[var(--ink-2)]" style={v2FontSans}>
                              Esta accion no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]" style={v2FontSans}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(reply)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] text-[13px] font-semibold"
                              style={v2FontSans}
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Dialog open={!!editingReply} onOpenChange={() => setEditingReply(null)}>
          <DialogContent className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]">
            <DialogHeader>
              <DialogTitle className="text-[20px] font-bold tracking-[-0.01em]" style={v2FontDisplay}>Editar Respuesta Rapida</DialogTitle>
            </DialogHeader>
            {editingReply && (
              <QuickReplyForm
                quickReply={editingReply}
                onSuccess={() => setEditingReply(null)}
                v2={v2}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    )
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
