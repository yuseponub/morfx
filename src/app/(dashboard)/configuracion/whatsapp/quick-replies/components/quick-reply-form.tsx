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

interface QuickReplyFormProps {
  quickReply?: QuickReply
  onSuccess?: () => void
}

export function QuickReplyForm({ quickReply, onSuccess }: QuickReplyFormProps) {
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

      {/* Media upload section */}
      <div className="space-y-2">
        <Label>Imagen (opcional)</Label>

        {isCompressing ? (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">
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
              className="rounded-lg border object-cover"
              style={{ maxWidth: '200px', maxHeight: '200px' }}
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6"
              onClick={handleRemoveMedia}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click para agregar imagen
            </p>
            <p className="text-xs text-muted-foreground mt-1">
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading || isCompressing || !shortcut.trim() || !content.trim()}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Respuesta'}
        </Button>
      </div>
    </form>
  )
}
