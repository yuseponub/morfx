'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { parseContactsCsv, type ParseResult, type ParsedContact } from '@/lib/csv/parser'
import {
  bulkCreateContacts,
  getExistingPhones,
  getContactByPhone,
  updateContactByPhone,
  type BulkCreateContact
} from '@/app/actions/contacts'
import { getCustomFields } from '@/app/actions/custom-fields'
import { DuplicateResolver, type DuplicateEntry, type DuplicateResolution } from './duplicate-resolver'
import type { Contact, CustomFieldDefinition } from '@/lib/types/database'

// ============================================================================
// Types
// ============================================================================

type ImportStep = 'upload' | 'parsing' | 'duplicates' | 'importing' | 'results'

interface ImportResults {
  created: number
  updated: number
  skipped: number
  errors: number
}

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

// ============================================================================
// Component
// ============================================================================

export function CsvImportDialog({ open, onOpenChange, onImportComplete }: CsvImportDialogProps) {
  const router = useRouter()
  const v2 = useDashboardV2()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // State
  const [step, setStep] = React.useState<ImportStep>('upload')
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(null)
  const [duplicateEntries, setDuplicateEntries] = React.useState<DuplicateEntry[]>([])
  const [results, setResults] = React.useState<ImportResults | null>(null)

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep('upload')
      setParseResult(null)
      setDuplicateEntries([])
      setResults(null)
    }
  }, [open])

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      toast.error('Solo se permiten archivos CSV')
      return
    }

    setStep('parsing')

    try {
      // Get existing phones and custom fields for validation
      const [existingPhonesArray, customFields] = await Promise.all([
        getExistingPhones(),
        getCustomFields()
      ])
      const existingPhones = new Set(existingPhonesArray)
      const customFieldKeys = customFields.map(f => f.key)

      // Parse CSV
      const result = await parseContactsCsv(file, existingPhones, customFieldKeys)
      setParseResult(result)

      // If there are duplicates, fetch existing contact details and show resolver
      if (result.duplicates.length > 0) {
        const entries: DuplicateEntry[] = await Promise.all(
          result.duplicates.map(async (dup) => {
            const existingContact = await getContactByPhone(dup.existingPhone)
            return {
              row: dup.row,
              csvData: dup.data,
              existingContact: existingContact!
            }
          })
        )
        setDuplicateEntries(entries)
        setStep('duplicates')
      } else {
        // No duplicates, proceed to import
        await importContacts(result.valid, [], customFields)
      }
    } catch (error) {
      console.error('Error parsing CSV:', error)
      toast.error('Error al procesar el archivo CSV')
      setStep('upload')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle duplicate resolution
  const handleDuplicateResolve = async (resolutions: Map<number, DuplicateResolution>) => {
    if (!parseResult) return

    setStep('importing')

    const customFields = await getCustomFields()

    // Separate contacts based on resolution
    const toCreate: ParsedContact[] = [...parseResult.valid]
    const toUpdate: { phone: string; data: ParsedContact }[] = []
    let skipped = 0

    for (const dup of parseResult.duplicates) {
      const resolution = resolutions.get(dup.row) || 'skip'

      if (resolution === 'skip') {
        skipped++
      } else if (resolution === 'update') {
        toUpdate.push({ phone: dup.existingPhone, data: dup.data })
      } else if (resolution === 'create_new') {
        // Can't create new with same phone, skip
        skipped++
      }
    }

    await importContacts(toCreate, toUpdate, customFields, skipped)
  }

  // Import contacts
  const importContacts = async (
    toCreate: ParsedContact[],
    toUpdate: { phone: string; data: ParsedContact }[],
    customFields: CustomFieldDefinition[],
    initialSkipped: number = 0
  ) => {
    setStep('importing')

    const importResults: ImportResults = {
      created: 0,
      updated: 0,
      skipped: initialSkipped + (parseResult?.invalid.length || 0),
      errors: 0
    }

    // Create new contacts
    if (toCreate.length > 0) {
      const contactsToInsert: BulkCreateContact[] = toCreate.map(c => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        city: c.city,
        address: c.address,
        custom_fields: c.custom_fields
      }))

      const createResult = await bulkCreateContacts(contactsToInsert)
      if ('success' in createResult && createResult.success) {
        importResults.created = createResult.data.created
        importResults.errors += createResult.data.errors.length
      } else if ('error' in createResult) {
        toast.error(createResult.error)
        importResults.errors += toCreate.length
      }
    }

    // Update existing contacts
    for (const { phone, data } of toUpdate) {
      const updateResult = await updateContactByPhone(phone, {
        name: data.name,
        email: data.email,
        city: data.city,
        address: data.address,
        custom_fields: data.custom_fields
      })

      if ('success' in updateResult && updateResult.success) {
        importResults.updated++
      } else {
        importResults.errors++
      }
    }

    setResults(importResults)
    setStep('results')
  }

  // Close and refresh
  const handleClose = () => {
    if (results && (results.created > 0 || results.updated > 0)) {
      onImportComplete()
      router.refresh()
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-lg',
          v2 && 'theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]'
        )}
      >
        <DialogHeader>
          <DialogTitle
            className={v2 ? 'text-[20px] font-bold tracking-[-0.01em] text-[var(--ink-1)]' : ''}
            style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
          >
            Importar contactos desde CSV
          </DialogTitle>
          <DialogDescription className={v2 ? 'mx-smallcaps text-[var(--ink-3)] mt-1' : undefined}>
            {step === 'upload' && 'Selecciona un archivo CSV con tus contactos'}
            {step === 'parsing' && 'Procesando archivo...'}
            {step === 'duplicates' && 'Resolver contactos duplicados'}
            {step === 'importing' && 'Importando contactos...'}
            {step === 'results' && 'Importacion completada'}
          </DialogDescription>
        </DialogHeader>

        {/* Upload Step */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                v2
                  ? 'border-[var(--ink-3)] bg-[var(--paper-1)] hover:border-[var(--ink-1)]'
                  : 'hover:border-primary/50'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className={cn('h-12 w-12 mx-auto mb-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')} />
              <p className={cn('text-sm mb-2', v2 ? 'text-[var(--ink-2)]' : 'text-muted-foreground')}>
                Arrastra un archivo CSV o haz clic para seleccionar
              </p>
              <Button
                variant="outline"
                size="sm"
                className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
              >
                <Upload className="h-4 w-4 mr-2" />
                Seleccionar archivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className={cn('text-xs space-y-1', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}>
              <p><strong>Columnas requeridas:</strong> Nombre, Telefono</p>
              <p><strong>Columnas opcionales:</strong> Email, Ciudad, Direccion</p>
              <p>Los nombres de columnas se detectan automaticamente (ej: nombre, name, telefono, phone)</p>
            </div>
          </div>
        )}

        {/* Parsing Step */}
        {step === 'parsing' && (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Procesando archivo CSV...</p>
          </div>
        )}

        {/* Duplicates Step */}
        {step === 'duplicates' && duplicateEntries.length > 0 && (
          <DuplicateResolver
            duplicates={duplicateEntries}
            invalidCount={parseResult?.invalid.length || 0}
            validCount={parseResult?.valid.length || 0}
            onResolve={handleDuplicateResolve}
            onCancel={() => onOpenChange(false)}
          />
        )}

        {/* Importing Step */}
        {step === 'importing' && (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando contactos...</p>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && results && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">{results.created}</p>
                  <p className="text-xs text-muted-foreground">Creados</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10">
                <CheckCircle2 className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">{results.updated}</p>
                  <p className="text-xs text-muted-foreground">Actualizados</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium">{results.skipped}</p>
                  <p className="text-xs text-muted-foreground">Omitidos</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium">{results.errors}</p>
                  <p className="text-xs text-muted-foreground">Errores</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleClose}
                className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
                style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
