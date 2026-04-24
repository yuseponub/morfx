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
 * Detail pane renders the full turn timeline (Plan 10): events +
 * queries + ai_calls merged by sequence, each row expandable to show
 * the underlying JSON payload, SQL filters/body, or AI prompt/
 * messages/response.
 */

import { useState } from 'react'
import { TurnList } from './turn-list'
import { DebugPanelTabs } from './tabs'

interface Props {
  conversationId: string
}

export function DebugPanelProduction({ conversationId }: Props) {
  const [selectedTurn, setSelectedTurn] = useState<{
    id: string
    startedAt: string
    respondingAgentId: string | null
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
            onSelectTurn={(id, startedAt, respondingAgentId) =>
              setSelectedTurn({ id, startedAt, respondingAgentId })
            }
          />
        </div>
        <div className="flex-1 min-w-0 min-h-0">
          {selectedTurn ? (
            <DebugPanelTabs
              key={selectedTurn.id}
              turnId={selectedTurn.id}
              startedAt={selectedTurn.startedAt}
              respondingAgentId={selectedTurn.respondingAgentId}
              conversationId={conversationId}
            />
          ) : (
            <div className="h-full flex items-center justify-center p-4">
              <div className="text-sm text-muted-foreground italic">
                Selecciona un turno de la lista.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
