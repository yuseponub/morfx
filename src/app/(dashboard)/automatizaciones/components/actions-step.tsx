'use client'

import type { AutomationFormData, TriggerType } from '@/lib/automations/types'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'

interface ActionsStepProps {
  formData: AutomationFormData
  onChange: (partial: Partial<AutomationFormData>) => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
  triggerType: TriggerType
}

export function ActionsStep({ formData, onChange, pipelines, tags, triggerType }: ActionsStepProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      Actions step placeholder - will be implemented in Task 2
    </div>
  )
}
