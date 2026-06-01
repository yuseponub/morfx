'use client'

// ============================================================================
// KbVersionsPanel — version history (view / search / restore) for a KB topic.
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// D-01b: lists versions of the selected topic (listKbVersionsAction), supports a
//        topic search across the agent's versions (searchKbVersionsAction), and a
//        "Restaurar" per version (restoreKbVersionAction) behind a confirm dialog
//        (restore re-embeds + snapshots the current state first). Refreshes after
//        restore.
// Timestamps render in America/Bogota (Regla 2).
// ============================================================================

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  listKbVersionsAction,
  searchKbVersionsAction,
  restoreKbVersionAction,
} from '@/app/actions/agent-content-editor'
import type { KbVersionRow } from '@/lib/domain/agent-knowledge-base'

interface Props {
  agentId: string
  kbId: string
  editable: boolean
  /** Called after a successful restore so the parent reloads the topic + list. */
  onRestored: () => void
}

function fmtBogota(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
    })
  } catch {
    return iso
  }
}

export function KbVersionsPanel({ agentId, kbId, editable, onRestored }: Props) {
  const [versions, setVersions] = useState<KbVersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listKbVersionsAction(kbId, agentId)
    if (res.success) setVersions(res.data ?? [])
    else toast.error(res.error)
    setLoading(false)
  }, [agentId, kbId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const onSearch = () => {
    if (search.trim() === '') {
      void load()
      return
    }
    setSearching(true)
    startTransition(async () => {
      const res = await searchKbVersionsAction({ agentId, topic: search.trim() })
      if (res.success) setVersions(res.data ?? [])
      else toast.error(res.error)
      setSearching(false)
    })
  }

  const onRestore = (v: KbVersionRow) => {
    if (
      !confirm(
        `¿Restaurar la versión #${v.version_num} de "${v.topic}"? Esto regenera el embedding y guarda primero la versión actual como snapshot.`,
      )
    )
      return
    startTransition(async () => {
      const res = await restoreKbVersionAction({
        kbId,
        versionId: v.id,
        agentId,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Versión restaurada')
      await load()
      onRestored()
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historial de versiones</h3>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Buscar versiones por topic..."
          className="flex-1 rounded-md border px-3 py-2 bg-background text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch()
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSearch}
          disabled={searching || isPending}
        >
          <Search className="h-3.5 w-3.5 mr-1" />
          Buscar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando versiones...</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin versiones.</p>
      ) : (
        <ul className="divide-y">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">#{v.version_num}</span>
                <span className="ml-2 text-muted-foreground">{v.topic}</span>
                <div className="text-xs text-muted-foreground">
                  {fmtBogota(v.created_at)} · {v.edited_by}
                </div>
              </div>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => onRestore(v)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
