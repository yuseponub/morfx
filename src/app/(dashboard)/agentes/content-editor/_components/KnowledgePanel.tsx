'use client'

// ============================================================================
// KnowledgePanel — KB topic CRUD + versions (D-09/D-10/D-01b).
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// On mount: getKbListAction(agentId). Topics grouped by category. When editable:
//   - "Crear topic" button + edit/delete per topic.
//   - selecting a topic shows the KbVersionsPanel (view/search/restore).
// When NOT editable: read-only list (no buttons, no version restore).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getKbListAction,
  deleteKbTopicAction,
} from '@/app/actions/agent-content-editor'
import type { AgentKbRow } from '@/lib/domain/agent-knowledge-base'
import { KbTopicForm } from './KbTopicForm'
import { KbVersionsPanel } from './KbVersionsPanel'

interface Props {
  agentId: string
  editable: boolean
}

export function KnowledgePanel({ agentId, editable }: Props) {
  const [rows, setRows] = useState<AgentKbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [versionsForId, setVersionsForId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getKbListAction(agentId)
    if (!res.success) {
      setError(res.error)
      setRows([])
    } else {
      setRows(res.data ?? [])
    }
    setLoading(false)
  }, [agentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    setCreating(false)
    setEditingId(null)
    setVersionsForId(null)
  }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, AgentKbRow[]>()
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, [])
      map.get(r.category)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const onDelete = (row: AgentKbRow) => {
    if (!confirm(`¿Eliminar el tema "${row.topic}"? Esto borra también sus versiones.`))
      return
    startTransition(async () => {
      const res = await deleteKbTopicAction({ kbId: row.id, agentId })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Tema eliminado')
      void load()
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando base de conocimiento...</p>
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingId(null)
              setVersionsForId(null)
              setCreating((c) => !c)
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Crear topic
          </Button>
        </div>
      )}

      {editable && creating && (
        <KbTopicForm
          agentId={agentId}
          onSaved={() => {
            setCreating(false)
            void load()
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {groups.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          Este agente no tiene temas de KB.
        </p>
      ) : (
        groups.map(([category, items]) => (
          <section key={category} className="rounded-lg border">
            <header className="border-b px-4 py-2">
              <span className="text-sm font-semibold">{category}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {items.length} tema{items.length === 1 ? '' : 's'}
              </span>
            </header>
            <div className="divide-y">
              {items.map((row) =>
                editingId === row.id ? (
                  <div key={row.id} className="p-4">
                    <KbTopicForm
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
                  <div key={row.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{row.topic}</p>
                        {row.scope_summary && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.scope_summary}
                          </p>
                        )}
                        {row.keywords.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.keywords.map((k) => (
                              <span
                                key={k}
                                className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Versiones"
                          onClick={() =>
                            setVersionsForId(
                              versionsForId === row.id ? null : row.id,
                            )
                          }
                          className="rounded p-1 hover:bg-muted"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        {editable && (
                          <>
                            <button
                              type="button"
                              title="Editar"
                              disabled={isPending}
                              onClick={() => {
                                setCreating(false)
                                setVersionsForId(null)
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
                          </>
                        )}
                      </div>
                    </div>

                    {versionsForId === row.id && (
                      <div className="mt-3">
                        <KbVersionsPanel
                          agentId={agentId}
                          kbId={row.id}
                          editable={editable}
                          onRestored={() => void load()}
                        />
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
