'use client'

import * as React from 'react'
import {
  CheckIcon,
  XIcon,
  ExternalLinkIcon,
  FileIcon,
  UserIcon,
} from 'lucide-react'
import type { CustomFieldDefinition } from '@/lib/types/database'

// ============================================================================
// FieldDisplay Component
// ============================================================================

interface FieldDisplayProps {
  definition: CustomFieldDefinition
  value: unknown
  /** Optional: Contact name for contact_relation type */
  relatedContactName?: string
}

/**
 * Read-only display component for custom field values.
 * Formats values based on field type for optimal display.
 */
export function FieldDisplay({
  definition,
  value,
  relatedContactName,
}: FieldDisplayProps) {
  const { field_type, options } = definition

  // Handle null/empty values
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>
  }

  // Format based on field type
  switch (field_type) {
    case 'text':
      return <span>{String(value)}</span>

    case 'number':
      return (
        <span>
          {new Intl.NumberFormat('es-CO').format(Number(value))}
        </span>
      )

    case 'currency':
      return (
        <span>
          {new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(Number(value))}
        </span>
      )

    case 'percentage':
      return (
        <span>
          {new Intl.NumberFormat('es-CO', {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(Number(value) / 100)}
        </span>
      )

    case 'date': {
      const date = new Date(String(value))
      if (isNaN(date.getTime())) {
        return <span className="text-muted-foreground">Fecha invalida</span>
      }
      return (
        <span>
          {date.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'America/Bogota',
          })}
        </span>
      )
    }

    case 'checkbox':
      return value ? (
        <span className="flex items-center gap-1 text-green-600">
          <CheckIcon className="h-4 w-4" />
          Si
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground">
          <XIcon className="h-4 w-4" />
          No
        </span>
      )

    case 'select':
      return <span>{String(value)}</span>

    case 'email':
      return (
        <a
          href={`mailto:${String(value)}`}
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          {String(value)}
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )

    case 'url':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1 max-w-xs truncate"
        >
          {String(value).replace(/^https?:\/\//, '')}
          <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
        </a>
      )

    case 'phone':
      return (
        <a
          href={`tel:${String(value)}`}
          className="text-primary hover:underline"
        >
          {formatPhoneForDisplay(String(value))}
        </a>
      )

    case 'file':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          <FileIcon className="h-4 w-4" />
          Ver archivo
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )

    case 'contact_relation':
      if (relatedContactName) {
        return (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            {relatedContactName}
          </span>
        )
      }
      // Show ID if name not available
      return (
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <UserIcon className="h-4 w-4" />
          {String(value).substring(0, 8)}...
        </span>
      )

    default:
      return <span>{String(value)}</span>
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format phone number for display (add spaces for readability)
 */
function formatPhoneForDisplay(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // Handle Colombian numbers (+57)
  if (digits.startsWith('57') && digits.length === 12) {
    // +57 300 123 4567
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }

  // Handle 10-digit local numbers
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }

  // Return as-is if format not recognized
  return phone
}

// ============================================================================
// FieldValue Component (combines label + value)
// ============================================================================

interface FieldValueProps extends FieldDisplayProps {
  showLabel?: boolean
}

/**
 * Complete field display with label
 */
export function FieldValue({
  definition,
  value,
  relatedContactName,
  showLabel = true,
}: FieldValueProps) {
  return (
    <div className="space-y-1">
      {showLabel && (
        <p className="text-sm text-muted-foreground">{definition.name}</p>
      )}
      <div className="text-base">
        <FieldDisplay
          definition={definition}
          value={value}
          relatedContactName={relatedContactName}
        />
      </div>
    </div>
  )
}
