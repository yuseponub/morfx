'use client'

/**
 * Debug Panel Tab Bar
 * Phase 15.6: Sandbox Evolution
 *
 * Draggable, sortable tab bar using @dnd-kit/sortable.
 * Tabs can be toggled visible/hidden (max 3 simultaneously).
 */

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Wrench, FileJson, Brain, Coins, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DebugPanelTab, DebugPanelTabId } from '@/lib/sandbox/types'

const TAB_ICONS: Record<DebugPanelTabId, React.ComponentType<{ className?: string }>> = {
  tools: Wrench,
  state: FileJson,
  intent: Brain,
  tokens: Coins,
  ingest: Database,
}

interface SortableTabItemProps {
  tab: DebugPanelTab
  onToggle: () => void
  canActivate: boolean
}

function SortableTabItem({ tab, onToggle, canActivate }: SortableTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const Icon = TAB_ICONS[tab.id]

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        onClick={onToggle}
        disabled={!tab.visible && !canActivate}
        className={cn(
          'px-3 py-1.5 text-xs flex items-center gap-1.5 rounded-t border-t border-x transition-colors cursor-grab active:cursor-grabbing',
          tab.visible
            ? 'bg-background border-border text-foreground font-medium'
            : canActivate
              ? 'bg-muted/40 border-transparent text-muted-foreground hover:bg-muted/60'
              : 'bg-muted/20 border-transparent text-muted-foreground/50 cursor-not-allowed',
          isDragging && 'opacity-50 z-50'
        )}
        title={!tab.visible && !canActivate ? 'Maximo 3 paneles visibles' : undefined}
      >
        <Icon className="h-3.5 w-3.5" />
        {tab.label}
      </button>
    </div>
  )
}

interface TabBarProps {
  tabs: DebugPanelTab[]
  onReorder: (tabs: DebugPanelTab[]) => void
  onToggleTab: (tabId: DebugPanelTabId) => void
  maxVisible?: number
}

export function TabBar({ tabs, onReorder, onToggleTab, maxVisible = 3 }: TabBarProps) {
  const visibleCount = tabs.filter(t => t.visible).length
  const canActivateMore = visibleCount < maxVisible

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active.id !== over?.id) {
      const oldIndex = tabs.findIndex(t => t.id === active.id)
      const newIndex = tabs.findIndex(t => t.id === over?.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(tabs, oldIndex, newIndex))
      }
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-1 px-3 pt-2 border-b bg-muted/20">
          {tabs.map(tab => (
            <SortableTabItem
              key={tab.id}
              tab={tab}
              onToggle={() => onToggleTab(tab.id)}
              canActivate={canActivateMore}
            />
          ))}
          <div className="flex-1" />
          <span className="self-end pb-1.5 text-[10px] text-muted-foreground/60">
            {visibleCount}/{maxVisible}
          </span>
        </div>
      </SortableContext>
    </DndContext>
  )
}
