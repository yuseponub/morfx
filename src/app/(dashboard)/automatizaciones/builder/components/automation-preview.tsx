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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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

function CycleWarning({ severity }: { severity: 'warning' | 'blocker' }) {
  const v2 = useDashboardV2()
  if (severity === 'blocker') {
    if (v2) {
      return (
        <div className="flex items-center gap-2 border-t border-[var(--rubric-2)] bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] px-4 py-2">
          <Ban className="size-4 shrink-0 text-[var(--rubric-2)]" />
          <p
            className="text-[11px] font-medium text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Ciclo inevitable detectado. No se puede crear hasta resolver.
          </p>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/50">
        <Ban className="size-4 shrink-0 text-red-500" />
        <p className="text-xs font-medium text-red-700 dark:text-red-400">
          Ciclo inevitable detectado. No se puede crear hasta resolver.
        </p>
      </div>
    )
  }

  if (v2) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--accent-gold)] bg-[color-mix(in_oklch,var(--accent-gold)_8%,var(--paper-0))] px-4 py-2">
        <AlertTriangle className="size-4 shrink-0 text-[var(--accent-gold)]" />
        <p
          className="text-[11px] font-medium text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Posible ciclo detectado. Revisa las condiciones — si filtran por recursos
          específicos, puede que no sea un problema real.
        </p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950/50">
      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Posible ciclo detectado. Revisa las condiciones — si filtran por recursos
        especificos, puede que no sea un problema real.
      </p>
    </div>
  )
}

function DuplicateWarning({ message }: { message: string }) {
  const v2 = useDashboardV2()
  if (v2) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--accent-gold)] bg-[color-mix(in_oklch,var(--accent-gold)_8%,var(--paper-0))] px-4 py-2">
        <Copy className="size-4 shrink-0 text-[var(--accent-gold)]" />
        <p
          className="text-[11px] font-medium text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {message}
        </p>
      </div>
    )
  }
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
  const v2 = useDashboardV2()
  const failed = validations.filter((v) => !v.found)
  if (failed.length === 0) return null

  if (v2) {
    return (
      <div className="border-t border-[var(--accent-gold)] bg-[color-mix(in_oklch,var(--accent-gold)_8%,var(--paper-0))] px-4 py-2">
        <div className="mb-1 flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--accent-gold)]" />
          <p
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Recursos no encontrados
          </p>
        </div>
        <ul className="space-y-0.5 pl-5">
          {failed.map((v, i) => (
            <li
              key={`${v.type}-${v.name}-${i}`}
              className="text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {v.type} &quot;{v.name}&quot;{' '}
              {v.details ? `— ${v.details}` : 'no encontrado'}
            </li>
          ))}
        </ul>
      </div>
    )
  }

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
  const v2 = useDashboardV2()
  const { diagram, resourceValidations, hasCycles, cycleSeverity, duplicateWarning } = data

  // Dynamic height: min 200px, +80px per additional node beyond 2
  const nodeCount = diagram.nodes.length
  const diagramHeight = Math.max(200, 200 + (nodeCount - 2) * 80)

  return (
    <div
      className={cn(
        'w-full overflow-hidden',
        v2
          ? 'border border-[var(--ink-1)] bg-[var(--paper-1)] shadow-[0_1px_0_var(--ink-1)]'
          : 'rounded-lg border bg-background'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'px-4 py-2',
          v2 ? 'border-b border-[var(--ink-1)] bg-[var(--paper-2)]' : 'border-b bg-muted/30'
        )}
      >
        {v2 ? (
          <>
            <span
              className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Preview · automatización
            </span>
            <h3
              className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {data.name}
            </h3>
            {data.description && (
              <p
                className="mt-0.5 text-[12px] italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {data.description}
              </p>
            )}
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-foreground">{data.name}</h3>
            {data.description && (
              <p className="text-xs text-muted-foreground">{data.description}</p>
            )}
          </>
        )}
      </div>

      {/* React Flow Diagram */}
      <div
        style={{ height: diagramHeight }}
        className={cn(v2 && 'bg-[var(--paper-1)]')}
      >
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
          defaultEdgeOptions={
            v2
              ? {
                  style: { stroke: 'var(--ink-2)', strokeWidth: 2 },
                  type: 'smoothstep',
                }
              : undefined
          }
        >
          {v2 ? (
            <Background variant={'dots' as never} gap={16} size={0.5} color="var(--ink-4)" />
          ) : (
            <Background gap={16} size={1} />
          )}
        </ReactFlow>
      </div>

      {/* Validation Warnings */}
      <ResourceWarnings validations={resourceValidations} />

      {/* Cycle Warning */}
      {hasCycles && <CycleWarning severity={cycleSeverity === 'blocker' ? 'blocker' : 'warning'} />}

      {/* Duplicate Warning */}
      {duplicateWarning && <DuplicateWarning message={duplicateWarning} />}

      {/* Confirmation Buttons */}
      <ConfirmationButtons
        onConfirm={onConfirm}
        onModify={onModify}
        isUpdate={isUpdate}
        disabled={cycleSeverity === 'blocker'}
      />
    </div>
  )
}
