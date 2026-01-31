'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPhoneDisplay, isValidColombianPhone, normalizePhone } from '@/lib/utils/phone'
import { CheckIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  name?: string
  id?: string
  disabled?: boolean
  error?: string
}

export function PhoneInput({
  value,
  onChange,
  name = 'phone',
  id = 'phone',
  disabled = false,
  error,
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = React.useState(value)
  const [validationState, setValidationState] = React.useState<'valid' | 'invalid' | 'pending'>('pending')
  const [formattedPreview, setFormattedPreview] = React.useState<string | null>(null)

  // Debounce validation
  React.useEffect(() => {
    if (!displayValue.trim()) {
      setValidationState('pending')
      setFormattedPreview(null)
      return
    }

    const timer = setTimeout(() => {
      const isValid = isValidColombianPhone(displayValue)
      setValidationState(isValid ? 'valid' : 'invalid')

      if (isValid) {
        const normalized = normalizePhone(displayValue)
        if (normalized) {
          setFormattedPreview(formatPhoneDisplay(normalized))
        }
      } else {
        setFormattedPreview(null)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [displayValue])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setDisplayValue(newValue)
    onChange(newValue)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Telefono *</Label>
      <div className="relative">
        <Input
          type="tel"
          id={id}
          name={name}
          value={displayValue}
          onChange={handleChange}
          placeholder="300 123 4567"
          disabled={disabled}
          className={cn(
            'pr-10',
            error && 'border-destructive',
            validationState === 'valid' && 'border-green-500',
            validationState === 'invalid' && displayValue && 'border-orange-500'
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validationState === 'valid' && (
            <CheckIcon className="h-4 w-4 text-green-500" />
          )}
          {validationState === 'invalid' && displayValue && (
            <XIcon className="h-4 w-4 text-orange-500" />
          )}
        </div>
      </div>
      {formattedPreview && validationState === 'valid' && (
        <p className="text-sm text-muted-foreground">
          Formato: {formattedPreview}
        </p>
      )}
      {validationState === 'invalid' && displayValue && (
        <p className="text-sm text-orange-500">
          Ingresa un numero colombiano valido (ej: 300 123 4567)
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
