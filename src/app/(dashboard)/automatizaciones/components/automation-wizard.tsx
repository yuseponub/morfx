'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createAutomation, updateAutomation } from '@/app/actions/automations'
import type { AutomationFormData, TriggerType } from '@/lib/automations/types'
import type { PipelineWithStages, Product } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'
import type { Template } from '@/lib/whatsapp/types'
import { TriggerStep } from './trigger-step'
import { ConditionsStep } from './conditions-step'
import { ActionsStep } from './actions-step'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

// ============================================================================
// Types
// ============================================================================

export interface WizardProps {
  initialData?: AutomationFormData & { id?: string }
  pipelines: PipelineWithStages[]
  tags: Tag[]
  templates?: Template[]
  products?: Product[]
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

export function AutomationWizard({ initialData, pipelines, tags, templates = [], products = [] }: WizardProps) {
  const router = useRouter()
  const v2 = useDashboardV2()
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
      {/* Header: Name, Description */}
      <div className="space-y-4">
        <Input
          placeholder={v2 ? 'Nombre de la automatización' : 'Nombre de la automatizacion'}
          value={formData.name}
          onChange={(e) => updateFormData({ name: e.target.value })}
          className={cn(
            v2
              ? 'h-12 text-[18px] font-semibold tracking-[-0.01em] text-[var(--ink-1)] bg-[var(--paper-0)] border-[var(--ink-1)] rounded-[var(--radius-2)] focus-visible:ring-[var(--ink-1)]'
              : 'text-lg font-semibold h-12'
          )}
          style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
          maxLength={100}
        />
        <Textarea
          placeholder={v2 ? 'Descripción (opcional)' : 'Descripcion (opcional)'}
          value={formData.description ?? ''}
          onChange={(e) => updateFormData({ description: e.target.value })}
          className={cn(
            v2
              ? 'resize-none bg-[var(--paper-0)] border-[var(--ink-1)] rounded-[var(--radius-2)] text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:ring-[var(--ink-1)]'
              : 'resize-none'
          )}
          style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
          rows={2}
          maxLength={500}
        />
      </div>

      {/* Step indicator */}
      {v2 ? (
        <div className="flex items-stretch border-b border-[var(--ink-1)]">
          {STEPS.map((s) => {
            const isActive = s.number === step
            const isComplete = s.number < step
            return (
              <button
                key={s.number}
                type="button"
                onClick={() => {
                  if (s.number <= step) setStep(s.number)
                }}
                disabled={s.number > step}
                className={cn(
                  'flex-1 px-4 py-3 flex items-center gap-3 transition-colors border-b-2 -mb-px',
                  isActive
                    ? 'border-[var(--ink-1)] text-[var(--ink-1)]'
                    : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] tabular-nums',
                    isActive
                      ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                      : isComplete
                        ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                        : 'bg-transparent border-[var(--border)] text-[var(--ink-3)]'
                  )}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : s.number.toString().padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-[0.14em]',
                    isActive && 'text-[var(--rubric-2)]'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  Paso {s.number} · {s.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
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
      )}

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
            pipelines={pipelines}
          />
        )}
        {step === 3 && (
          <ActionsStep
            formData={formData}
            onChange={updateFormData}
            pipelines={pipelines}
            tags={tags}
            templates={templates}
            triggerType={formData.trigger_type}
            products={products}
          />
        )}
      </div>

      {/* Footer: Back / Next / Guardar */}
      <div
        className={cn(
          'flex items-center justify-between pt-4',
          v2 ? 'border-t border-[var(--ink-1)]' : 'border-t'
        )}
      >
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1}
          className={cn(
            v2 &&
              'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {v2 ? 'Atrás' : 'Atras'}
        </Button>

        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance()}
              className={cn(
                v2 &&
                  'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] text-[11px] font-semibold uppercase tracking-[0.08em]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              Siguiente
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canAdvance() || isSubmitting}
              className={cn(
                v2 &&
                  'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] text-[11px] font-semibold uppercase tracking-[0.08em]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              {isSubmitting ? (v2 ? 'Guardando…' : 'Guardando...') : 'Guardar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
