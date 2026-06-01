'use client'

// ============================================================================
// KbTopicForm — create/edit a KB topic with all editable fields (D-09/D-10).
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// Editable fields: topic, category, scope_summary (D-10 — controls which queries
// reach this KB), keywords (D-10 tag input), hechos_del_producto,
// posicion_del_negocio, debe_contener / nunca_decir / cuando_escalar (bullet
// editors → string[]), tone_override, escalate_triggers, related_topics.
//
// Submit calls createKbTopicAction or updateKbTopicAction. While saving, shows a
// spinner "Guardando y regenerando embedding…" (D-06 synchronous re-embed). On
// error (incl. OpenAI re-embed failure) shows a sonner toast and keeps the form
// open.
// ============================================================================

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createKbTopicAction,
  updateKbTopicAction,
} from '@/app/actions/agent-content-editor'
import type { AgentKbRow } from '@/lib/domain/agent-knowledge-base'

type Category = 'product' | 'policies' | 'edge-cases' | 'faqs-no-templated'

interface Props {
  agentId: string
  /** Present in edit mode. */
  row?: AgentKbRow
  onSaved: () => void
  onCancel: () => void
}

/** Tag input: comma/Enter-separated values rendered as removable chips. */
function TagInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const t = draft.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <div className="flex flex-wrap gap-1 rounded-md border bg-background p-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
          value={draft}
          placeholder="Escribe y Enter..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
        />
      </div>
    </label>
  )
}

/** Bullet editor: one item per line → string[]. */
function BulletEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">Un punto por línea.</span>
      <textarea
        rows={3}
        className="rounded-md border px-3 py-2 bg-background text-sm"
        value={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l.length > 0),
          )
        }
      />
    </label>
  )
}

export function KbTopicForm({ agentId, row, onSaved, onCancel }: Props) {
  const isEdit = !!row
  const [topic, setTopic] = useState(row?.topic ?? '')
  const [category, setCategory] = useState<Category>(
    (row?.category as Category) ?? 'product',
  )
  const [scopeSummary, setScopeSummary] = useState(row?.scope_summary ?? '')
  const [keywords, setKeywords] = useState<string[]>(row?.keywords ?? [])
  const [hechos, setHechos] = useState(row?.hechos_del_producto ?? '')
  const [posicion, setPosicion] = useState(row?.posicion_del_negocio ?? '')
  const [debeContener, setDebeContener] = useState<string[]>(row?.debe_contener ?? [])
  const [nuncaDecir, setNuncaDecir] = useState<string[]>(row?.nunca_decir ?? [])
  const [cuandoEscalar, setCuandoEscalar] = useState<string[]>(
    row?.cuando_escalar ?? [],
  )
  const [toneOverride, setToneOverride] = useState(row?.tone_override ?? '')
  const [escalateTriggers, setEscalateTriggers] = useState<string[]>(
    row?.escalate_triggers ?? [],
  )
  const [relatedTopics, setRelatedTopics] = useState<string[]>(
    row?.related_topics ?? [],
  )
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    if (topic.trim() === '') {
      toast.error('El topic es obligatorio')
      return
    }
    const shared = {
      topic: topic.trim(),
      category,
      keywords,
      scope_summary: scopeSummary.trim() === '' ? null : scopeSummary,
      hechos_del_producto: hechos.trim() === '' ? null : hechos,
      posicion_del_negocio: posicion.trim() === '' ? null : posicion,
      debe_contener: debeContener,
      nunca_decir: nuncaDecir,
      cuando_escalar: cuandoEscalar,
      tone_override: toneOverride.trim() === '' ? null : toneOverride,
      escalate_triggers: escalateTriggers,
      related_topics: relatedTopics,
    }
    startTransition(async () => {
      const res =
        isEdit && row
          ? await updateKbTopicAction({ ...shared, kbId: row.id, agentId })
          : await createKbTopicAction({ ...shared, agentId })
      if (!res.success) {
        // D-06: OpenAI re-embed failures surface verbatim; keep the form open.
        toast.error(res.error || 'Falló el re-embed, reintenta')
        return
      }
      toast.success(isEdit ? 'Tema actualizado' : 'Tema creado')
      onSaved()
    })
  }

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Topic</span>
          <input
            type="text"
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Categoría</span>
          <select
            className="rounded-md border px-3 py-2 bg-background text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            <option value="product">product</option>
            <option value="policies">policies</option>
            <option value="edge-cases">edge-cases</option>
            <option value="faqs-no-templated">faqs-no-templated</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Resumen de alcance — controla a qué consultas llega este KB
        </span>
        <textarea
          rows={2}
          className="rounded-md border px-3 py-2 bg-background text-sm"
          value={scopeSummary}
          onChange={(e) => setScopeSummary(e.target.value)}
        />
      </label>

      <TagInput
        label="Keywords"
        hint="Palabras clave que ayudan a recuperar este KB."
        value={keywords}
        onChange={setKeywords}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Hechos del producto</span>
        <textarea
          rows={3}
          className="rounded-md border px-3 py-2 bg-background text-sm"
          value={hechos}
          onChange={(e) => setHechos(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Posición del negocio</span>
        <textarea
          rows={3}
          className="rounded-md border px-3 py-2 bg-background text-sm"
          value={posicion}
          onChange={(e) => setPosicion(e.target.value)}
        />
      </label>

      <BulletEditor
        label="Debe contener la respuesta"
        value={debeContener}
        onChange={setDebeContener}
      />
      <BulletEditor label="NUNCA decir" value={nuncaDecir} onChange={setNuncaDecir} />
      <BulletEditor
        label="Cuándo escalar a humano"
        value={cuandoEscalar}
        onChange={setCuandoEscalar}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Tono (override, opcional)</span>
        <input
          type="text"
          className="rounded-md border px-3 py-2 bg-background text-sm"
          value={toneOverride}
          onChange={(e) => setToneOverride(e.target.value)}
        />
      </label>

      <TagInput
        label="Escalate triggers"
        value={escalateTriggers}
        onChange={setEscalateTriggers}
      />
      <TagInput
        label="Related topics"
        value={relatedTopics}
        onChange={setRelatedTopics}
      />

      {isPending && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Guardando y regenerando embedding…
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </div>
  )
}
