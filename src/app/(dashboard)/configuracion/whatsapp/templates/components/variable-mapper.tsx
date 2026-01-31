'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface VariableMapperProps {
  templateBody: string
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
}

const AVAILABLE_FIELDS = [
  { value: 'contact.name', label: 'Nombre del contacto' },
  { value: 'contact.phone', label: 'Telefono del contacto' },
  { value: 'contact.email', label: 'Email del contacto' },
  { value: 'contact.city', label: 'Ciudad del contacto' },
  { value: 'order.id', label: 'ID del pedido' },
  { value: 'order.total', label: 'Total del pedido' },
  { value: 'order.tracking_number', label: 'Numero de guia' },
  { value: 'order.carrier', label: 'Transportadora' },
  { value: 'custom', label: 'Valor personalizado...' },
]

export function VariableMapper({
  templateBody,
  mapping,
  onChange,
}: VariableMapperProps) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  // Extract variables like {{1}}, {{2}} from body
  const variables = templateBody.match(/\{\{(\d+)\}\}/g) || []
  const uniqueVars = [...new Set(variables)]

  if (uniqueVars.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay variables en el cuerpo del template. Usa {'{{1}}'}, {'{{2}}'},{' '}
        etc. para agregar variables.
      </p>
    )
  }

  const handleChange = (varNum: string, value: string) => {
    if (value === 'custom') {
      // Keep custom selection, actual value comes from input
      onChange({ ...mapping, [varNum]: customValues[varNum] || '' })
    } else {
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
        <h4 className="text-sm font-medium">Mapeo de Variables</h4>
        <p className="text-xs text-muted-foreground">
          Conecta cada variable con un campo de contacto o pedido
        </p>
      </div>

      <div className="space-y-3">
        {uniqueVars.map((varMatch) => {
          const varNum = varMatch.replace(/[{}]/g, '')
          const currentValue = mapping[varNum] || ''
          const isCustomValue = isCustom(varNum)

          return (
            <div key={varNum} className="flex items-center gap-3">
              <span className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[60px] text-center">
                {`{{${varNum}}}`}
              </span>
              <span className="text-muted-foreground">-&gt;</span>
              <Select
                value={isCustomValue ? 'custom' : currentValue}
                onValueChange={(value) => handleChange(varNum, value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar campo..." />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_FIELDS.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isCustomValue && (
                <Input
                  placeholder="Valor personalizado"
                  value={customValues[varNum] || currentValue}
                  onChange={(e) => handleCustomValue(varNum, e.target.value)}
                  className="w-48"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
