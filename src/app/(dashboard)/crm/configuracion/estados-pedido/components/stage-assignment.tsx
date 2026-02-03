'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { PipelineWithStages } from '@/lib/orders/types'

interface StageAssignmentProps {
  pipelines: PipelineWithStages[]
  currentStateId?: string
  assignedStageIds: string[]
  onAssignmentChange: (stageIds: string[]) => void
}

export function StageAssignment({
  pipelines,
  currentStateId,
  assignedStageIds,
  onAssignmentChange,
}: StageAssignmentProps) {
  const toggleStage = (stageId: string) => {
    if (assignedStageIds.includes(stageId)) {
      // Remove from array
      onAssignmentChange(assignedStageIds.filter((id) => id !== stageId))
    } else {
      // Add to array
      onAssignmentChange([...assignedStageIds, stageId])
    }
  }

  // Check if there are any stages across all pipelines
  const hasStages = pipelines.some((pipeline) => pipeline.stages.length > 0)

  if (!hasStages) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No hay etapas configuradas en los pipelines
      </p>
    )
  }

  return (
    <div className="space-y-4 max-h-[200px] overflow-y-auto border rounded-md p-3">
      {pipelines.map((pipeline) => {
        if (pipeline.stages.length === 0) return null

        return (
          <div key={pipeline.id}>
            <h4 className="text-sm font-medium mb-2">{pipeline.name}</h4>
            <div className="space-y-1 ml-2">
              {pipeline.stages.map((stage) => {
                const isAssignedToOther =
                  stage.order_state_id != null && stage.order_state_id !== currentStateId
                const isChecked = assignedStageIds.includes(stage.id)

                return (
                  <label
                    key={stage.id}
                    className={cn(
                      'flex items-center gap-2 py-1 cursor-pointer',
                      isAssignedToOther && 'cursor-not-allowed'
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleStage(stage.id)}
                      disabled={isAssignedToOther}
                    />
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className={cn(isAssignedToOther && 'text-muted-foreground')}>
                      {stage.name}
                    </span>
                    {isAssignedToOther && (
                      <span className="text-xs text-muted-foreground">(asignado a otro estado)</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
