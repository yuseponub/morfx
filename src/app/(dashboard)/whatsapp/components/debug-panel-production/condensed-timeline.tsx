'use client'

/**
 * Row renderer for a pre-condensed timeline produced by
 * `condenseTimeline` (D-04 whitelist, D-05 query exclusion).
 *
 * The component is intentionally dumb: it receives items already sorted
 * by sequence and with `summary` precomputed by the pure function. No
 * inline `JSON.stringify`, no filtering, no sorting.
 *
 * Introduced by standalone phase `agent-forensics-panel` Plan 02.
 */

import type { CondensedTimelineItem } from '@/lib/agent-forensics/condense-timeline'

interface Props {
  items: CondensedTimelineItem[]
}

export function CondensedTimeline({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Turno sin eventos relevantes al mecanismo (vista condensada).
        Abrir el tab &quot;Raw&quot; para ver el timeline completo.
      </div>
    )
  }

  return (
    <div className="divide-y">
      {items.map((item) => (
        <CondensedRow key={`${item.kind}-${item.sequence}`} item={item} />
      ))}
    </div>
  )
}

function CondensedRow({ item }: { item: CondensedTimelineItem }) {
  const anchor = item.kind === 'event' ? 'EVT' : 'AI'
  const anchorColor =
    item.kind === 'event'
      ? 'text-cyan-600 dark:text-cyan-400'
      : 'text-purple-600 dark:text-purple-400'

  return (
    <div className="px-3 py-2 hover:bg-muted/50">
      <div className="flex items-start gap-2 text-xs font-mono">
        <span className="text-muted-foreground w-10 shrink-0">
          {String(item.sequence).padStart(3, '0')}
        </span>
        <span className={`font-semibold w-8 shrink-0 ${anchorColor}`}>{anchor}</span>
        <div className="flex-1 min-w-0">
          {item.category && (
            <span className="text-foreground font-medium">{item.category}</span>
          )}
          {item.label && (
            <span className="ml-1 text-muted-foreground">· {item.label}</span>
          )}
          <div className="text-muted-foreground whitespace-pre-wrap break-words mt-0.5">
            {item.summary}
          </div>
        </div>
      </div>
    </div>
  )
}
