'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { TemplatePreview } from './template-preview'
import { getApprovedTemplates } from '@/app/actions/templates'
import { sendTemplateMessage } from '@/app/actions/messages'
import { Template } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2, FileText, ChevronRight, ArrowLeft } from 'lucide-react'

interface Contact {
  id: string
  name: string
  phone: string
  email?: string | null
  city?: string | null
}

interface Order {
  id: string
  total: number
  tracking_number?: string | null
  carrier?: string | null
}

interface TemplateSendModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  contact: Contact | null
  recentOrder?: Order | null
}

/**
 * Map field paths to actual values from contact/order.
 */
function resolveFieldValue(
  path: string,
  contact: Contact | null,
  order: Order | null
): string {
  const [entity, field] = path.split('.')

  if (entity === 'contact' && contact) {
    switch (field) {
      case 'name': return contact.name || ''
      case 'phone': return contact.phone || ''
      case 'email': return contact.email || ''
      case 'city': return contact.city || ''
      default: return ''
    }
  }

  if (entity === 'order' && order) {
    switch (field) {
      case 'id': return order.id || ''
      case 'total': return order.total?.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }) || ''
      case 'tracking_number': return order.tracking_number || ''
      case 'carrier': return order.carrier || ''
      default: return ''
    }
  }

  // Return path as-is if it's a custom value or doesn't match
  return ''
}

/**
 * Modal for selecting and sending WhatsApp templates.
 * Two-step flow: select template -> preview with variable editing -> send.
 */
export function TemplateSendModal({
  open,
  onOpenChange,
  conversationId,
  contact,
  recentOrder
}: TemplateSendModalProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})

  const selectedTemplate = templates.find(t => t.id === selectedId)

  // Reset state and load templates when modal opens
  useEffect(() => {
    if (open) {
      setStep('select')
      setSelectedId(null)
      setVariableValues({})
      loadTemplates()
    }
  }, [open])

  async function loadTemplates() {
    setLoading(true)
    try {
      const data = await getApprovedTemplates()
      setTemplates(data)
    } catch {
      toast.error('Error al cargar templates')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectTemplate(templateId: string) {
    setSelectedId(templateId)
    const template = templates.find(t => t.id === templateId)

    if (template) {
      // Pre-fill variables from mapping
      const values: Record<string, string> = {}
      Object.entries(template.variable_mapping || {}).forEach(([num, path]) => {
        values[num] = resolveFieldValue(path, contact, recentOrder || null)
      })
      setVariableValues(values)
    }
  }

  function handleContinue() {
    if (selectedTemplate) {
      setStep('preview')
    }
  }

  async function handleSend() {
    if (!selectedTemplate) return

    setSending(true)
    try {
      const result = await sendTemplateMessage({
        conversationId,
        templateId: selectedTemplate.id,
        variableValues
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Template enviado')
        onOpenChange(false)
      }
    } catch {
      toast.error('Error al enviar template')
    } finally {
      setSending(false)
    }
  }

  // Extract variables from template
  const getVariables = (template: Template) => {
    const bodyText = template.components.find(c => c.type === 'BODY')?.text || ''
    const headerText = template.components.find(c => c.type === 'HEADER')?.text || ''
    const allText = bodyText + headerText
    const matches = allText.match(/\{\{(\d+)\}\}/g) || []
    return [...new Set(matches)].map(m => m.replace(/[{}]/g, ''))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' ? 'Enviar Template' : 'Vista Previa'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? 'Selecciona un template aprobado para enviar'
              : 'Verifica el mensaje antes de enviar'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <>
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">Cargando templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-2 font-medium">No hay templates aprobados</p>
                <p className="text-sm text-muted-foreground">
                  Crea un template en Configuracion y espera la aprobacion de Meta
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] -mx-6 px-6">
                <RadioGroup value={selectedId || ''} onValueChange={handleSelectTemplate}>
                  <div className="space-y-2">
                    {templates.map((template) => {
                      const bodyPreview = template.components.find(c => c.type === 'BODY')?.text
                      return (
                        <div
                          key={template.id}
                          className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedId === template.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => handleSelectTemplate(template.id)}
                        >
                          <RadioGroupItem value={template.id} id={template.id} />
                          <div className="ml-3 flex-1 min-w-0">
                            <Label htmlFor={template.id} className="cursor-pointer font-medium block">
                              {template.name}
                            </Label>
                            {bodyPreview && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {bodyPreview.length > 60 ? bodyPreview.slice(0, 60) + '...' : bodyPreview}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </RadioGroup>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleContinue} disabled={!selectedId}>
                Continuar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && selectedTemplate && (
          <>
            <div className="space-y-4">
              {/* Variable inputs */}
              {getVariables(selectedTemplate).length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Variables</p>
                  {getVariables(selectedTemplate).map((num) => {
                    const mapping = selectedTemplate.variable_mapping?.[num]
                    return (
                      <div key={num} className="flex items-center gap-3">
                        <span className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[50px] text-center">
                          {`{{${num}}}`}
                        </span>
                        <Input
                          value={variableValues[num] || ''}
                          onChange={(e) => setVariableValues({
                            ...variableValues,
                            [num]: e.target.value
                          })}
                          placeholder={mapping || 'Valor...'}
                          className="flex-1"
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Preview */}
              <div>
                <p className="text-sm font-medium mb-2">Vista previa</p>
                <div className="bg-muted/30 rounded-lg p-4">
                  <TemplatePreview
                    template={selectedTemplate}
                    variableValues={variableValues}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atras
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar Template
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
