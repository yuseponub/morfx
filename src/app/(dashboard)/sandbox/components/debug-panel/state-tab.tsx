'use client'

/**
 * State Tab Component
 * Phase 15: Agent Sandbox
 *
 * EDITABLE JSON viewer of session state.
 * Per CONTEXT.md: "El JSON editable es para que Claude me ayude a predisponer estados especificos durante debugging"
 *
 * Uses @uiw/react-json-view/editor for inline editing.
 * The editor modifies the object in-place, so we need to clone before passing.
 */

import { useState, useEffect } from 'react'
import JsonViewEditor from '@uiw/react-json-view/editor'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
import { Info } from 'lucide-react'
import type { SandboxState } from '@/lib/sandbox/types'

interface StateTabProps {
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
}

export function StateTab({ state, onStateEdit }: StateTabProps) {
  const { theme, systemTheme } = useTheme()
  const resolvedTheme = theme === 'system' ? systemTheme : theme
  const jsonTheme = resolvedTheme === 'dark' ? darkTheme : lightTheme

  // Local editable copy of state
  const [editableState, setEditableState] = useState<SandboxState>(() =>
    JSON.parse(JSON.stringify(state))
  )

  // Sync with parent state when it changes externally
  useEffect(() => {
    setEditableState(JSON.parse(JSON.stringify(state)))
  }, [state])

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-xs">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-blue-700 dark:text-blue-300">
          Puedes editar valores directamente para predisponer estados especificos.
          Los cambios se aplican inmediatamente.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <JsonViewEditor
          value={editableState}
          style={{
            ...jsonTheme,
            padding: '12px',
            background: resolvedTheme === 'dark' ? 'hsl(var(--muted))' : 'hsl(var(--background))',
          }}
          displayDataTypes={false}
          displayObjectSize={true}
          collapsed={2}
          enableClipboard={true}
          editable={true}
          onEdit={({ value, oldValue }) => {
            // Allow the edit if value changed
            if (value === oldValue) return false

            // After the edit is applied by the editor, notify parent
            // Use setTimeout to ensure the editor has updated the object
            setTimeout(() => {
              onStateEdit(JSON.parse(JSON.stringify(editableState)))
            }, 0)

            return true
          }}
        />
      </div>
    </div>
  )
}
