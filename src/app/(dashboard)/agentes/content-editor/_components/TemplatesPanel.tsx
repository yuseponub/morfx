'use client'

// ============================================================================
// TemplatesPanel — list + edit/add/delete/reorder agent templates (D-08).
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// On mount: getTemplatesAction(agentId) + getIntentsAction(agentId). Rows are
// grouped by intent → visit_type, ordered by `orden`. When editable:
//   - "Agregar template" per group adds INTO that EXISTING intent only (D-08 —
//     no free-text new-intent field; intent is fixed to the group).
//   - reorder controls (up/down) call reorderTemplatesAction.
//   - edit + delete per row.
// When NOT editable: read-only rows, no buttons.
// D-03b notice: changes propagate to runtime in ≤5 min (TemplateManager cache).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getTemplatesAction,
  getIntentsAction,
  deleteTemplateAction,
  reorderTemplatesAction,
} from '@/app/actions/agent-content-editor'
import type { AgentTemplateRow } from '@/lib/domain/agent-templates'
import { TemplateForm } from './TemplateForm'

type VisitType = 'primera_vez' | 'siguientes'

interface Props {
  agentId: string
  editable: boolean
}

interface GroupKey {
  intent: string
  visit_type: string
}

function groupKeyStr(g: GroupKey): string {
  return `${g.intent}::${g.visit_type}`
}

export function TemplatesPanel({ agentId, editable }: Props) {
  const [rows, setRows] = useState<AgentTemplateRow[]>([])
  const [, setIntents] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // editingId: row currently being edited. addingTo: group receiving a new row.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [tpl, ints] = await Promise.all([
      getTemplatesAction(agentId),
      getIntentsAction(agentId),
    ])
    if (!tpl.success) {
      setError(tpl.error)
      setRows([])
    } else {
      setRows(tpl.data ?? [])
    }
    if (ints.success) setIntents(ints.data ?? [])
    setLoading(false)
  }, [agentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    setEditingId(null)
    setAddingTo(null)
  }, [load])

  // Group rows by intent → visit_type, each group ordered by `orden`.
  const groups = useMemo(() => {
    const map = new Map<string, { key: GroupKey; items: AgentTemplateRow[] }>()
    for (const r of rows) {
      const key: GroupKey = { intent: r.intent, visit_type: r.visit_type }
      const k = groupKeyStr(key)
      if (!map.has(k)) map.set(k, { key, items: [] })
      map.get(k)!.items.push(r)
    }
    for (const g of map.values()) {
      g.items.sort((a, b) => a.orden - b.orden)
    }
    return Array.from(map.values()).sort((a, b) => {
      const i = a.key.intent.localeCompare(b.key.intent)
      return i !== 0 ? i : a.key.visit_type.localeCompare(b.key.visit_type)
    })
  }, [rows])

  const onDelete = (row: AgentTemplateRow) => {
    if (!confirm(`¿Eliminar este template de "${row.intent}"?`)) return
    startTransition(async () => {
      const res = await deleteTemplateAction({ id: row.id, agentId })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Template eliminado')
      void load()
    })
  }

  const onReorder = (
    key: GroupKey,
    items: AgentTemplateRow[],
    index: number,
    dir: -1 | 1,
  ) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const orderedIds = reordered.map((r) => r.id)
    startTransition(async () => {
      const res = await reorderTemplatesAction({
        agentId,
        intent: key.intent,
        visit_type: key.visit_type,
        orderedIds,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Orden actualizado')
      void load()
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando templates...</p>
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    )
  }
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este agente no tiene templates.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* D-03b / Pitfall 7 — runtime cache notice */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        Los cambios se reflejan en runtime en ≤5 min (cache de TemplateManager).
      </div>

      {groups.map(({ key, items }) => {
        const k = groupKeyStr(key)
        return (
          <section key={k} className="rounded-lg border">
            <header className="flex items-center justify-between border-b px-4 py-2">
              <div>
                <span className="text-sm font-semibold">{key.intent}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {key.visit_type}
                </span>
              </div>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    setEditingId(null)
                    setAddingTo(addingTo === k ? null : k)
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Agregar template
                </Button>
              )}
            </header>

            <div className="divide-y">
              {items.map((row, idx) =>
                editingId === row.id ? (
                  <div key={row.id} className="p-4">
                    <TemplateForm
                      agentId={agentId}
                      row={row}
                      onSaved={() => {
                        setEditingId(null)
                        void load()
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div
                    key={row.id}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">
                          {row.content_type}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5">
                          {row.priority}
                        </span>
                        <span>delay {row.delay_s}s</span>
                        <span>orden {row.orden}</span>
                      </div>
                      {row.content_type === 'imagen' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.content}
                          alt="template"
                          className="mt-2 max-w-[160px] rounded border"
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                          {row.content}
                        </p>
                      )}
                      {row.minifrase && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          minifrase: {row.minifrase}
                        </p>
                      )}
                    </div>

                    {editable && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Subir"
                          disabled={isPending || idx === 0}
                          onClick={() => onReorder(key, items, idx, -1)}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Bajar"
                          disabled={isPending || idx === items.length - 1}
                          onClick={() => onReorder(key, items, idx, 1)}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          disabled={isPending}
                          onClick={() => {
                            setAddingTo(null)
                            setEditingId(row.id)
                          }}
                          className="rounded p-1 hover:bg-muted disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          disabled={isPending}
                          onClick={() => onDelete(row)}
                          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ),
              )}

              {editable && addingTo === k && (
                <div className="p-4">
                  <TemplateForm
                    agentId={agentId}
                    addContext={{
                      intent: key.intent,
                      visit_type: key.visit_type as VisitType,
                      nextOrden: items.length,
                    }}
                    onSaved={() => {
                      setAddingTo(null)
                      void load()
                    }}
                    onCancel={() => setAddingTo(null)}
                  />
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
