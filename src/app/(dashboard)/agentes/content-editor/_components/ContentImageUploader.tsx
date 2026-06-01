'use client'

// ============================================================================
// ContentImageUploader — image upload for content_type='imagen' (D-05).
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// Clones the builder/components/image-uploader.tsx flow:
//   1. client MIME/size validation (jpeg/png ≤5MB) — defense in depth; the
//      endpoint re-validates server-side.
//   2. POST multipart to /api/config-builder/templates/upload.
//   3. On success, the returned publicUrl is pushed up via onUploaded so the
//      parent TemplateForm sets its `content` field (D-05 — autofill publicUrl).
//   4. sonner toasts on error.
// ============================================================================

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, X } from 'lucide-react'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matching server
const ALLOWED_MIMES = ['image/jpeg', 'image/png'] as const

interface Props {
  /** Current content value (a publicUrl when an image was already uploaded). */
  value: string
  /** Called with the returned publicUrl on a successful upload (D-05 autofill). */
  onUploaded: (publicUrl: string) => void
  /** Clears the content field. */
  onClear: () => void
  disabled?: boolean
}

export function ContentImageUploader({ value, onUploaded, onClear, disabled }: Props) {
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-selecting the same file

    if (file.size > MAX_BYTES) {
      toast.error(
        `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`,
      )
      return
    }
    if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
      toast.error('Solo se aceptan imágenes JPG o PNG')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/config-builder/templates/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error(err.error || 'Error subiendo imagen')
        return
      }

      const data = (await res.json()) as {
        storagePath: string
        publicUrl: string
        mimeType: string
      }
      // D-05: autofill the public URL into the template content field.
      onUploaded(data.publicUrl)
      toast.success('Imagen subida — URL pública insertada en el contenido')
    } catch (err) {
      toast.error(
        `Error inesperado: ${err instanceof Error ? err.message : 'unknown'}`,
      )
    } finally {
      setUploading(false)
    }
  }

  const hasImage = value.trim().length > 0

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Imagen del contenido</label>

      {hasImage ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Preview"
            className="rounded max-w-xs border"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={uploading || disabled}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Quitar imagen
            </button>
            {uploading && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Subiendo...
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground break-all">{value}</p>
        </div>
      ) : (
        <label
          className={`flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-3 py-4 text-sm text-muted-foreground hover:bg-muted/50 transition-colors ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span>{uploading ? 'Subiendo...' : 'Seleccionar imagen'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={uploading || disabled}
            className="hidden"
          />
        </label>
      )}

      <div className="text-xs text-muted-foreground">JPG o PNG, máximo 5 MB</div>
    </div>
  )
}
