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
import { startNewConversation } from '@/app/actions/conversations'
import { searchContacts } from '@/app/actions/contacts'
import { Template } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2, FileText, ChevronRight, ArrowLeft, Search, User, Phone } from 'lucide-react'

interface Contact {
  id: string
  name: string
  phone: string
}

interface NewConversationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConversationCreated: (conversationId: string) => void
}

type Step = 'contact' | 'template' | 'preview'

/**
 * Modal for starting a new WhatsApp conversation.
 * Three-step flow: select contact/phone -> select template -> preview & send.
 */
export function NewConversationModal({
  open,
  onOpenChange,
  onConversationCreated
}: NewConversationModalProps) {
  const [step, setStep] = useState<Step>('contact')

  // Contact step
  const [phone, setPhone] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)

  // Template step
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // Preview step
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const effectivePhone = selectedContact?.phone || phone

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('contact')
      setPhone('')
      setContactSearch('')
      setSelectedContact(null)
      setSelectedTemplateId(null)
      setVariableValues({})
    }
  }, [open])

  // Search contacts
  useEffect(() => {
    if (!contactSearch.trim()) {
      setContacts([])
      return
    }

    const timer = setTimeout(async () => {
      setLoadingContacts(true)
      try {
        const data = await searchContacts({ search: contactSearch, limit: 10 })
        setContacts(data)
      } catch {
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [contactSearch])

  // Load templates when moving to template step
  async function loadTemplates() {
    setLoadingTemplates(true)
    try {
      const data = await getApprovedTemplates()
      setTemplates(data)
    } catch {
      toast.error('Error al cargar templates')
    } finally {
      setLoadingTemplates(false)
    }
  }

  function handleSelectContact(contact: Contact) {
    setSelectedContact(contact)
    setPhone(contact.phone)
  }

  function handleContinueToTemplate() {
    if (!effectivePhone.trim()) {
      toast.error('Ingresa un numero de telefono')
      return
    }
    loadTemplates()
    setStep('template')
  }

  function handleSelectTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const template = templates.find(t => t.id === templateId)

    if (template) {
      // Pre-fill variables from mapping
      const values: Record<string, string> = {}
      Object.entries(template.variable_mapping || {}).forEach(([num, path]) => {
        if (selectedContact && path === 'contact.name') {
          values[num] = selectedContact.name
        } else if (selectedContact && path === 'contact.phone') {
          values[num] = selectedContact.phone
        }
      })
      setVariableValues(values)
    }
  }

  function handleContinueToPreview() {
    if (selectedTemplate) {
      setStep('preview')
    }
  }

  async function handleSend() {
    if (!selectedTemplate || !effectivePhone) return

    setSending(true)
    try {
      const result = await startNewConversation({
        phone: effectivePhone,
        templateId: selectedTemplate.id,
        variableValues
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Mensaje enviado')
        onOpenChange(false)
        onConversationCreated(result.data!.conversationId)
      }
    } catch {
      toast.error('Error al enviar mensaje')
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
            {step === 'contact' && 'Nueva Conversacion'}
            {step === 'template' && 'Seleccionar Template'}
            {step === 'preview' && 'Vista Previa'}
          </DialogTitle>
          <DialogDescription>
            {step === 'contact' && 'Ingresa el numero o busca un contacto'}
            {step === 'template' && 'Selecciona un template aprobado'}
            {step === 'preview' && 'Verifica el mensaje antes de enviar'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Contact/Phone */}
        {step === 'contact' && (
          <>
            <div className="space-y-4">
              {/* Phone input */}
              <div className="space-y-2">
                <Label htmlFor="phone">Numero de telefono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setSelectedContact(null)
                    }}
                    placeholder="+57 300 123 4567"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Incluye el codigo de pais (ej: +57 para Colombia)
                </p>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    o busca un contacto
                  </span>
                </div>
              </div>

              {/* Contact search */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Buscar por nombre o telefono..."
                    className="pl-10"
                  />
                </div>

                {/* Contact results */}
                {(contacts.length > 0 || loadingContacts) && (
                  <div className="border rounded-lg max-h-40 overflow-auto">
                    {loadingContacts ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">
                        Buscando...
                      </div>
                    ) : (
                      contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 ${
                            selectedContact?.id === contact.id ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => handleSelectContact(contact)}
                        >
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{contact.phone}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Selected contact indicator */}
                {selectedContact && (
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{selectedContact.name}</span>
                    <span className="text-xs text-muted-foreground">({selectedContact.phone})</span>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleContinueToTemplate} disabled={!effectivePhone.trim()}>
                Continuar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Template Selection */}
        {step === 'template' && (
          <>
            {loadingTemplates ? (
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
                <RadioGroup value={selectedTemplateId || ''} onValueChange={handleSelectTemplate}>
                  <div className="space-y-2">
                    {templates.map((template) => {
                      const bodyPreview = template.components.find(c => c.type === 'BODY')?.text
                      return (
                        <div
                          key={template.id}
                          className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedTemplateId === template.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
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
              <Button variant="outline" onClick={() => setStep('contact')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atras
              </Button>
              <Button onClick={handleContinueToPreview} disabled={!selectedTemplateId}>
                Continuar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Preview & Send */}
        {step === 'preview' && selectedTemplate && (
          <>
            <div className="space-y-4">
              {/* Recipient info */}
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                <Phone className="h-4 w-4" />
                <span className="text-sm">Enviando a: <strong>{effectivePhone}</strong></span>
              </div>

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
              <Button variant="outline" onClick={() => setStep('template')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atras
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar Mensaje
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
