'use client'

/**
 * 3-tab wrapper for the production debug panel right pane (D-02).
 *
 * - `forensics` (default): condensed timeline + session snapshot (Plan 02 + Plan 03).
 * - `raw`: existing `TurnDetailView` reused verbatim — the full event/query/
 *   ai-call timeline remains one click away (Pitfall 5 mitigation).
 * - `auditor`: AuditorTab con useChat + ReactMarkdown + Copiar (Plan 04).
 *
 * Introduced by standalone phase `agent-forensics-panel` Plan 02; Auditor wired in Plan 04.
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ForensicsTab } from './forensics-tab'
import { TurnDetailView } from './turn-detail'
import { AuditorTab } from './auditor-tab'

interface Props {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

export function DebugPanelTabs({
  turnId,
  startedAt,
  respondingAgentId,
  conversationId,
}: Props) {
  return (
    <Tabs defaultValue="forensics" className="h-full flex flex-col gap-0">
      <TabsList
        variant="line"
        className="flex-shrink-0 justify-start border-b rounded-none bg-transparent p-0 h-auto w-full"
      >
        <TabsTrigger
          value="forensics"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary flex-none"
        >
          Forensics
        </TabsTrigger>
        <TabsTrigger
          value="raw"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary flex-none"
        >
          Raw
        </TabsTrigger>
        <TabsTrigger
          value="auditor"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary flex-none"
        >
          Auditor
        </TabsTrigger>
      </TabsList>

      <TabsContent value="forensics" className="flex-1 min-h-0 mt-0">
        <ForensicsTab
          turnId={turnId}
          startedAt={startedAt}
          respondingAgentId={respondingAgentId}
          conversationId={conversationId}
        />
      </TabsContent>

      <TabsContent value="raw" className="flex-1 min-h-0 mt-0">
        <TurnDetailView turnId={turnId} startedAt={startedAt} />
      </TabsContent>

      <TabsContent value="auditor" className="flex-1 min-h-0 mt-0">
        <AuditorTab
          turnId={turnId}
          startedAt={startedAt}
          respondingAgentId={respondingAgentId}
          conversationId={conversationId}
        />
      </TabsContent>
    </Tabs>
  )
}
