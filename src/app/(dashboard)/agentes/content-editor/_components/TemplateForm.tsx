'use client'

// ============================================================================
// TemplateForm — create/edit a single agent_templates row.
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// Edit mode: row supplied → calls updateTemplateAction (id + editable fields).
// Add mode:  intent + visit_type FIXED by the parent group (D-08 — no free-text
//            new intent) → calls addTemplateAction.
// content_type='imagen' renders ContentImageUploader (D-05 — publicUrl autofill).
// Errors surfaced via sonner toast.
// ============================================================================

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  updateTemplateAction,
  addTemplateAction,
} from '@/app/actions/agent-content-editor'
import type { AgentTemplateRow } from '@/lib/domain/agent-templates'
import { ContentImageUploader } from './ContentImageUploader'

type ContentType = 'texto' | 'template' | 'imagen'
type Priority = 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
type VisitType = 'primera_vez' | 'siguientes'

interface Props {
  agentId: string
  /** Present in edit mode. */
  row?: AgentTemplateRow
  /** Add mode only — the intent/visit_type are fixed to the group. */
  addContext?: { intent: string; visit_type: VisitType; nextOrden: number }
  onSaved: () => void
  onCancel: () => void
}

export function TemplateForm({ agentId, row, addContext, onSaved, onCancel }: Props) {
  const isEdit = !!row
  const [content, setContent] = useState(row?.content ?? '')
  const [contentType, setContentType] = useState<ContentType>(
    (row?.content_type as ContentType) ?? 'texto',
  )
  const [delayS, setDelayS] = useState<number>(row?.delay_s ?? 0)
  const [priority, setPriority] = useState<Priority>(
    (row?.priority as Priority) ?? 'CORE',
  )
  const [minifrase, setMinifrase] = useState<string>(row?.minifrase ?? '')
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    startTransition(async () => {
      const minifraseValue = minifrase.trim() === '' ? null : minifrase
      if (isEdit && row) {
        const res = await updateTemplateAction({
          id: row.id,
          agentId,
          content,
          content_type: contentType,
          delay_s: delayS,
          priority,
          minifrase: minifraseValue,
        })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success('Template actualizado')
        onSaved()
      } else if (addContext) {
        const res = await addTemplateAction({
          agentId,
          intent: addContext.intent,
          visit_type: addContext.visit_type,
          orden: addContext.nextOrden,
          content_type: contentType,
          content,
          delay_s: delayS,
          priority,
          minifrase: minifraseValue,
        })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success('Template agregado')
        onSaved()
      }
    })
  }

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-4">
      {!isEdit && addContext && (
        <p className="text-xs text-muted-foreground">
          Agregando a intent <strong>{addContext.intent}</strong> /{' '}
          {addContext.visit_type} (el intent es fijo — D-08).
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tipo de contenido</span>
          <select
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
          >
            <option value="texto">texto</option>
            <option value="template">template</option>
            <option value="imagen">imagen</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Prioridad</span>
          <select
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="CORE">CORE</option>
            <option value="COMPLEMENTARIA">COMPLEMENTARIA</option>
            <option value="OPCIONAL">OPCIONAL</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Delay (segundos)</span>
          <input
            type="number"
            min={0}
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={delayS}
            onChange={(e) => setDelayS(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Minifrase (opcional)</span>
          <input
            type="text"
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={minifrase}
            onChange={(e) => setMinifrase(e.target.value)}
          />
        </label>
      </div>

      {contentType === 'imagen' ? (
        <ContentImageUploader
          value={content}
          onUploaded={(url) => setContent(url)}
          onClear={() => setContent('')}
          disabled={isPending}
        />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Contenido</span>
          <textarea
            rows={4}
            className="rounded-md border px-3 py-2 bg-background text-sm font-mono"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? 'Guardando...' : isEdit ? 'Guardar' : 'Agregar'}
        </Button>
      </div>
    </div>
  )
}
