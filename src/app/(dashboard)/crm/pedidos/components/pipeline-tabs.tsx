'use client'

import * as React from 'react'
import { XIcon, PlusIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { PipelineWithStages } from '@/lib/orders/types'

const LOCAL_STORAGE_KEY = 'morfx_open_pipelines'

interface PipelineTabsProps {
  pipelines: PipelineWithStages[]
  activePipelineId: string | null
  onPipelineChange: (pipelineId: string) => void
  onOpenPipelines: (pipelineIds: string[]) => void
}

/**
 * Bottom taskbar for managing open pipelines.
 * Persists open pipelines to localStorage.
 */
export function PipelineTabs({
  pipelines,
  activePipelineId,
  onPipelineChange,
  onOpenPipelines,
}: PipelineTabsProps) {
  // Track if we've done initial load
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [openPipelineIds, setOpenPipelineIds] = React.useState<string[]>([])

  // Load open pipelines from localStorage on mount
  React.useEffect(() => {
    if (hasLoaded) return

    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (stored) {
        const ids = JSON.parse(stored) as string[]
        // Filter to only valid pipeline IDs
        const validIds = ids.filter((id) =>
          pipelines.some((p) => p.id === id)
        )
        if (validIds.length > 0) {
          setOpenPipelineIds(validIds)
          onOpenPipelines(validIds)
          // If no active pipeline, set first open one
          if (!activePipelineId) {
            onPipelineChange(validIds[0])
          }
          setHasLoaded(true)
          return
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setHasLoaded(true)
  }, [pipelines, hasLoaded])

  // Persist to localStorage when open pipelines change
  React.useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(openPipelineIds))
    } catch {
      // Ignore localStorage errors
    }
  }, [openPipelineIds])

  // Open a pipeline (add to tabs)
  const openPipeline = (pipelineId: string) => {
    if (!openPipelineIds.includes(pipelineId)) {
      const newIds = [...openPipelineIds, pipelineId]
      setOpenPipelineIds(newIds)
      onOpenPipelines(newIds)
    }
    onPipelineChange(pipelineId)
  }

  // Close a pipeline tab
  const closePipeline = (pipelineId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newIds = openPipelineIds.filter((id) => id !== pipelineId)
    setOpenPipelineIds(newIds)
    onOpenPipelines(newIds)

    // If closing active tab, switch to another
    if (pipelineId === activePipelineId && newIds.length > 0) {
      onPipelineChange(newIds[0])
    }
  }

  // Get pipelines not currently open
  const closedPipelines = pipelines.filter(
    (p) => !openPipelineIds.includes(p.id)
  )

  // Get open pipeline objects in order
  const openPipelines = openPipelineIds
    .map((id) => pipelines.find((p) => p.id === id))
    .filter((p): p is PipelineWithStages => !!p)

  // Auto-open default pipeline if none are open (only after initial load)
  // This hook must be called unconditionally (React rules)
  const defaultPipeline = pipelines.find((p) => p.is_default) || pipelines[0]
  React.useEffect(() => {
    if (!hasLoaded) return // Wait for localStorage load first
    if (openPipelineIds.length === 0 && defaultPipeline) {
      // Inline the openPipeline logic to avoid dependency issues
      const newIds = [defaultPipeline.id]
      setOpenPipelineIds(newIds)
      onOpenPipelines(newIds)
      onPipelineChange(defaultPipeline.id)
    }
  }, [hasLoaded, openPipelineIds.length, defaultPipeline?.id, onOpenPipelines, onPipelineChange])

  return (
    <div className="absolute bottom-4 left-8 z-30">
      <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg px-2 py-1.5">
        {/* Pipeline tabs */}
        <div className="flex items-center gap-1">
          {openPipelines.map((pipeline) => (
            <div
              key={pipeline.id}
              role="button"
              tabIndex={0}
              onClick={() => onPipelineChange(pipeline.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPipelineChange(pipeline.id)
                }
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
                'hover:bg-muted/80 group',
                pipeline.id === activePipelineId
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground'
              )}
            >
              <span className="truncate max-w-[150px]">{pipeline.name}</span>
              {/* Close button */}
              <button
                onClick={(e) => closePipeline(pipeline.id, e)}
                className={cn(
                  'p-0.5 rounded hover:bg-muted-foreground/20',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  pipeline.id === activePipelineId && 'opacity-50'
                )}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Add pipeline dropdown */}
        {closedPipelines.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1"
              >
                <PlusIcon className="h-4 w-4" />
                <span className="text-xs">Pipeline</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {closedPipelines.map((pipeline) => (
                <DropdownMenuItem
                  key={pipeline.id}
                  onClick={() => openPipeline(pipeline.id)}
                >
                  {pipeline.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {pipeline.stages.length} etapas
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
