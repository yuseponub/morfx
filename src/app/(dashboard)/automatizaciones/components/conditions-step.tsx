'use client'

import type { AutomationFormData, TriggerType } from '@/lib/automations/types'

interface ConditionsStepProps {
  formData: AutomationFormData
  onChange: (partial: Partial<AutomationFormData>) => void
  triggerType: TriggerType
}

export function ConditionsStep({ formData, onChange, triggerType }: ConditionsStepProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      Conditions step placeholder - will be implemented in Task 2
    </div>
  )
}
