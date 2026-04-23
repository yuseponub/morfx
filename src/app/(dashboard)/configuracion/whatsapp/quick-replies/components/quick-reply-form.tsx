'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import imageCompression from 'browser-image-compression'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createQuickReply, updateQuickReply, uploadQuickReplyMedia, deleteQuickReplyMedia } from '@/app/actions/quick-replies'
import type { QuickReply } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2, ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface QuickReplyFormProps {
  quickReply?: QuickReply
  onSuccess?: () => void
  v2?: boolean
}

export function QuickReplyForm({ quickReply, onSuccess, v2: v2Prop }: QuickReplyFormProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [shortcut, setShortcut] = useState(quickReply?.shortcut || '')
  const [content, setContent] = useState(quickReply?.content || '')

  // Media state
  const [mediaUrl, setMediaUrl] = useState<string | null>(quickReply?.media_url || null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'document' | 'audio' | null>(quickReply?.media_type || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(quickReply?.media_url || null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)

  const isEditing = !!quickReply

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (only images for now)
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imagenes')
      return
    }

    setIsCompressing(true)

    try {
      // Always compress if larger than 2MB (safe for base64 upload)
      let processedFile = file
      if (file.size > 2 * 1024 * 1024) {
        const options = {
          maxSizeMB: 2, // Safe size for base64 payload
          maxWidthOrHeight: 1600,
          useWebWorker: false,
          initialQuality: 0.8,
        }
        processedFile = await imageCompression(file, options)
        toast.success(`Imagen comprimida: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(processedFile.size / 1024 / 1024).toFixed(1)}MB`)
      }

      setSelectedFile(processedFile)
      setPreviewUrl(URL.createObjectURL(processedFile))
      setMediaType('image')
    } catch (error) {
      console.error('Error compressing image:', error)
      toast.error('Error al procesar la imagen')
    } finally {
      setIsCompressing(false)
    }
  }

  const handleRemoveMedia = async () => {
    // If editing and had existing media, delete from storage
    if (isEditing && mediaUrl && !selectedFile) {
      try {
        await deleteQuickReplyMedia(mediaUrl)
      } catch (error) {
        console.error('Error deleting media:', error)
      }
    }

    setSelectedFile(null)
    setPreviewUrl(null)
    setMediaUrl(null)
    setMediaType(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let finalMediaUrl = mediaUrl
      let finalMediaType = mediaType

      // Upload new file if selected
      if (selectedFile) {
        // Check file size before upload (max 3MB for base64 payload safety)
        if (selectedFile.size > 3 * 1024 * 1024) {
          toast.error(`Archivo muy grande (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Max 3MB despues de compresion.`)
          return
        }

        // Convert file to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(selectedFile)
        })

        const uploadResult = await uploadQuickReplyMedia(base64, selectedFile.name, selectedFile.type)
        if ('error' in uploadResult) {
          toast.error(uploadResult.error)
          console.error('Upload error:', uploadResult)
          return
        }
        finalMediaUrl = uploadResult.data.url
        finalMediaType = uploadResult.data.type

        // If editing and had old media, delete it
        if (isEditing && quickReply.media_url && quickReply.media_url !== finalMediaUrl) {
          try {
            await deleteQuickReplyMedia(quickReply.media_url)
          } catch (error) {
            console.error('Error deleting old media:', error)
          }
        }
      }

      if (isEditing) {
        const result = await updateQuickReply(quickReply.id, {
          shortcut,
          content,
          media_url: finalMediaUrl,
          media_type: finalMediaType
        })
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success('Respuesta actualizada')
      } else {
        const result = await createQuickReply({
          shortcut,
          content,
          media_url: finalMediaUrl,
          media_type: finalMediaType
        })
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

  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const textareaV2 = inputV2
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shortcut" className={labelV2} style={v2FontSans}>Atajo</Label>
        <div className="flex items-center gap-2">
          <span className={cn('text-muted-foreground', v2 && '!text-[var(--ink-3)] !text-[15px] !font-mono')} style={v2FontMono}>/</span>
          <Input
            id="shortcut"
            className={inputV2}
            style={v2FontMono}
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="saludo"
            required
          />
        </div>
        <p className={hintV2} style={v2FontSans}>
          Solo letras minusculas, numeros y guiones bajos
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content" className={labelV2} style={v2FontSans}>Contenido</Label>
        <Textarea
          id="content"
          className={textareaV2}
          style={v2FontSans}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Hola! Gracias por contactarnos. En que podemos ayudarte?"
          rows={4}
          required
        />
        <p className={hintV2} style={v2FontSans}>
          Este texto se insertara cuando uses el atajo /{shortcut || 'atajo'}
        </p>
      </div>

      {/* Media upload section */}
      <div className="space-y-2">
        <Label className={labelV2} style={v2FontSans}>Imagen (opcional)</Label>

        {isCompressing ? (
          <div className={cn('border-2 border-dashed rounded-lg p-6 text-center', v2 && '!border-[var(--border)] !bg-[var(--paper-1)] !rounded-[var(--radius-3)]')}>
            <Loader2 className={cn('h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin', v2 && '!text-[var(--ink-3)]')} />
            <p className={cn('text-sm text-muted-foreground', v2 && '!text-[13px] !text-[var(--ink-3)]')} style={v2FontSans}>
              Comprimiendo imagen...
            </p>
          </div>
        ) : previewUrl ? (
          <div className="relative inline-block">
            <Image
              src={previewUrl}
              alt="Preview"
              width={200}
              height={200}
              className={cn('rounded-lg border object-cover', v2 && '!rounded-[var(--radius-3)] !border-[var(--border)]')}
              style={{ maxWidth: '200px', maxHeight: '200px' }}
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className={cn('absolute -top-2 -right-2 h-6 w-6', v2 && '!bg-[var(--paper-0)] !border !border-[oklch(0.75_0.10_28)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)]')}
              onClick={handleRemoveMedia}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              v2
                ? '!border-[var(--border)] !bg-[var(--paper-1)] !rounded-[var(--radius-3)] hover:!bg-[var(--paper-2)]'
                : 'hover:bg-muted/50'
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className={cn('h-8 w-8 mx-auto text-muted-foreground mb-2', v2 && '!text-[var(--ink-3)]')} />
            <p className={cn('text-sm text-muted-foreground', v2 && '!text-[13px] !text-[var(--ink-2)]')} style={v2FontSans}>
              Click para agregar imagen
            </p>
            <p className={cn('text-xs text-muted-foreground mt-1', v2 && '!text-[11px] !text-[var(--ink-3)]')} style={v2FontSans}>
              JPG, PNG, GIF (se comprime automaticamente)
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className={cn('flex justify-end gap-2 pt-2', v2 && 'border-t border-[var(--border)]')}>
        <Button type="submit" disabled={loading || isCompressing || !shortcut.trim() || !content.trim()} className={btnPrimaryV2} style={v2FontSans}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Respuesta'}
        </Button>
      </div>
    </form>
  )
}
