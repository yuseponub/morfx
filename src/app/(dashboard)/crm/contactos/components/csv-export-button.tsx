'use client'

import * as React from 'react'
import { Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  exportContactsToCsv,
  downloadCsv,
  generateExportFilename
} from '@/lib/csv/exporter'
import type { Contact } from '@/lib/types/database'
import type { CustomFieldDefinition } from '@/lib/custom-fields/types'

// ============================================================================
// Types
// ============================================================================

interface CsvExportButtonProps {
  /** All contacts in the workspace */
  allContacts: Contact[]
  /** Filtered contacts (when filters are active) */
  filteredContacts: Contact[]
  /** Custom field definitions for the workspace */
  customFields: CustomFieldDefinition[]
  /** Whether filters are currently active */
  hasFilters: boolean
}

// Standard fields available for export
const STANDARD_FIELDS = [
  { key: 'name', label: 'Nombre' },
  { key: 'phone', label: 'Telefono' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'Ciudad' },
  { key: 'address', label: 'Direccion' },
  { key: 'created_at', label: 'Fecha de creacion' },
] as const

// ============================================================================
// Component
// ============================================================================

export function CsvExportButton({
  allContacts,
  filteredContacts,
  customFields,
  hasFilters
}: CsvExportButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [exportFiltered, setExportFiltered] = React.useState(hasFilters)
  const [selectedStandardFields, setSelectedStandardFields] = React.useState<string[]>(
    STANDARD_FIELDS.map(f => f.key)
  )
  const [selectedCustomFields, setSelectedCustomFields] = React.useState<string[]>(
    customFields.map(f => f.id)
  )

  // Update exportFiltered when hasFilters changes
  React.useEffect(() => {
    setExportFiltered(hasFilters)
  }, [hasFilters])

  // Toggle a standard field
  const toggleStandardField = (key: string) => {
    setSelectedStandardFields(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  // Toggle a custom field
  const toggleCustomField = (id: string) => {
    setSelectedCustomFields(prev =>
      prev.includes(id)
        ? prev.filter(k => k !== id)
        : [...prev, id]
    )
  }

  // Select/deselect all standard fields
  const toggleAllStandard = () => {
    if (selectedStandardFields.length === STANDARD_FIELDS.length) {
      setSelectedStandardFields([])
    } else {
      setSelectedStandardFields(STANDARD_FIELDS.map(f => f.key))
    }
  }

  // Select/deselect all custom fields
  const toggleAllCustom = () => {
    if (selectedCustomFields.length === customFields.length) {
      setSelectedCustomFields([])
    } else {
      setSelectedCustomFields(customFields.map(f => f.id))
    }
  }

  // Handle export
  const handleExport = () => {
    const contacts = exportFiltered ? filteredContacts : allContacts

    if (contacts.length === 0) {
      toast.error('No hay contactos para exportar')
      return
    }

    if (selectedStandardFields.length === 0 && selectedCustomFields.length === 0) {
      toast.error('Selecciona al menos una columna')
      return
    }

    // Filter custom fields by selected IDs
    const customFieldsToExport = customFields.filter(f =>
      selectedCustomFields.includes(f.id)
    )

    // Generate CSV
    const csv = exportContactsToCsv({
      contacts,
      standardFields: selectedStandardFields,
      customFields: customFieldsToExport
    })

    // Download
    const filename = generateExportFilename()
    downloadCsv(csv, filename)

    toast.success(`${contacts.length} contactos exportados`)
    setOpen(false)
  }

  const contactsToExport = exportFiltered ? filteredContacts : allContacts

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Contactos a exportar</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={!exportFiltered}
                  onChange={() => setExportFiltered(false)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Todos ({allContacts.length})
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportFiltered}
                  onChange={() => setExportFiltered(true)}
                  disabled={!hasFilters}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Filtrados ({filteredContacts.length})
                  {!hasFilters && <span className="text-muted-foreground"> - sin filtros</span>}
                </span>
              </label>
            </div>
          </div>

          <Separator />

          {/* Standard fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Campos estandar</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={toggleAllStandard}
              >
                {selectedStandardFields.length === STANDARD_FIELDS.length ? 'Ninguno' : 'Todos'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STANDARD_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedStandardFields.includes(field.key)}
                    onCheckedChange={() => toggleStandardField(field.key)}
                  />
                  <span className="text-sm">{field.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Campos personalizados</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={toggleAllCustom}
                  >
                    {selectedCustomFields.length === customFields.length ? 'Ninguno' : 'Todos'}
                  </Button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {customFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCustomFields.includes(field.id)}
                        onCheckedChange={() => toggleCustomField(field.id)}
                      />
                      <span className="text-sm truncate">{field.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <Button
            className="w-full"
            onClick={handleExport}
            disabled={contactsToExport.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar {contactsToExport.length} contactos
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
