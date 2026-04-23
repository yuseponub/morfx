'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Session History
// Sidebar panel listing past builder sessions. Fetches from the sessions API.
// Supports selecting, deleting, and creating new sessions.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

// ============================================================================
// Types
// ============================================================================

interface SessionSummary {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  automations_created: string[]
}

interface SessionHistoryProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats a date string into a relative time display in Spanish.
 * E.g., "hace 2 horas", "hace 3 dias", "13 feb 2026"
 */
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMinutes < 1) return 'ahora'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`
  if (diffHours < 24) return `hace ${diffHours}h`
  if (diffDays < 7) return `hace ${diffDays}d`

  return date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
}

// ============================================================================
// Component
// ============================================================================

export function SessionHistory({
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionHistoryProps) {
  const v2 = useDashboardV2()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch sessions on mount and when currentSessionId changes
  // (so list refreshes after creating a new session)
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/builder/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch (err) {
      console.error('[session-history] Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions, currentSessionId])

  // Delete a session
  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation() // Prevent triggering onSelectSession
      setDeletingId(sessionId)
      try {
        const res = await fetch(
          `/api/builder/sessions?sessionId=${sessionId}`,
          { method: 'DELETE' }
        )
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        }
      } catch (err) {
        console.error('[session-history] Failed to delete session:', err)
      } finally {
        setDeletingId(null)
      }
    },
    []
  )

  return (
    <div className={cn('flex flex-col h-full', v2 && 'bg-[var(--paper-2)]')}>
      {/* Header with new session button */}
      <div
        className={cn(
          'px-3 py-3 shrink-0',
          v2 ? 'border-b border-[var(--ink-1)] bg-[var(--paper-2)]' : 'border-b'
        )}
      >
        {v2 && (
          <span
            className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)] mb-2 px-1"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Sesiones
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onNewSession}
          className={cn(
            'w-full gap-1.5',
            v2 &&
              'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          <Plus className="h-3.5 w-3.5" />
          {v2 ? 'Nueva sesión' : 'Nueva sesion'}
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              className={cn(
                'h-5 w-5 animate-spin',
                v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
              )}
            />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            {v2 ? (
              <>
                <MessageSquare className="h-7 w-7 text-[var(--ink-4)] mx-auto mb-2" />
                <p
                  className="text-[12px] italic text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  No hay sesiones anteriores.
                </p>
                <p className="mx-rule-ornament">· · ·</p>
              </>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No hay sesiones anteriores
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId
              const isDeleting = session.id === deletingId
              const automationsCount = session.automations_created?.length || 0

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  disabled={isDeleting}
                  className={cn(
                    'group w-full text-left px-3 py-2.5 transition-colors relative',
                    v2
                      ? 'border-b border-dotted border-[var(--border)]'
                      : 'border-b border-border/50',
                    isCurrent
                      ? v2
                        ? 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] pl-[9px]'
                        : 'bg-primary/10 border-l-2 border-l-primary'
                      : v2
                        ? 'hover:bg-[var(--paper-3)]'
                        : 'hover:bg-muted',
                    isDeleting && 'opacity-50'
                  )}
                >
                  {/* Title */}
                  <div
                    className={cn(
                      'truncate pr-8',
                      v2
                        ? 'text-[13px] font-semibold text-[var(--ink-1)]'
                        : 'text-sm font-medium'
                    )}
                    style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                  >
                    {session.title || (v2 ? 'Sesión sin título' : 'Sesion sin titulo')}
                  </div>

                  {/* Meta: date + automations count */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        v2 ? 'text-[11px] italic text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
                    >
                      {formatRelativeDate(session.updated_at)}
                    </span>
                    {automationsCount > 0 && (
                      <span
                        className={cn(
                          v2
                            ? 'mx-tag mx-tag--rubric text-[10px]'
                            : 'text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full'
                        )}
                        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                      >
                        {automationsCount} auto{automationsCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Delete button (visible on hover) */}
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={isDeleting}
                    className={cn(
                      'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1',
                      v2
                        ? 'hover:bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] hover:text-[var(--rubric-2)]'
                        : 'rounded hover:bg-destructive/10 hover:text-destructive'
                    )}
                    aria-label="Eliminar sesion"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
