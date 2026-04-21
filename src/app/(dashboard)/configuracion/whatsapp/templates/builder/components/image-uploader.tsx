'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.3
// Image uploader para header IMAGE (D-05, D-10, D-11, D-12).
// Flujo:
//   1. File input abre selector nativo
//   2. Validacion client-side (MIME ∈ {jpeg, png}, size ≤ 5 MB) — defensa
//      en profundidad; el server re-valida en /api/config-builder/templates/upload
//   3. Preview inmediato via URL.createObjectURL (headerImageLocalUrl)
//   4. Upload a /api/config-builder/templates/upload (multipart)
//   5. Guardar storagePath en draft (headerImageStoragePath) para submit
//   6. Cleanup URL.revokeObjectURL en remove (T-04-02)
//
// Si upload falla, se revierte el local preview y el headerFormat queda 'NONE'.
// ============================================================================

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, X } from 'lucide-react'
import { useTemplateDraft } from './template-draft-context'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matching server
const ALLOWED_MIMES = ['image/jpeg', 'image/png'] as const

export function ImageUploader() {
  const { draft, dispatch } = useTemplateDraft()
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input value para permitir re-seleccionar el mismo archivo
    e.target.value = ''

    // 1. Validacion client-side (UX temprana)
    if (file.size > MAX_BYTES) {
      toast.error(
        `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximo 5 MB.`
      )
      return
    }
    if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
      toast.error('Solo se aceptan imagenes JPG o PNG')
      return
    }

    // 2. Preview inmediato (sin esperar al server)
    // Revoke anterior local URL si existia (T-04-02)
    if (draft.headerImageLocalUrl) {
      URL.revokeObjectURL(draft.headerImageLocalUrl)
    }
    const localUrl = URL.createObjectURL(file)
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: localUrl })
    dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: 'IMAGE' })
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })

    // 3. Upload al endpoint
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
        // Revertir preview local
        URL.revokeObjectURL(localUrl)
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })
        return
      }

      const data = (await res.json()) as {
        storagePath: string
        publicUrl: string
        mimeType: string
      }
      dispatch({
        type: 'UPDATE_FIELD',
        field: 'headerImageStoragePath',
        value: data.storagePath,
      })
      toast.success('Imagen lista para enviar a Meta')
    } catch (err) {
      toast.error(
        `Error inesperado: ${err instanceof Error ? err.message : 'unknown'}`
      )
      URL.revokeObjectURL(localUrl)
      dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
      dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })
    } finally {
      setUploading(false)
    }
  }

  function handleRemove() {
    if (draft.headerImageLocalUrl) {
      URL.revokeObjectURL(draft.headerImageLocalUrl)
    }
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Imagen del header</label>

      {draft.headerImageLocalUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.headerImageLocalUrl}
            alt="Preview"
            className="rounded max-w-xs border"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
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
            {!uploading && draft.headerImageStoragePath && (
              <span className="text-xs text-emerald-600">Lista</span>
            )}
          </div>
        </div>
      ) : (
        <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-3 py-4 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
          <Upload className="h-4 w-4" />
          <span>Seleccionar imagen</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      )}

      <div className="text-xs text-muted-foreground">JPG o PNG, maximo 5 MB</div>
    </div>
  )
}
