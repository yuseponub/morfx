'use client'

// ============================================================================
// Phase 19: AI Automation Builder — Automation Preview Component
// Read-only React Flow diagram with custom node types for automation preview.
//
// IMPORTANT: Import this component with next/dynamic({ ssr: false }).
// React Flow requires browser APIs and will crash during SSR.
//
// Usage in builder-message.tsx:
//   const AutomationPreview = dynamic(
//     () => import('./automation-preview').then(m => m.AutomationPreview),
//     { ssr: false }
//   )
// ============================================================================

import { ReactFlow, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { customNodeTypes } from './preview-nodes'
import { ConfirmationButtons } from './confirmation-buttons'
import { AlertTriangle, Ban, Copy } from 'lucide-react'
import type { AutomationPreviewData } from '@/lib/builder/types'

// ============================================================================
// Props
// ============================================================================

interface AutomationPreviewProps {
  data: AutomationPreviewData
  onConfirm: () => void
  onModify: () => void
  isUpdate?: boolean
}

// ============================================================================
// Warning Banners
// ============================================================================

function CycleWarning() {
  return (
    <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/50">
      <Ban className="size-4 shrink-0 text-red-500" />
      <p className="text-xs font-medium text-red-700 dark:text-red-400">
        Se detecto un ciclo en las automatizaciones. No se puede crear hasta
        resolver.
      </p>
    </div>
  )
}

function DuplicateWarning({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950/50">
      <Copy className="size-4 shrink-0 text-amber-500" />
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        {message}
      </p>
    </div>
  )
}

function ResourceWarnings({
  validations,
}: {
  validations: AutomationPreviewData['resourceValidations']
}) {
  const failed = validations.filter((v) => !v.found)
  if (failed.length === 0) return null

  return (
    <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950/50">
      <div className="mb-1 flex items-center gap-1.5">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Recursos no encontrados
        </p>
      </div>
      <ul className="space-y-0.5 pl-5">
        {failed.map((v, i) => (
          <li
            key={`${v.type}-${v.name}-${i}`}
            className="text-[11px] text-amber-600 dark:text-amber-400"
          >
            {v.type} &quot;{v.name}&quot;{' '}
            {v.details ? `— ${v.details}` : 'no encontrado'}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function AutomationPreview({
  data,
  onConfirm,
  onModify,
  isUpdate = false,
}: AutomationPreviewProps) {
  const { diagram, resourceValidations, hasCycles, duplicateWarning } = data

  // Dynamic height: min 200px, +80px per additional node beyond 2
  const nodeCount = diagram.nodes.length
  const diagramHeight = Math.max(200, 200 + (nodeCount - 2) * 80)

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <h3 className="text-sm font-semibold text-foreground">{data.name}</h3>
        {data.description && (
          <p className="text-xs text-muted-foreground">{data.description}</p>
        )}
      </div>

      {/* React Flow Diagram */}
      <div style={{ height: diagramHeight }}>
        <ReactFlow
          nodes={diagram.nodes}
          edges={diagram.edges}
          nodeTypes={customNodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>

      {/* Validation Warnings */}
      <ResourceWarnings validations={resourceValidations} />

      {/* Cycle Warning (blocks creation) */}
      {hasCycles && <CycleWarning />}

      {/* Duplicate Warning */}
      {duplicateWarning && <DuplicateWarning message={duplicateWarning} />}

      {/* Confirmation Buttons */}
      <ConfirmationButtons
        onConfirm={onConfirm}
        onModify={onModify}
        isUpdate={isUpdate}
        disabled={hasCycles}
      />
    </div>
  )
}
