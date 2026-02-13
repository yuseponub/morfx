'use client'

import { TRIGGER_CATALOG } from '@/lib/automations/constants'
import type { AutomationFormData, TriggerType, TriggerConfig } from '@/lib/automations/types'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, MessageSquare, ListTodo, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

interface TriggerStepProps {
  formData: AutomationFormData
  onChange: (partial: Partial<AutomationFormData>) => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
}

// ============================================================================
// Helpers
// ============================================================================

const CATEGORY_CONFIG = {
  CRM: { icon: Building2, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50' },
  WhatsApp: { icon: MessageSquare, color: 'text-green-600 bg-green-50 dark:bg-green-950/50' },
  Tareas: { icon: ListTodo, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50' },
} as const

type TriggerCategory = keyof typeof CATEGORY_CONFIG

const CATEGORIES: TriggerCategory[] = ['CRM', 'WhatsApp', 'Tareas']

function getTriggersForCategory(category: TriggerCategory) {
  return TRIGGER_CATALOG.filter((t) => t.category === category)
}

// ============================================================================
// Keywords Input Sub-component
// ============================================================================

function KeywordsInput({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (keywords: string[]) => void
}) {
  const [input, setInput] = useState('')

  function addKeyword() {
    const trimmed = input.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed])
      setInput('')
    }
  }

  function removeKeyword(kw: string) {
    onChange(keywords.filter((k) => k !== kw))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Escribir palabra clave..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addKeyword()
            }
          }}
        />
        <button
          type="button"
          onClick={addKeyword}
          className="px-3 py-1 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Agregar
        </button>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <Badge
              key={kw}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive/20"
              onClick={() => removeKeyword(kw)}
            >
              {kw} x
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Config Fields Renderer
// ============================================================================

function TriggerConfigFields({
  trigger,
  config,
  onConfigChange,
  pipelines,
  tags,
}: {
  trigger: (typeof TRIGGER_CATALOG)[number]
  config: TriggerConfig
  onConfigChange: (config: TriggerConfig) => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
}) {
  if (trigger.configFields.length === 0) return null

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-sm font-medium text-muted-foreground">Configuracion del trigger</p>
      {trigger.configFields.map((field) => {
        // Pipeline select
        if (field.name === 'pipelineId') {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">{field.label} {!field.required && <span className="text-muted-foreground">(opcional)</span>}</Label>
              <Select
                value={(config.pipelineId as string) ?? ''}
                onValueChange={(val) =>
                  onConfigChange({ ...config, pipelineId: val || undefined, stageId: undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cualquier pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        }

        // Stage select (depends on selected pipeline)
        if (field.name === 'stageId') {
          const selectedPipeline = pipelines.find((p) => p.id === config.pipelineId)
          const stages = selectedPipeline?.stages ?? []
          return (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">{field.label} {!field.required && <span className="text-muted-foreground">(opcional)</span>}</Label>
              <Select
                value={(config.stageId as string) ?? ''}
                onValueChange={(val) =>
                  onConfigChange({ ...config, stageId: val || undefined })
                }
                disabled={!config.pipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={config.pipelineId ? 'Cualquier etapa' : 'Selecciona pipeline primero'} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        }

        // Tag select
        if (field.name === 'tagId') {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">{field.label} {!field.required && <span className="text-muted-foreground">(opcional)</span>}</Label>
              <Select
                value={(config.tagId as string) ?? ''}
                onValueChange={(val) =>
                  onConfigChange({ ...config, tagId: val || undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cualquier tag" />
                </SelectTrigger>
                <SelectContent>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        }

        // Keywords input (tags type)
        if (field.type === 'tags') {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
              <KeywordsInput
                keywords={(config.keywords as string[]) ?? []}
                onChange={(keywords) => onConfigChange({ ...config, keywords })}
              />
            </div>
          )
        }

        // Text input (default)
        return (
          <div key={field.name} className="space-y-1.5">
            <Label className="text-sm">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
            <Input
              value={(config[field.name as keyof TriggerConfig] as string) ?? ''}
              onChange={(e) =>
                onConfigChange({ ...config, [field.name]: e.target.value || undefined })
              }
              placeholder={`Ingresa ${field.label.toLowerCase()}`}
            />
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function TriggerStep({ formData, onChange, pipelines, tags }: TriggerStepProps) {
  const selectedType = formData.trigger_type
  const selectedTrigger = TRIGGER_CATALOG.find((t) => t.type === selectedType)

  function selectTrigger(type: TriggerType) {
    // If changing trigger type, reset config
    if (type !== selectedType) {
      onChange({
        trigger_type: type,
        trigger_config: {},
        // Reset conditions when trigger changes since variables differ
        conditions: null,
      })
    }
  }

  function updateConfig(config: TriggerConfig) {
    onChange({ trigger_config: config })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Selecciona un trigger</h3>
        <p className="text-sm text-muted-foreground">
          El evento que dispara esta automatizacion
        </p>
      </div>

      {CATEGORIES.map((category) => {
        const triggers = getTriggersForCategory(category)
        const { icon: Icon, color } = CATEGORY_CONFIG[category]

        return (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={cn('p-1 rounded', color)}>
                <Icon className="size-4" />
              </div>
              <h4 className="text-sm font-medium">{category}</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {triggers.map((trigger) => {
                const isSelected = selectedType === trigger.type
                return (
                  <Card
                    key={trigger.type}
                    className={cn(
                      'cursor-pointer transition-all hover:border-primary/50 py-3',
                      isSelected && 'border-primary ring-1 ring-primary'
                    )}
                    onClick={() => selectTrigger(trigger.type as TriggerType)}
                  >
                    <CardContent className="px-4 py-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{trigger.label}</p>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {trigger.description}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="size-4 text-primary shrink-0 mt-0.5" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Config fields for selected trigger */}
      {selectedTrigger && (
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <TriggerConfigFields
              trigger={selectedTrigger}
              config={formData.trigger_config}
              onConfigChange={updateConfig}
              pipelines={pipelines}
              tags={tags}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
