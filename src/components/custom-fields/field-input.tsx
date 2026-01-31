'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CustomFieldDefinition } from '@/lib/types/database'

// ============================================================================
// FieldInput Component
// ============================================================================

interface FieldInputProps {
  definition: CustomFieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  disabled?: boolean
  showLabel?: boolean
}

/**
 * Dynamic input component that renders appropriate input based on field type.
 * Supports all 12 custom field types.
 */
export function FieldInput({
  definition,
  value,
  onChange,
  error,
  disabled = false,
  showLabel = true,
}: FieldInputProps) {
  const { name, key, field_type, options, is_required } = definition

  // Common input props
  const inputId = `field-${key}`

  // Render appropriate input based on field type
  const renderInput = () => {
    switch (field_type) {
      case 'text':
        return (
          <Input
            id={inputId}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(error && 'border-destructive')}
          />
        )

      case 'number':
        return (
          <Input
            id={inputId}
            type="number"
            value={value !== null && value !== undefined ? String(value) : ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
            className={cn(error && 'border-destructive')}
          />
        )

      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id={inputId}
              type="number"
              min={0}
              step="0.01"
              value={value !== null && value !== undefined ? String(value) : ''}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
              disabled={disabled}
              className={cn('pl-7', error && 'border-destructive')}
            />
          </div>
        )

      case 'percentage':
        return (
          <div className="relative">
            <Input
              id={inputId}
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={value !== null && value !== undefined ? String(value) : ''}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
              disabled={disabled}
              className={cn('pr-7', error && 'border-destructive')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              %
            </span>
          </div>
        )

      case 'date':
        return (
          <Input
            id={inputId}
            type="date"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={cn(error && 'border-destructive')}
          />
        )

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={inputId}
              checked={Boolean(value)}
              onCheckedChange={(checked) => onChange(Boolean(checked))}
              disabled={disabled}
            />
            <Label htmlFor={inputId} className="text-sm font-normal cursor-pointer">
              {name}
            </Label>
          </div>
        )

      case 'select':
        return (
          <Select
            value={(value as string) || ''}
            onValueChange={(val) => onChange(val || null)}
            disabled={disabled}
          >
            <SelectTrigger className={cn(error && 'border-destructive')}>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'email':
        return (
          <Input
            id={inputId}
            type="email"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="ejemplo@correo.com"
            className={cn(error && 'border-destructive')}
          />
        )

      case 'url':
        return (
          <Input
            id={inputId}
            type="url"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="https://..."
            className={cn(error && 'border-destructive')}
          />
        )

      case 'phone':
        return (
          <Input
            id={inputId}
            type="tel"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="+57 300 123 4567"
            className={cn(error && 'border-destructive')}
          />
        )

      case 'file':
        // For MVP: simple URL input for file hosted elsewhere
        return (
          <Input
            id={inputId}
            type="url"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="URL del archivo..."
            className={cn(error && 'border-destructive')}
          />
        )

      case 'contact_relation':
        // For MVP: simple text input for contact ID
        // TODO: Replace with contact search combobox
        return (
          <Input
            id={inputId}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="ID del contacto relacionado"
            className={cn(error && 'border-destructive')}
          />
        )

      default:
        return (
          <Input
            id={inputId}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(error && 'border-destructive')}
          />
        )
    }
  }

  // Checkbox has its own label layout
  if (field_type === 'checkbox') {
    return (
      <div className="space-y-2">
        {renderInput()}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {showLabel && (
        <Label htmlFor={inputId}>
          {name}
          {is_required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      {renderInput()}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
