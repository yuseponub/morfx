'use client'

/**
 * Sandbox Split Panel
 * Wrapper for Allotment with dynamic import to avoid SSR issues
 */

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import type { ReactNode } from 'react'

interface SandboxSplitPanelProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
}

export function SandboxSplitPanel({ leftPanel, rightPanel }: SandboxSplitPanelProps) {
  return (
    <Allotment defaultSizes={[60, 40]} minSize={300}>
      <Allotment.Pane>
        {leftPanel}
      </Allotment.Pane>
      <Allotment.Pane snap>
        {rightPanel}
      </Allotment.Pane>
    </Allotment>
  )
}
