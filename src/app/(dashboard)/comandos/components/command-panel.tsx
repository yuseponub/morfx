'use client'

/**
 * Command Panel
 * Phase 24: Chat de Comandos UI
 *
 * Left panel container: command output + progress indicator + input bar.
 */

import { CommandOutput } from './command-output'
import { CommandInput } from './command-input'
import { ProgressIndicator } from './progress-indicator'
import type { CommandMessage } from './comandos-layout'

interface CommandPanelProps {
  messages: CommandMessage[]
  onCommand: (input: string) => void
  isExecuting: boolean
  activeJobId: string | null
  successCount: number
  errorCount: number
  totalItems: number
}

export function CommandPanel({
  messages,
  onCommand,
  isExecuting,
  activeJobId,
  successCount,
  errorCount,
  totalItems,
}: CommandPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <CommandOutput messages={messages} />
      {activeJobId && (
        <ProgressIndicator
          successCount={successCount}
          errorCount={errorCount}
          totalItems={totalItems}
        />
      )}
      <CommandInput onCommand={onCommand} isDisabled={isExecuting} />
    </div>
  )
}
