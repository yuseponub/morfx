'use client'

/**
 * Command Panel
 * Phase 24 + Phase 27: Chat de Comandos UI
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
  onFilesSelected: (files: Array<{ fileName: string; mimeType: string; base64Data: string }>) => void
  stagedFileCount: number
  isExecuting: boolean
  activeJobId: string | null
  successCount: number
  errorCount: number
  totalItems: number
}

export function CommandPanel({
  messages,
  onCommand,
  onFilesSelected,
  stagedFileCount,
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
      <CommandInput
        onCommand={onCommand}
        onFilesSelected={onFilesSelected}
        stagedFileCount={stagedFileCount}
        isDisabled={isExecuting}
      />
    </div>
  )
}
