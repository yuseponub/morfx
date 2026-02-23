'use client'

/**
 * Command Panel
 * Phase 24 + Phase 27: Chat de Comandos UI
 *
 * Left panel container: command output + progress indicator + input bar.
 * The entire panel is a drop zone for guide images (drag-and-drop).
 */

import { useState, useCallback } from 'react'
import { CommandOutput } from './command-output'
import { CommandInput } from './command-input'
import { ProgressIndicator } from './progress-indicator'
import { cn } from '@/lib/utils'
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
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFiles = useCallback(async (fileList: FileList) => {
    const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    const converted: Array<{ fileName: string; mimeType: string; base64Data: string }> = []

    for (const file of Array.from(fileList)) {
      if (!ALLOWED.has(file.type)) continue
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64Data = btoa(binary)
      converted.push({ fileName: file.name, mimeType: file.type, base64Data })
    }

    if (converted.length > 0) {
      onFilesSelected(converted)
    }
  }, [onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set false if leaving the panel itself (not entering a child)
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  return (
    <div
      className={cn(
        "flex flex-col h-full relative",
        isDragOver && "ring-2 ring-primary ring-inset"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 pointer-events-none">
          <div className="text-primary font-medium text-sm bg-background/90 px-4 py-2 rounded-lg shadow-sm border">
            Soltar archivos para adjuntar
          </div>
        </div>
      )}
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
