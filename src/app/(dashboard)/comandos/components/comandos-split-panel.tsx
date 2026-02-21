'use client'

/**
 * Comandos Split Panel
 * Wrapper for Allotment with dynamic import to avoid SSR issues.
 */

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import type { ReactNode } from 'react'

interface ComandosSplitPanelProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
}

export function ComandosSplitPanel({ leftPanel, rightPanel }: ComandosSplitPanelProps) {
  return (
    <Allotment defaultSizes={[55, 45]} minSize={300}>
      <Allotment.Pane>
        {leftPanel}
      </Allotment.Pane>
      <Allotment.Pane snap>
        {rightPanel}
      </Allotment.Pane>
    </Allotment>
  )
}
