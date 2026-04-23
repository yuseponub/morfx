'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface VariableMapperProps {
  templateBody: string
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
  v2?: boolean
}

const CONTACT_FIELDS = [
  { value: 'contact.name', label: 'Nombre' },
  { value: 'contact.phone', label: 'Telefono' },
  { value: 'contact.email', label: 'Email' },
  { value: 'contact.city', label: 'Ciudad' },
]

const ORDER_FIELDS = [
  { value: 'order.id', label: 'ID del pedido' },
  { value: 'order.total', label: 'Total' },
  { value: 'order.tracking_number', label: 'Numero de guia' },
  { value: 'order.carrier', label: 'Transportadora' },
]

const AVAILABLE_FIELDS = [...CONTACT_FIELDS, ...ORDER_FIELDS, { value: 'custom', label: 'Valor personalizado...' }]

export function VariableMapper({
  templateBody,
  mapping,
  onChange,
  v2: v2Prop,
}: VariableMapperProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({})

  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined
  const selectTriggerV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
    : ''
  const selectContentV2 = v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]' : ''
  const selectItemV2 = v2 ? 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]' : ''
  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''

  // Extract variables like {{1}}, {{2}} from body
  const variables = templateBody.match(/\{\{(\d+)\}\}/g) || []
  const uniqueVars = [...new Set(variables)]

  if (uniqueVars.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', v2 && '!text-[13px] !text-[var(--ink-3)]')} style={v2FontSans}>
        No hay variables en el cuerpo del template. Usa {'{{1}}'}, {'{{2}}'},{' '}
        etc. para agregar variables.
      </p>
    )
  }

  const handleChange = (varNum: string, value: string) => {
    if (value === 'custom') {
      setCustomMode({ ...customMode, [varNum]: true })
      onChange({ ...mapping, [varNum]: customValues[varNum] || '' })
    } else {
      setCustomMode({ ...customMode, [varNum]: false })
      onChange({ ...mapping, [varNum]: value })
    }
  }

  const handleCustomValue = (varNum: string, value: string) => {
    setCustomValues({ ...customValues, [varNum]: value })
    if (
      mapping[varNum] === '' ||
      !AVAILABLE_FIELDS.find((f) => f.value === mapping[varNum])
    ) {
      onChange({ ...mapping, [varNum]: value })
    }
  }

  const isCustom = (varNum: string) => {
    if (customMode[varNum]) return true
    const value = mapping[varNum]
    return (
      value !== undefined &&
      value !== '' &&
      !AVAILABLE_FIELDS.find((f) => f.value === value)
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className={cn('text-sm font-medium', v2 && '!text-[10px] !font-semibold !uppercase !tracking-[0.12em] !text-[var(--rubric-2)]')} style={v2FontSans}>Mapeo de Variables</h4>
        <p className={cn('text-xs text-muted-foreground', v2 && '!text-[11px] !text-[var(--ink-3)]')} style={v2FontSans}>
          Conecta cada variable con un campo de contacto o pedido
        </p>
      </div>

      <div className={cn('space-y-3', v2 && 'divide-y divide-dashed divide-[var(--border)]')}>
        {uniqueVars.map((varMatch) => {
          const varNum = varMatch.replace(/[{}]/g, '')
          const currentValue = mapping[varNum] || ''
          const isCustomValue = isCustom(varNum)

          return (
            <div key={varNum} className={cn('flex items-center gap-3', v2 && 'pt-3 first:pt-0')}>
              <span
                className={cn(
                  'text-sm font-mono bg-muted px-2 py-1 rounded min-w-[60px] text-center',
                  v2 && '!bg-[var(--paper-2)] !border !border-[var(--border)] !text-[12px] !text-[var(--ink-2)]'
                )}
                style={v2FontMono}
              >
                {`{{${varNum}}}`}
              </span>
              <span className={cn('text-muted-foreground', v2 && '!text-[var(--ink-3)] !text-[12px]')} style={v2FontMono}>-&gt;</span>
              <Select
                value={isCustomValue ? 'custom' : currentValue}
                onValueChange={(value) => handleChange(varNum, value)}
              >
                <SelectTrigger className={cn('flex-1', selectTriggerV2)} style={v2FontSans}>
                  <SelectValue placeholder="Seleccionar campo..." />
                </SelectTrigger>
                <SelectContent className={selectContentV2}>
                  <SelectGroup>
                    <SelectLabel className={cn(v2 && '!text-[10px] !font-semibold !uppercase !tracking-[0.08em] !text-[var(--ink-3)]')} style={v2FontSans}>Pedido</SelectLabel>
                    {ORDER_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value} className={selectItemV2} style={v2FontSans}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className={cn(v2 && '!text-[10px] !font-semibold !uppercase !tracking-[0.08em] !text-[var(--ink-3)]')} style={v2FontSans}>Contacto</SelectLabel>
                    {CONTACT_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value} className={selectItemV2} style={v2FontSans}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectItem value="custom" className={selectItemV2} style={v2FontSans}>Valor personalizado...</SelectItem>
                </SelectContent>
              </Select>
              {isCustomValue && (
                <Input
                  placeholder="Valor personalizado"
                  value={customValues[varNum] || currentValue}
                  onChange={(e) => handleCustomValue(varNum, e.target.value)}
                  className={cn('w-48', inputV2)}
                  style={v2FontSans}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
