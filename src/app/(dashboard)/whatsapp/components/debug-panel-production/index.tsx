'use client'

/**
 * Production debug panel container — shown as the right pane of an
 * Allotment split when the super-user toggles the "Debug bot" button
 * in the chat header.
 *
 * Layout:
 *   ┌───────────────────────────────────────┐
 *   │ header: "Debug bot · <convId prefix>" │
 *   ├─────────────┬─────────────────────────┤
 *   │ TurnList    │ Detail (Plan 10 stub)   │
 *   │ (256px)     │                         │
 *   │             │                         │
 *   └─────────────┴─────────────────────────┘
 *
 * Detail pane is intentionally a stub until Plan 10 wires the full
 * turn timeline (events + queries + ai_calls + prompt versions).
 */

import { useState } from 'react'
import { TurnList } from './turn-list'

interface Props {
  conversationId: string
}

export function DebugPanelProduction({ conversationId }: Props) {
  const [selectedTurn, setSelectedTurn] = useState<{
    id: string
    startedAt: string
  } | null>(null)

  return (
    <div className="h-full flex flex-col bg-background border-l">
      <div className="h-10 px-3 flex items-center border-b flex-shrink-0">
        <span className="text-sm font-semibold">Debug bot</span>
        <span className="ml-2 text-xs text-muted-foreground font-mono">
          {conversationId.slice(0, 8)}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-64 border-r flex-shrink-0">
          <TurnList
            conversationId={conversationId}
            selectedTurnId={selectedTurn?.id ?? null}
            onSelectTurn={(id, startedAt) => setSelectedTurn({ id, startedAt })}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedTurn ? (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Turno seleccionado</p>
              <p className="text-xs mt-1 font-mono">{selectedTurn.id}</p>
              <p className="text-xs mt-1">
                {new Date(selectedTurn.startedAt).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                })}
              </p>
              <p className="mt-4 italic">
                Detalle del turno — implementado en Plan 10.
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Selecciona un turno de la lista.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
