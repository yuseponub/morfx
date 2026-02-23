'use client'

/**
 * Command Input
 * Phase 24 + Phase 27: Chat de Comandos UI
 *
 * Input bar with text entry, quick-action chips, and file upload (drag-and-drop + file picker).
 * Includes inline confirmation for destructive commands.
 */

import { useState, useCallback, useRef, type KeyboardEvent } from 'react'
import { Send, Upload, Activity, HelpCircle, Image as ImageIcon, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CommandInputProps {
  onCommand: (input: string) => void
  onFilesSelected: (files: Array<{ fileName: string; mimeType: string; base64Data: string }>) => void
  isDisabled: boolean
  /** Number of files currently staged for upload */
  stagedFileCount: number
}

export function CommandInput({ onCommand, onFilesSelected, isDisabled, stagedFileCount }: CommandInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isDisabled) return
    onCommand(trimmed)
    setInputValue('')
  }, [inputValue, isDisabled, onCommand])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleSubirOrdenes = useCallback(() => {
    if (showConfirmation) {
      // Already showing confirmation, execute
      onCommand('subir ordenes coord')
      setShowConfirmation(false)
    } else {
      // Show confirmation
      setShowConfirmation(true)
    }
  }, [showConfirmation, onCommand])

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false)
  }, [])

  // ---- File handling (file picker only, drag-and-drop handled by CommandPanel) ----
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

  return (
    <div className="border-t bg-card p-3 space-y-3">
      {/* Quick-action chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {!showConfirmation ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubirOrdenes}
              disabled={isDisabled}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Subir ordenes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
              className="gap-1.5"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Leer guias
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCommand('estado')}
              disabled={isDisabled}
              className="gap-1.5"
            >
              <Activity className="h-3.5 w-3.5" />
              Estado
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCommand('ayuda')}
              disabled={isDisabled}
              className="gap-1.5"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Ayuda
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Subir todas las ordenes pendientes a Coordinadora?
            </span>
            <Button
              variant="default"
              size="sm"
              onClick={handleSubirOrdenes}
              disabled={isDisabled}
            >
              Confirmar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelConfirmation}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Staged files indicator */}
      {stagedFileCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Paperclip className="h-3.5 w-3.5" />
          {stagedFileCount} archivo{stagedFileCount > 1 ? 's' : ''} adjunto{stagedFileCount > 1 ? 's' : ''}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Text input */}
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDisabled ? 'Job en progreso...' : stagedFileCount > 0 ? 'Escribe "leer guias" para procesar...' : 'Escribe un comando...'}
          disabled={isDisabled}
          className="flex-1"
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleSubmit}
          disabled={isDisabled || !inputValue.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
