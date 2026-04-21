'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.1
// React Context + useReducer que comparte el TemplateDraft entre chat y preview
// (D-01, D-13 Open Q2). La IA despacha APPLY_AI_PATCH desde las salidas de las
// tools; el usuario despacha UPDATE_FIELD desde los inputs del preview.
//
// Merge semantics:
//   - UPDATE_FIELD: reemplaza un campo puntual.
//   - APPLY_AI_PATCH: shallow-merge con el draft actual. El caller es
//     responsable de pasar el shape correcto cuando el campo es un objeto
//     (ej: `variableMapping` — el caller debe hacer el merge previamente para
//     no perder mappings anteriores). Ver chat-message.tsx / ToolOutput.
//   - RESET: vuelve al initialDraft (usado al crear nueva sesion).
// ============================================================================

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type { TemplateDraft } from '@/lib/config-builder/templates/types'

type Action =
  | { type: 'UPDATE_FIELD'; field: keyof TemplateDraft; value: unknown }
  | { type: 'APPLY_AI_PATCH'; patch: Partial<TemplateDraft> }
  | { type: 'RESET' }

export const initialDraft: TemplateDraft = {
  name: '',
  language: 'es',
  category: 'UTILITY',
  headerFormat: 'NONE',
  headerText: '',
  headerImageStoragePath: null,
  headerImageLocalUrl: null,
  bodyText: '',
  footerText: '',
  variableMapping: {},
  bodyExamples: {},
  headerExamples: {},
}

function draftReducer(state: TemplateDraft, action: Action): TemplateDraft {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value } as TemplateDraft
    case 'APPLY_AI_PATCH':
      return { ...state, ...action.patch }
    case 'RESET':
      return initialDraft
    default:
      return state
  }
}

interface TemplateDraftContextValue {
  draft: TemplateDraft
  dispatch: Dispatch<Action>
}

const TemplateDraftContext = createContext<TemplateDraftContextValue | null>(null)

export function TemplateDraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft)
  return (
    <TemplateDraftContext.Provider value={{ draft, dispatch }}>
      {children}
    </TemplateDraftContext.Provider>
  )
}

export function useTemplateDraft(): TemplateDraftContextValue {
  const ctx = useContext(TemplateDraftContext)
  if (!ctx) {
    throw new Error('useTemplateDraft must be used within <TemplateDraftProvider>')
  }
  return ctx
}
