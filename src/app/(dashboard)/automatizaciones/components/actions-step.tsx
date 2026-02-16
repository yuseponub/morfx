'use client'

import { ACTION_CATALOG, MAX_ACTIONS_PER_AUTOMATION } from '@/lib/automations/constants'
import type {
  AutomationFormData,
  AutomationAction,
  ActionType,
  DelayConfig,
  TriggerType,
} from '@/lib/automations/types'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  AlertTriangle,
  Building2,
  ShoppingCart,
  MessageSquare,
  ListTodo,
  Globe,
  Phone,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VariablePicker } from './variable-picker'
import { checkTwilioConfigured } from '@/app/actions/automations'
import { useState, useEffect } from 'react'

// ============================================================================
// Types & Constants
// ============================================================================

interface ActionsStepProps {
  formData: AutomationFormData
  onChange: (partial: Partial<AutomationFormData>) => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
  triggerType: TriggerType
}

type CatalogAction = (typeof ACTION_CATALOG)[number]
type CatalogParam = CatalogAction['params'][number]

const DELAY_UNITS = [
  { value: 'minutes', label: 'Minutos' },
  { value: 'hours', label: 'Horas' },
  { value: 'days', label: 'Dias' },
] as const

const ACTION_CATEGORY_CONFIG: Record<string, { icon: typeof Building2; color: string }> = {
  CRM: { icon: Building2, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50' },
  Ordenes: { icon: ShoppingCart, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50' },
  WhatsApp: { icon: MessageSquare, color: 'text-green-600 bg-green-50 dark:bg-green-950/50' },
  Tareas: { icon: ListTodo, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50' },
  Integraciones: { icon: Globe, color: 'text-gray-600 bg-gray-50 dark:bg-gray-950/50' },
  Twilio: { icon: Phone, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50' },
}

/** Help text for specific action params */
const PARAM_HELP_TEXT: Record<string, Record<string, string>> = {
  send_sms: {
    to: 'Dejar vacio para usar el telefono del contacto del trigger',
    mediaUrl: 'MMS solo disponible para numeros de US/Canada',
  },
}

// ============================================================================
// KeyValue Editor Sub-component
// ============================================================================

function KeyValueEditor({
  value,
  onChange,
  keyLabel,
  valueLabel,
}: {
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
  keyLabel?: string
  valueLabel?: string
}) {
  const entries = Object.entries(value)

  function addEntry() {
    onChange({ ...value, '': '' })
  }

  function updateKey(oldKey: string, newKey: string) {
    const newValue: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === oldKey) {
        newValue[newKey] = v
      } else {
        newValue[k] = v
      }
    }
    onChange(newValue)
  }

  function updateVal(key: string, val: string) {
    onChange({ ...value, [key]: val })
  }

  function removeEntry(key: string) {
    const newValue = { ...value }
    delete newValue[key]
    onChange(newValue)
  }

  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="h-8 text-xs flex-1"
            placeholder={keyLabel ?? 'Clave'}
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
          />
          <Input
            className="h-8 text-xs flex-1"
            placeholder={valueLabel ?? 'Valor'}
            value={v}
            onChange={(e) => updateVal(k, e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeEntry(k)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={addEntry}
      >
        <Plus className="size-3 mr-1" />
        Agregar
      </Button>
    </div>
  )
}

// ============================================================================
// Delay Editor
// ============================================================================

function DelayEditor({
  delay,
  onChange,
}: {
  delay: DelayConfig | null | undefined
  onChange: (delay: DelayConfig | null) => void
}) {
  const [enabled, setEnabled] = useState(!!delay)

  function toggleDelay(checked: boolean) {
    setEnabled(checked)
    if (!checked) {
      onChange(null)
    } else {
      onChange({ amount: 5, unit: 'minutes' })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={toggleDelay}
        />
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="size-3" />
          Retraso antes de ejecutar
        </span>
      </div>
      {enabled && delay && (
        <div className="flex items-center gap-2 ml-6">
          <Input
            type="number"
            className="h-8 w-20 text-xs"
            min={1}
            value={delay.amount}
            onChange={(e) =>
              onChange({ ...delay, amount: Math.max(1, parseInt(e.target.value) || 1) })
            }
          />
          <Select
            value={delay.unit}
            onValueChange={(val) =>
              onChange({ ...delay, unit: val as DelayConfig['unit'] })
            }
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Action Param Field Renderer
// ============================================================================

function ActionParamField({
  param,
  value,
  onChange,
  pipelines,
  tags,
  triggerType,
  allParams,
  helpText,
}: {
  param: CatalogParam
  value: unknown
  onChange: (val: unknown) => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
  triggerType: TriggerType
  allParams: Record<string, unknown>
  helpText?: string
}) {
  const supportsVars = 'supportsVariables' in param && param.supportsVariables

  // select type
  if (param.type === 'select') {
    // Special handling by name
    if (param.name === 'pipelineId' || param.name === 'targetPipelineId') {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val || undefined)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar pipeline..." />
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

    if (param.name === 'stageId' || param.name === 'targetStageId') {
      const pipelineKey = param.name === 'targetStageId' ? 'targetPipelineId' : 'pipelineId'
      const selectedPipeline = pipelines.find((p) => p.id === allParams[pipelineKey])
      const stages = selectedPipeline?.stages ?? []
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val || undefined)}
            disabled={!allParams[pipelineKey]}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={allParams[pipelineKey] ? 'Seleccionar etapa...' : 'Selecciona pipeline primero'} />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (param.name === 'tagName') {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val || undefined)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar tag..." />
            </SelectTrigger>
            <SelectContent>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.name}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (param.name === 'entityType' && 'options' in param) {
      const options = param.options as readonly string[]
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val || undefined)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === 'contact' ? 'Contacto' : opt === 'order' ? 'Orden' : opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // Fallback select for templateName and assignToUserId
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
        <Input
          className="h-8 text-xs"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Ingresar ${param.label.toLowerCase()}...`}
        />
      </div>
    )
  }

  // textarea type
  if (param.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          {supportsVars && (
            <VariablePicker
              triggerType={triggerType}
              onInsert={(variable) => onChange(((value as string) ?? '') + variable)}
            />
          )}
        </div>
        <Textarea
          className="text-xs min-h-[60px] resize-none"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Ingresar ${param.label.toLowerCase()}...`}
          rows={3}
        />
        {supportsVars && (
          <p className="text-[10px] text-muted-foreground">
            Variables como {'{{contacto.nombre}}'} se resuelven al ejecutarse
          </p>
        )}
        {helpText && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="size-3 shrink-0" />
            {helpText}
          </p>
        )}
      </div>
    )
  }

  // text type
  if (param.type === 'text') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{param.label} {param.required && <span className="text-destructive">*</span>}</Label>
          {supportsVars && (
            <VariablePicker
              triggerType={triggerType}
              onInsert={(variable) => onChange(((value as string) ?? '') + variable)}
            />
          )}
        </div>
        <Input
          className="h-8 text-xs"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Ingresar ${param.label.toLowerCase()}...`}
        />
        {helpText && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="size-3 shrink-0" />
            {helpText}
          </p>
        )}
      </div>
    )
  }

  // boolean type
  if (param.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <Label className="text-xs">{param.label}</Label>
      </div>
    )
  }

  // delay type (for dueDateRelative)
  if (param.type === 'delay') {
    const delayVal = value as DelayConfig | null | undefined
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{param.label}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="h-8 w-20 text-xs"
            min={1}
            value={delayVal?.amount ?? 1}
            onChange={(e) =>
              onChange({
                amount: Math.max(1, parseInt(e.target.value) || 1),
                unit: delayVal?.unit ?? 'days',
              })
            }
          />
          <Select
            value={delayVal?.unit ?? 'days'}
            onValueChange={(val) =>
              onChange({
                amount: delayVal?.amount ?? 1,
                unit: val as DelayConfig['unit'],
              })
            }
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  // key_value type
  if (param.type === 'key_value') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{param.label}</Label>
        <KeyValueEditor
          value={(value as Record<string, string>) ?? {}}
          onChange={(v) => onChange(v)}
        />
      </div>
    )
  }

  // json type
  if (param.type === 'json') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{param.label}</Label>
          {supportsVars && (
            <VariablePicker
              triggerType={triggerType}
              onInsert={(variable) => onChange(((value as string) ?? '') + variable)}
            />
          )}
        </div>
        <Textarea
          className="text-xs min-h-[80px] font-mono resize-none"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder='{"key": "value"}'
          rows={4}
        />
      </div>
    )
  }

  return null
}

// ============================================================================
// Action Card Component
// ============================================================================

function ActionCard({
  action,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  pipelines,
  tags,
  triggerType,
  twilioWarning,
}: {
  action: AutomationAction
  index: number
  total: number
  onUpdate: (a: AutomationAction) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  pipelines: PipelineWithStages[]
  tags: Tag[]
  triggerType: TriggerType
  twilioWarning: boolean
}) {
  const catalogEntry = ACTION_CATALOG.find((a) => a.type === action.type)
  if (!catalogEntry) return null

  const categoryConfig = ACTION_CATEGORY_CONFIG[catalogEntry.category]
  const CategoryIcon = categoryConfig?.icon
  const actionHelpTexts = PARAM_HELP_TEXT[action.type] ?? {}

  function updateParam(name: string, value: unknown) {
    onUpdate({
      ...action,
      params: { ...action.params, [name]: value },
    })
  }

  function updateDelay(delay: DelayConfig | null) {
    onUpdate({ ...action, delay })
  }

  return (
    <Card className="py-3">
      <CardContent className="px-4 py-0 space-y-3">
        {/* Card header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-mono">
              {index + 1}
            </Badge>
            {CategoryIcon && (
              <div className={cn('p-1 rounded', categoryConfig.color)}>
                <CategoryIcon className="size-3.5" />
              </div>
            )}
            <span className="text-sm font-medium">{catalogEntry.label}</span>
            <Badge variant="outline" className="text-xs">
              {catalogEntry.category}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onMoveUp}
              disabled={index === 0}
              title="Mover arriba"
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onMoveDown}
              disabled={index === total - 1}
              title="Mover abajo"
            >
              <ChevronDown className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              title="Eliminar accion"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{catalogEntry.description}</p>

        {/* Twilio not configured warning */}
        {twilioWarning && catalogEntry.category === 'Twilio' && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            Twilio no configurado. Configura tus credenciales en Configuracion &gt; Integraciones antes de usar esta accion.
          </div>
        )}

        {/* Params */}
        <div className="space-y-3 border-t pt-3">
          {catalogEntry.params.map((param) => (
            <ActionParamField
              key={param.name}
              param={param}
              value={action.params[param.name]}
              onChange={(val) => updateParam(param.name, val)}
              pipelines={pipelines}
              tags={tags}
              triggerType={triggerType}
              allParams={action.params}
              helpText={actionHelpTexts[param.name]}
            />
          ))}
        </div>

        {/* Delay */}
        <div className="border-t pt-3">
          <DelayEditor
            delay={action.delay}
            onChange={updateDelay}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Action Selector Popover
// ============================================================================

function ActionSelector({
  onSelect,
  disabled,
}: {
  onSelect: (type: ActionType) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)

  const categories = [...new Set(ACTION_CATALOG.map((a) => a.category))]

  function handleSelect(type: ActionType) {
    onSelect(type)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
        >
          <Plus className="size-4 mr-2" />
          Agregar accion
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Seleccionar accion</p>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {categories.map((cat) => {
            const catConfig = ACTION_CATEGORY_CONFIG[cat]
            const CatIcon = catConfig?.icon
            return (
            <div key={cat}>
              <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                {CatIcon && <CatIcon className={cn('size-3', catConfig?.color?.split(' ')[0])} />}
                {cat}
              </p>
              {ACTION_CATALOG.filter((a) => a.category === cat).map((action) => (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => handleSelect(action.type as ActionType)}
                  className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors"
                >
                  <span className="font-medium">{action.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {action.description}
                  </span>
                </button>
              ))}
            </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ActionsStep({ formData, onChange, pipelines, tags, triggerType }: ActionsStepProps) {
  const actions = formData.actions
  const atLimit = actions.length >= MAX_ACTIONS_PER_AUTOMATION
  const [twilioWarning, setTwilioWarning] = useState(false)

  // Check Twilio configuration when a Twilio action is present
  const hasTwilioAction = actions.some((a) => {
    const entry = ACTION_CATALOG.find((c) => c.type === a.type)
    return entry?.category === 'Twilio'
  })

  useEffect(() => {
    if (!hasTwilioAction) {
      setTwilioWarning(false)
      return
    }
    let cancelled = false
    checkTwilioConfigured().then((configured) => {
      if (!cancelled) {
        setTwilioWarning(!configured)
      }
    })
    return () => { cancelled = true }
  }, [hasTwilioAction])

  function addAction(type: ActionType) {
    if (atLimit) return
    const newAction: AutomationAction = {
      type,
      params: {},
      delay: null,
    }
    onChange({ actions: [...actions, newAction] })
  }

  function updateAction(index: number, updated: AutomationAction) {
    const newActions = [...actions]
    newActions[index] = updated
    onChange({ actions: newActions })
  }

  function removeAction(index: number) {
    onChange({ actions: actions.filter((_, i) => i !== index) })
  }

  function moveAction(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= actions.length) return
    const newActions = [...actions]
    const temp = newActions[index]
    newActions[index] = newActions[newIndex]
    newActions[newIndex] = temp
    onChange({ actions: newActions })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Acciones</h3>
        <p className="text-sm text-muted-foreground">
          Define las acciones que se ejecutaran en orden secuencial
        </p>
      </div>

      {/* Action cards */}
      {actions.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Agrega al menos una accion para completar la automatizacion.
          </p>
          <ActionSelector onSelect={addAction} disabled={false} />
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <ActionCard
              key={`${action.type}-${index}`}
              action={action}
              index={index}
              total={actions.length}
              onUpdate={(a) => updateAction(index, a)}
              onRemove={() => removeAction(index)}
              onMoveUp={() => moveAction(index, -1)}
              onMoveDown={() => moveAction(index, 1)}
              pipelines={pipelines}
              tags={tags}
              triggerType={triggerType}
              twilioWarning={twilioWarning}
            />
          ))}

          {/* Add button + limit warning */}
          <div className="flex items-center justify-between">
            <ActionSelector onSelect={addAction} disabled={atLimit} />
            <span className="text-xs text-muted-foreground">
              {actions.length}/{MAX_ACTIONS_PER_AUTOMATION} acciones
            </span>
          </div>

          {atLimit && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              <AlertTriangle className="size-3.5 shrink-0" />
              Limite de acciones alcanzado ({MAX_ACTIONS_PER_AUTOMATION} maximo)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
