'use client'

import { VARIABLE_CATALOG } from '@/lib/automations/constants'
import type {
  AutomationFormData,
  TriggerType,
  ConditionGroup,
  Condition,
  ConditionOperator,
} from '@/lib/automations/types'
import type { PipelineWithStages } from '@/lib/orders/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

// ============================================================================
// Types & Constants
// ============================================================================

interface ConditionsStepProps {
  formData: AutomationFormData
  onChange: (partial: Partial<AutomationFormData>) => void
  triggerType: TriggerType
  pipelines?: PipelineWithStages[]
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'es igual a' },
  { value: 'not_equals', label: 'no es igual a' },
  { value: 'contains', label: 'contiene' },
  { value: 'not_contains', label: 'no contiene' },
  { value: 'in', label: 'esta en' },
  { value: 'not_in', label: 'no esta en' },
  { value: 'gt', label: 'mayor que' },
  { value: 'lt', label: 'menor que' },
  { value: 'gte', label: 'mayor o igual' },
  { value: 'lte', label: 'menor o igual' },
  { value: 'exists', label: 'existe' },
  { value: 'not_exists', label: 'no existe' },
]

const NO_VALUE_OPERATORS: ConditionOperator[] = ['exists', 'not_exists']

// Fields that use a pipeline/stage dropdown instead of free-text input
const PIPELINE_FIELDS = ['orden.pipeline_id', 'orden.pipeline']
const STAGE_FIELDS = ['orden.stage_id', 'orden.stage']

// ============================================================================
// Helpers
// ============================================================================

function isConditionGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'logic' in item && 'conditions' in item
}

function createEmptyCondition(): Condition {
  return { field: '', operator: 'equals', value: '' }
}

function createEmptyGroup(): ConditionGroup {
  return { logic: 'AND', conditions: [createEmptyCondition()] }
}

function getVariableFields(triggerType: TriggerType): { path: string; label: string }[] {
  const vars = VARIABLE_CATALOG[triggerType as keyof typeof VARIABLE_CATALOG]
  return vars ? [...vars] : []
}

/**
 * Resolve a value to a human-readable name for display.
 * Handles both UUID-based (pipeline_id/stage_id) and name-based (pipeline/stage) fields.
 */
function resolveDisplayLabel(
  value: string,
  field: string,
  pipelines: PipelineWithStages[]
): string {
  if (!value || pipelines.length === 0) return value

  if (PIPELINE_FIELDS.includes(field)) {
    // For ID fields, look up by ID; for name fields, the value IS the name
    if (field.endsWith('_id')) {
      const found = pipelines.find((p) => p.id === value)
      return found ? found.name : value
    }
    return value
  }

  if (STAGE_FIELDS.includes(field)) {
    if (field.endsWith('_id')) {
      for (const p of pipelines) {
        const stage = p.stages.find((s) => s.id === value)
        if (stage) return `${stage.name} (${p.name})`
      }
      return value
    }
    return value
  }

  return value
}

// ============================================================================
// Value Input — renders dropdown for pipeline/stage, Input for everything else
// ============================================================================

function ConditionValueInput({
  condition,
  onUpdate,
  pipelines,
}: {
  condition: Condition
  onUpdate: (c: Condition) => void
  pipelines: PipelineWithStages[]
}) {
  const { field, value } = condition
  const strValue = String(value ?? '')
  const useIds = field.endsWith('_id')

  // Pipeline dropdown (works for both orden.pipeline_id and orden.pipeline)
  if (PIPELINE_FIELDS.includes(field) && pipelines.length > 0) {
    return (
      <Select
        value={strValue}
        onValueChange={(val) => onUpdate({ ...condition, value: val })}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Pipeline...">
            {resolveDisplayLabel(strValue, field, pipelines)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((p) => (
            <SelectItem key={useIds ? p.id : p.name} value={useIds ? p.id : p.name}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Stage dropdown (works for both orden.stage_id and orden.stage)
  if (STAGE_FIELDS.includes(field) && pipelines.length > 0) {
    return (
      <Select
        value={strValue}
        onValueChange={(val) => onUpdate({ ...condition, value: val })}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Etapa...">
            {resolveDisplayLabel(strValue, field, pipelines)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((p) => (
            <SelectGroup key={p.id}>
              <SelectLabel className="text-xs text-muted-foreground">
                {p.name}
              </SelectLabel>
              {p.stages.map((s) => (
                <SelectItem key={useIds ? s.id : s.name} value={useIds ? s.id : s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Default: free-text input
  return (
    <Input
      className="h-9 text-xs"
      value={strValue}
      onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
      placeholder="Valor..."
    />
  )
}

// ============================================================================
// Single Condition Row
// ============================================================================

function ConditionRow({
  condition,
  onUpdate,
  onRemove,
  fields,
  canRemove,
  pipelines,
}: {
  condition: Condition
  onUpdate: (c: Condition) => void
  onRemove: () => void
  fields: { path: string; label: string }[]
  canRemove: boolean
  pipelines: PipelineWithStages[]
}) {
  const v2 = useDashboardV2()
  const needsValue = !NO_VALUE_OPERATORS.includes(condition.operator)

  return (
    <div
      className={cn(
        'flex items-start gap-2',
        v2 && 'p-2 border border-[var(--border)] bg-[var(--paper-0)]'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {/* Field selector */}
      <div className="flex-1 min-w-0">
        <Select
          value={condition.field}
          onValueChange={(val) => onUpdate({ ...condition, field: val, value: '' })}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Campo..." />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.path} value={f.path}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator */}
      <div className="w-36 shrink-0">
        <Select
          value={condition.operator}
          onValueChange={(val) =>
            onUpdate({ ...condition, operator: val as ConditionOperator })
          }
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value input (dropdown for pipeline/stage, text for others) */}
      {needsValue && (
        <div className="flex-1 min-w-0">
          <ConditionValueInput
            condition={condition}
            onUpdate={onUpdate}
            pipelines={pipelines}
          />
        </div>
      )}

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={!canRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

// ============================================================================
// Condition Group Component (supports 1 level nesting)
// ============================================================================

function ConditionGroupEditor({
  group,
  onUpdate,
  onRemove,
  fields,
  depth,
  pipelines,
}: {
  group: ConditionGroup
  onUpdate: (g: ConditionGroup) => void
  onRemove: () => void
  fields: { path: string; label: string }[]
  depth: number
  pipelines: PipelineWithStages[]
}) {
  const v2 = useDashboardV2()
  function toggleLogic() {
    onUpdate({ ...group, logic: group.logic === 'AND' ? 'OR' : 'AND' })
  }

  function updateConditionAtIndex(index: number, updated: Condition | ConditionGroup) {
    const newConditions = [...group.conditions]
    newConditions[index] = updated
    onUpdate({ ...group, conditions: newConditions })
  }

  function removeConditionAtIndex(index: number) {
    const newConditions = group.conditions.filter((_, i) => i !== index)
    if (newConditions.length === 0) {
      onRemove()
    } else {
      onUpdate({ ...group, conditions: newConditions })
    }
  }

  function addCondition() {
    onUpdate({
      ...group,
      conditions: [...group.conditions, createEmptyCondition()],
    })
  }

  function addSubGroup() {
    if (depth >= 1) return // max 1 level of nesting
    onUpdate({
      ...group,
      conditions: [...group.conditions, createEmptyGroup()],
    })
  }

  if (v2) {
    return (
      <div
        className={cn(
          'p-3 space-y-3',
          depth === 0
            ? 'border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)]'
            : 'border border-dashed border-[var(--border)] bg-[var(--paper-2)]'
        )}
      >
        {/* Group header: AND/OR toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={group.logic === 'AND' ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-7 text-[11px] px-2 font-semibold tracking-[0.08em] uppercase',
                group.logic === 'AND'
                  ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                  : 'bg-transparent text-[var(--ink-3)] border-[var(--border)] hover:text-[var(--ink-1)] hover:border-[var(--ink-1)]'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
              onClick={toggleLogic}
            >
              AND
            </Button>
            <Button
              type="button"
              variant={group.logic === 'OR' ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-7 text-[11px] px-2 font-semibold tracking-[0.08em] uppercase',
                group.logic === 'OR'
                  ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                  : 'bg-transparent text-[var(--ink-3)] border-[var(--border)] hover:text-[var(--ink-1)] hover:border-[var(--ink-1)]'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
              onClick={toggleLogic}
            >
              OR
            </Button>
            <span
              className="text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {group.logic === 'AND'
                ? 'Todas deben cumplirse'
                : 'Al menos una debe cumplirse'}
            </span>
          </div>
          {depth > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-[var(--ink-3)] hover:text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5 mr-1" />
              Eliminar grupo
            </Button>
          )}
        </div>

        {/* Conditions list */}
        <div className="space-y-2">
          {group.conditions.map((item, index) => {
            if (isConditionGroup(item)) {
              return (
                <ConditionGroupEditor
                  key={index}
                  group={item}
                  onUpdate={(g) => updateConditionAtIndex(index, g)}
                  onRemove={() => removeConditionAtIndex(index)}
                  fields={fields}
                  depth={depth + 1}
                  pipelines={pipelines}
                />
              )
            }
            return (
              <ConditionRow
                key={index}
                condition={item}
                onUpdate={(c) => updateConditionAtIndex(index, c)}
                onRemove={() => removeConditionAtIndex(index)}
                fields={fields}
                canRemove={group.conditions.length > 1}
                pipelines={pipelines}
              />
            )
          })}
        </div>

        {/* Add condition / sub-group buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-dotted border-[var(--border)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px] font-bold uppercase tracking-[0.12em] bg-transparent text-[var(--rubric-2)] border border-[var(--rubric-2)] hover:bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))]"
            style={{ fontFamily: 'var(--font-sans)' }}
            onClick={addCondition}
          >
            <Plus className="size-3 mr-1" />
            Condición
          </Button>
          {depth < 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px] font-bold uppercase tracking-[0.12em] bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
              onClick={addSubGroup}
            >
              <GitBranch className="size-3 mr-1" />
              Sub-grupo
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className={cn('py-3', depth > 0 && 'border-dashed bg-muted/30')}>
      <CardContent className="px-4 py-0 space-y-3">
        {/* Group header: AND/OR toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={group.logic === 'AND' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={toggleLogic}
            >
              AND
            </Button>
            <Button
              type="button"
              variant={group.logic === 'OR' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={toggleLogic}
            >
              OR
            </Button>
            <span className="text-xs text-muted-foreground">
              {group.logic === 'AND'
                ? 'Todas deben cumplirse'
                : 'Al menos una debe cumplirse'}
            </span>
          </div>
          {depth > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5 mr-1" />
              Eliminar grupo
            </Button>
          )}
        </div>

        {/* Conditions list */}
        <div className="space-y-2">
          {group.conditions.map((item, index) => {
            if (isConditionGroup(item)) {
              return (
                <ConditionGroupEditor
                  key={index}
                  group={item}
                  onUpdate={(g) => updateConditionAtIndex(index, g)}
                  onRemove={() => removeConditionAtIndex(index)}
                  fields={fields}
                  depth={depth + 1}
                  pipelines={pipelines}
                />
              )
            }
            return (
              <ConditionRow
                key={index}
                condition={item}
                onUpdate={(c) => updateConditionAtIndex(index, c)}
                onRemove={() => removeConditionAtIndex(index)}
                fields={fields}
                canRemove={group.conditions.length > 1}
                pipelines={pipelines}
              />
            )
          })}
        </div>

        {/* Add condition / sub-group buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addCondition}
          >
            <Plus className="size-3 mr-1" />
            Condicion
          </Button>
          {depth < 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={addSubGroup}
            >
              <GitBranch className="size-3 mr-1" />
              Sub-grupo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ConditionsStep({ formData, onChange, triggerType, pipelines = [] }: ConditionsStepProps) {
  const v2 = useDashboardV2()
  const conditions = formData.conditions
  const fields = getVariableFields(triggerType)

  function addGroup() {
    const newGroup = createEmptyGroup()
    if (!conditions) {
      // First group becomes the root
      onChange({ conditions: newGroup })
    } else {
      // Add as nested group inside root
      onChange({
        conditions: {
          ...conditions,
          conditions: [...conditions.conditions, newGroup],
        },
      })
    }
  }

  function updateRoot(group: ConditionGroup) {
    onChange({ conditions: group })
  }

  function removeRoot() {
    onChange({ conditions: null })
  }

  return (
    <div className="space-y-4">
      <div>
        {v2 ? (
          <>
            <span
              className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent-indigo)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Filtros · lógica condicional
            </span>
            <h3
              className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Condiciones
            </h3>
            <p
              className="mt-1 text-[12px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Define condiciones opcionales para filtrar cuándo se ejecuta la automatización.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold">Condiciones</h3>
            <p className="text-sm text-muted-foreground">
              Define condiciones opcionales para filtrar cuando se ejecuta la automatizacion
            </p>
          </>
        )}
      </div>

      {!conditions ? (
        v2 ? (
          <div className="border border-dashed border-[var(--border)] bg-[var(--paper-2)] p-8 text-center space-y-3">
            <div className="flex justify-center">
              <GitBranch className="size-7 text-[var(--accent-indigo)]" />
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Sin condiciones, la automatización se ejecutará siempre que el trigger se dispare.
            </p>
            <p className="mx-rule-ornament">· · ·</p>
            <Button
              type="button"
              variant="outline"
              onClick={addGroup}
              className="bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Plus className="size-4 mr-2" />
              Agregar grupo de condiciones
            </Button>
          </div>
        ) : (
          <div className="border border-dashed rounded-lg p-8 text-center space-y-3">
            <div className="flex justify-center">
              <GitBranch className="size-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Sin condiciones, la automatizacion se ejecutara siempre que el trigger se dispare.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={addGroup}
            >
              <Plus className="size-4 mr-2" />
              Agregar grupo de condiciones
            </Button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <ConditionGroupEditor
            group={conditions}
            onUpdate={updateRoot}
            onRemove={removeRoot}
            fields={fields}
            depth={0}
            pipelines={pipelines}
          />
          <div className="flex items-center gap-2">
            <Label
              className={cn(
                v2
                  ? 'text-[11px] italic text-[var(--ink-3)] tracking-[0.02em]'
                  : 'text-xs text-muted-foreground'
              )}
              style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
            >
              Puedes agregar condiciones individuales o sub-grupos dentro del grupo principal.
            </Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              v2
                ? 'text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--rubric-2)] hover:text-[var(--rubric-1)] hover:bg-[color-mix(in_oklch,var(--rubric-2)_6%,var(--paper-0))]'
                : 'text-xs text-destructive hover:text-destructive'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            onClick={removeRoot}
          >
            <Trash2 className="size-3 mr-1" />
            Eliminar todas las condiciones
          </Button>
        </div>
      )}
    </div>
  )
}
