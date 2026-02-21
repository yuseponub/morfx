'use client'

/**
 * Command Input
 * Phase 24: Chat de Comandos UI
 *
 * Input bar with text entry and quick-action chips.
 * Includes inline confirmation for destructive commands.
 */

import { useState, useCallback, type KeyboardEvent } from 'react'
import { Send, Upload, Activity, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CommandInputProps {
  onCommand: (input: string) => void
  isDisabled: boolean
}

export function CommandInput({ onCommand, isDisabled }: CommandInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)

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

      {/* Text input */}
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDisabled ? 'Job en progreso...' : 'Escribe un comando...'}
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
