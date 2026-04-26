'use client'

// ============================================================================
// SimulateButton — wrapper minimo del Server Action `simulateAction`.
// Plan 06 functional first: el editor-client puede usar este boton standalone
// O invocar `simulateAction` directamente en su propio flow. Hoy el
// editor-client.tsx invoca simulateAction inline (mas control sobre el state
// del panel lateral), pero exportamos esta version standalone por si Plan 07
// u otro contexto necesita un boton "Simular" sin todo el editor.
// ============================================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { simulateAction } from '../../_actions'
import type { RoutingRule } from '@/lib/domain/routing'
import type { DryRunResult } from '@/lib/agents/routing/dry-run'

interface Props {
  candidateRules: RoutingRule[]
  daysBack?: number
  onResult: (result: DryRunResult | { error: string }) => void
  disabled?: boolean
}

export function SimulateButton({
  candidateRules,
  daysBack = 7,
  onResult,
  disabled,
}: Props) {
  const [isLoading, setIsLoading] = useState(false)

  async function run() {
    setIsLoading(true)
    try {
      const result = await simulateAction({ candidateRules, daysBack })
      onResult(result)
    } catch (e) {
      onResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={run}
      disabled={disabled || isLoading}
    >
      {isLoading ? 'Simulando...' : 'Simular cambio'}
    </Button>
  )
}
