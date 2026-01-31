'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createQuickReply, updateQuickReply } from '@/app/actions/quick-replies'
import type { QuickReply } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface QuickReplyFormProps {
  quickReply?: QuickReply
  onSuccess?: () => void
}

export function QuickReplyForm({ quickReply, onSuccess }: QuickReplyFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [shortcut, setShortcut] = useState(quickReply?.shortcut || '')
  const [content, setContent] = useState(quickReply?.content || '')

  const isEditing = !!quickReply

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isEditing) {
        const result = await updateQuickReply(quickReply.id, { shortcut, content })
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success('Respuesta actualizada')
      } else {
        const result = await createQuickReply({ shortcut, content })
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success('Respuesta creada')
      }
      router.refresh()
      onSuccess?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shortcut">Atajo</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">/</span>
          <Input
            id="shortcut"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="saludo"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Solo letras minusculas, numeros y guiones bajos
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Contenido</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Hola! Gracias por contactarnos. En que podemos ayudarte?"
          rows={4}
          required
        />
        <p className="text-xs text-muted-foreground">
          Este texto se insertara cuando uses el atajo /{shortcut || 'atajo'}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading || !shortcut.trim() || !content.trim()}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Respuesta'}
        </Button>
      </div>
    </form>
  )
}
