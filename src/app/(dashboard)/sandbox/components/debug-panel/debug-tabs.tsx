'use client'

/**
 * Debug Tabs Component
 * Phase 15: Agent Sandbox
 *
 * Tab container for the debug panel.
 * Uses Radix UI Tabs (already in project).
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, FileJson, Brain, Coins } from 'lucide-react'
import { ToolsTab } from './tools-tab'
import { StateTab } from './state-tab'
import { IntentTab } from './intent-tab'
import { TokensTab } from './tokens-tab'
import type { DebugTurn, SandboxState } from '@/lib/sandbox/types'

interface DebugTabsProps {
  debugTurns: DebugTurn[]
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
  totalTokens: number
}

export function DebugTabs({
  debugTurns,
  state,
  onStateEdit,
  totalTokens,
}: DebugTabsProps) {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-medium">Debug Panel</h3>
      </div>

      <Tabs defaultValue="tools" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-4">
          <TabsTrigger value="tools" className="text-xs">
            <Wrench className="h-3.5 w-3.5 mr-1" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="state" className="text-xs">
            <FileJson className="h-3.5 w-3.5 mr-1" />
            Estado
          </TabsTrigger>
          <TabsTrigger value="intent" className="text-xs">
            <Brain className="h-3.5 w-3.5 mr-1" />
            Intent
          </TabsTrigger>
          <TabsTrigger value="tokens" className="text-xs">
            <Coins className="h-3.5 w-3.5 mr-1" />
            Tokens
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-auto">
          <TabsContent value="tools" className="h-full m-0 p-3">
            <ToolsTab debugTurns={debugTurns} />
          </TabsContent>

          <TabsContent value="state" className="h-full m-0 p-3">
            <StateTab state={state} onStateEdit={onStateEdit} />
          </TabsContent>

          <TabsContent value="intent" className="h-full m-0 p-3">
            <IntentTab debugTurns={debugTurns} />
          </TabsContent>

          <TabsContent value="tokens" className="h-full m-0 p-3">
            <TokensTab debugTurns={debugTurns} totalTokens={totalTokens} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
