'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createAutomation, updateAutomation } from '@/app/actions/automations'
import type { AutomationFormData, TriggerType } from '@/lib/automations/types'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'
import { TriggerStep } from './trigger-step'
import { ConditionsStep } from './conditions-step'
import { ActionsStep } from './actions-step'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

// ============================================================================
// Types
// ============================================================================

export interface WizardProps {
  initialData?: AutomationFormData & { id?: string }
  pipelines: PipelineWithStages[]
  tags: Tag[]
}

const defaultFormData: AutomationFormData = {
  name: '',
  description: '',
  trigger_type: '' as TriggerType,
  trigger_config: {},
  conditions: null,
  actions: [],
}

const STEPS = [
  { number: 1, label: 'Trigger' },
  { number: 2, label: 'Condiciones' },
  { number: 3, label: 'Acciones' },
] as const

// ============================================================================
// Component
// ============================================================================

export function AutomationWizard({ initialData, pipelines, tags }: WizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<AutomationFormData>(
    initialData ?? defaultFormData
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!initialData?.id

  // --------------------------------------------------------------------------
  // Step navigation
  // --------------------------------------------------------------------------

  function canAdvance(): boolean {
    if (step === 1) {
      return !!formData.name.trim() && !!formData.trigger_type
    }
    if (step === 2) {
      return true // conditions are optional
    }
    if (step === 3) {
      return formData.actions.length > 0
    }
    return false
  }

  function handleNext() {
    if (canAdvance() && step < 3) {
      setStep(step + 1)
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  // --------------------------------------------------------------------------
  // Form data updates
  // --------------------------------------------------------------------------

  function updateFormData(partial: Partial<AutomationFormData>) {
    setFormData((prev) => ({ ...prev, ...partial }))
  }

  // --------------------------------------------------------------------------
  // Submit
  // --------------------------------------------------------------------------

  async function handleSubmit() {
    if (!canAdvance()) return
    setIsSubmitting(true)

    try {
      const result = isEditing
        ? await updateAutomation(initialData!.id!, formData)
        : await createAutomation(formData)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success(
        isEditing
          ? 'Automatizacion actualizada'
          : 'Automatizacion creada'
      )
      router.push('/automatizaciones')
      router.refresh()
    } catch {
      toast.error('Error inesperado al guardar')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header: Name, Description, Step indicator */}
      <div className="space-y-4">
        <Input
          placeholder="Nombre de la automatizacion"
          value={formData.name}
          onChange={(e) => updateFormData({ name: e.target.value })}
          className="text-lg font-semibold h-12"
          maxLength={100}
        />
        <Textarea
          placeholder="Descripcion (opcional)"
          value={formData.description ?? ''}
          onChange={(e) => updateFormData({ description: e.target.value })}
          className="resize-none"
          rows={2}
          maxLength={500}
        />
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.number} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Allow clicking on completed steps or current step
                if (s.number <= step) setStep(s.number)
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                s.number === step
                  ? 'bg-primary text-primary-foreground'
                  : s.number < step
                    ? 'bg-primary/20 text-primary cursor-pointer'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {s.number < step ? (
                <Check className="size-4" />
              ) : (
                <span className="size-5 flex items-center justify-center text-xs rounded-full bg-background/20">
                  {s.number}
                </span>
              )}
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'w-8 h-0.5',
                i + 1 < step ? 'bg-primary' : 'bg-muted'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {step === 1 && (
          <TriggerStep
            formData={formData}
            onChange={updateFormData}
            pipelines={pipelines}
            tags={tags}
          />
        )}
        {step === 2 && (
          <ConditionsStep
            formData={formData}
            onChange={updateFormData}
            triggerType={formData.trigger_type}
          />
        )}
        {step === 3 && (
          <ActionsStep
            formData={formData}
            onChange={updateFormData}
            pipelines={pipelines}
            tags={tags}
            triggerType={formData.trigger_type}
          />
        )}
      </div>

      {/* Footer: Back / Next / Guardar */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1}
        >
          Atras
        </Button>

        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              Siguiente
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canAdvance() || isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
