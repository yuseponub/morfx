'use client'

/**
 * Command Input
 * Phase 24 + Phase 27 + Phase 28: Chat de Comandos UI
 *
 * Input bar with text entry, quick-action chips, and file upload (drag-and-drop + file picker).
 * Includes inline confirmation for destructive commands.
 * Chips for guide PDF/Excel generation (Inter, Bogota, Envia).
 */

import { useState, useCallback, useRef, type KeyboardEvent } from 'react'
import { Send, Upload, Activity, HelpCircle, Image as ImageIcon, Paperclip, FileText, FileSpreadsheet, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Confirmation descriptions for each command
const COMMAND_CONFIRMATIONS: Record<string, string> = {
  'subir ordenes coord': 'Vas a subir todas las ordenes pendientes a la plataforma de COORDINADORA.',
  'buscar guias coord': 'Vas a buscar las guias asignadas por COORDINADORA para las ordenes pendientes.',
  'leer guias': 'Vas a leer las guias de envio adjuntas usando reconocimiento OCR.',
  'generar guias inter': 'Vas a generar el PDF de guias para todas las ordenes de INTERRAPIDISIMO.',
  'generar guias bogota': 'Vas a generar el PDF de guias para todas las ordenes de BOGOTA.',
  'generar excel envia': 'Vas a generar el archivo Excel de carga masiva para ENVIA.',
}

interface CommandInputProps {
  onCommand: (input: string) => void
  onFilesSelected: (files: Array<{ fileName: string; mimeType: string; base64Data: string }>) => void
  isDisabled: boolean
  /** Number of files currently staged for upload */
  stagedFileCount: number
}

export function CommandInput({ onCommand, onFilesSelected, isDisabled, stagedFileCount }: CommandInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
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

  const handleCommandWithConfirmation = useCallback((command: string) => {
    setPendingCommand(command)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!pendingCommand) return
    // Special case: "leer guias" button opens file picker, not direct command
    if (pendingCommand === 'leer guias') {
      fileInputRef.current?.click()
    } else {
      onCommand(pendingCommand)
    }
    setPendingCommand(null)
  }, [pendingCommand, onCommand])

  const handleCancelConfirmation = useCallback(() => {
    setPendingCommand(null)
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
      {/* Quick-action chips / Confirmation */}
      {pendingCommand ? (
        <div className="rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/40 p-4 space-y-3">
          <p className="text-base font-semibold text-foreground">
            {COMMAND_CONFIRMATIONS[pendingCommand]}
          </p>
          <p className="text-sm text-muted-foreground">
            Deseas confirmar?
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirm}
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
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('subir ordenes coord')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Subir ordenes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('buscar guias coord')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            Buscar Guias Coord
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('leer guias')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Leer Guias OCR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('generar guias inter')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Guias Inter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('generar guias bogota')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Guias Bogota
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCommandWithConfirmation('generar excel envia')}
            disabled={isDisabled}
            className="gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel Envia
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
        </div>
      )}

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
          placeholder={isDisabled ? 'Job en progreso...' : stagedFileCount > 0 ? 'Escribe "leer guias" o usa el boton "Leer Guias OCR"...' : 'Escribe un comando...'}
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
