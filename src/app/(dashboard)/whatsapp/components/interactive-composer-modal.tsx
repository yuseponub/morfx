'use client'

// ============================================================================
// Phase 999.1 — Plan 04 Task 2
// Builder Dialog del mensaje interactivo: toggle botones|lista + form con
// validacion inline (D-05a, set COMPLETO de limites Meta) + preview en vivo via
// InteractiveBubble (D-05b) + envio via server action sendInteractiveMessage.
//
// D-05/id: los ids de botones/filas son AUTO-generados y unicos, NUNCA escritos
// por el operador (btn_${i} / row_${si}_${ri}), regenerados al agregar/quitar.
//
// Regla 3: el cliente NO conoce el provider; la lista no soportada en 360dialog
// se maneja con attempt-and-error → toast amistoso (UI-SPEC Area 4).
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2, Plus, X, List } from 'lucide-react'
import {
  validateButtons,
  validateList,
  INTERACTIVE_LIMITS,
} from '@/lib/whatsapp/interactive-limits'
import { InteractiveBubble, type InteractiveContent } from './interactive-bubble'
import { sendInteractiveMessage } from '@/app/actions/messages'

interface ButtonField {
  id: string
  title: string
}

interface RowField {
  id: string
  title: string
  description?: string
}

interface SectionField {
  title: string
  rows: RowField[]
}

interface InteractiveComposerModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  conversationId: string
  contactPhone: string
  onSend?: () => void
}

/** Regenera ids estables y unicos para los botones segun su posicion (D-05/id). */
function reindexButtons(buttons: ButtonField[]): ButtonField[] {
  return buttons.map((b, i) => ({ ...b, id: `btn_${i}` }))
}

/** Regenera ids estables y unicos para las filas de cada seccion (D-05/id). */
function reindexSections(sections: SectionField[]): SectionField[] {
  return sections.map((s, si) => ({
    ...s,
    rows: s.rows.map((r, ri) => ({ ...r, id: `row_${si}_${ri}` })),
  }))
}

export function InteractiveComposerModal({
  open,
  onOpenChange,
  conversationId,
  contactPhone: _contactPhone,
  onSend,
}: InteractiveComposerModalProps) {
  const [interactiveType, setInteractiveType] = useState<'buttons' | 'list'>('buttons')
  const [header, setHeader] = useState('')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState('')
  const [buttons, setButtons] = useState<ButtonField[]>([{ id: 'btn_0', title: '' }])
  const [buttonLabel, setButtonLabel] = useState('')
  const [sections, setSections] = useState<SectionField[]>([
    { title: '', rows: [{ id: 'row_0_0', title: '' }] },
  ])
  const [sending, setSending] = useState(false)

  // Reset-on-open (mirror template-send-modal L102-109)
  useEffect(() => {
    if (open) {
      setInteractiveType('buttons')
      setHeader('')
      setBody('')
      setFooter('')
      setButtons([{ id: 'btn_0', title: '' }])
      setButtonLabel('')
      setSections([{ title: '', rows: [{ id: 'row_0_0', title: '' }] }])
      setSending(false)
    }
  }, [open])

  // ---- Botones: add / remove / edit ----
  function addButton() {
    if (buttons.length >= INTERACTIVE_LIMITS.maxButtons) return
    setButtons(reindexButtons([...buttons, { id: '', title: '' }]))
  }
  function removeButton(index: number) {
    if (buttons.length <= 1) return
    setButtons(reindexButtons(buttons.filter((_, i) => i !== index)))
  }
  function setButtonTitle(index: number, title: string) {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, title } : b)))
  }

  // ---- Lista: secciones / filas ----
  function addSection() {
    if (sections.length >= INTERACTIVE_LIMITS.maxSections) return
    setSections(reindexSections([...sections, { title: '', rows: [{ id: '', title: '' }] }]))
  }
  function addRow(sectionIndex: number) {
    setSections(
      reindexSections(
        sections.map((s, si) =>
          si === sectionIndex ? { ...s, rows: [...s.rows, { id: '', title: '' }] } : s
        )
      )
    )
  }
  function removeRow(sectionIndex: number, rowIndex: number) {
    const totalRows = sections.reduce((n, s) => n + s.rows.length, 0)
    if (totalRows <= 1) return
    setSections(
      reindexSections(
        sections
          .map((s, si) =>
            si === sectionIndex ? { ...s, rows: s.rows.filter((_, ri) => ri !== rowIndex) } : s
          )
          .filter((s) => s.rows.length > 0)
      )
    )
  }
  function setSectionTitle(sectionIndex: number, title: string) {
    setSections(sections.map((s, si) => (si === sectionIndex ? { ...s, title } : s)))
  }
  function setRowTitle(sectionIndex: number, rowIndex: number, title: string) {
    setSections(
      sections.map((s, si) =>
        si === sectionIndex
          ? { ...s, rows: s.rows.map((r, ri) => (ri === rowIndex ? { ...r, title } : r)) }
          : s
      )
    )
  }
  function setRowDescription(sectionIndex: number, rowIndex: number, description: string) {
    setSections(
      sections.map((s, si) =>
        si === sectionIndex
          ? { ...s, rows: s.rows.map((r, ri) => (ri === rowIndex ? { ...r, description } : r)) }
          : s
      )
    )
  }

  // ---- Validacion (cada render) ----
  const errors =
    interactiveType === 'buttons'
      ? validateButtons({ body, header, footer, buttons })
      : validateList({ body, header, footer, buttonLabel, sections })
  const hasErrors = errors.length > 0

  // ---- Preview en vivo (D-05b) ----
  const previewContent: InteractiveContent =
    interactiveType === 'buttons'
      ? {
          interactiveType: 'buttons',
          body,
          header: header || undefined,
          footer: footer || undefined,
          buttons,
        }
      : {
          interactiveType: 'list',
          body,
          header: header || undefined,
          footer: footer || undefined,
          buttonLabel,
          sections,
        }

  // ---- Envio (mirror template-send-modal L143-165) ----
  async function handleSend() {
    setSending(true)
    try {
      const payload =
        interactiveType === 'buttons'
          ? {
              interactiveType: 'buttons' as const,
              body,
              header: header || undefined,
              footer: footer || undefined,
              buttons,
            }
          : {
              interactiveType: 'list' as const,
              body,
              header: header || undefined,
              footer: footer || undefined,
              buttonLabel,
              sections,
            }
      const result = await sendInteractiveMessage(conversationId, payload)
      if ('error' in result) {
        // El error de lista 360dialog se muestra como toast amistoso (UI-SPEC Area 4)
        toast.error(
          result.error === 'lista no soportada en 360dialog (legacy)'
            ? 'Las listas no están disponibles en esta conexión de WhatsApp. Usa botones.'
            : result.error ?? 'Error al enviar mensaje interactivo'
        )
      } else {
        toast.success('Mensaje interactivo enviado')
        onOpenChange(false)
        onSend?.()
      }
    } catch {
      toast.error('Error al enviar mensaje interactivo')
    } finally {
      setSending(false)
    }
  }

  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mensaje interactivo</DialogTitle>
          <DialogDescription>
            Arma botones o una lista y envíalos a esta conversación.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] -mx-6 px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* ---- Columna formulario ---- */}
            <div className="space-y-4">
              <Tabs
                value={interactiveType}
                onValueChange={(v) => setInteractiveType(v as 'buttons' | 'list')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="buttons">Botones</TabsTrigger>
                  <TabsTrigger value="list">Lista</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Campos compartidos */}
              <Field
                label="Encabezado (opcional)"
                value={header}
                limit={INTERACTIVE_LIMITS.header}
              >
                <Input value={header} onChange={(e) => setHeader(e.target.value)} />
              </Field>

              <Field label="Cuerpo del mensaje" value={body} limit={INTERACTIVE_LIMITS.body}>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
              </Field>

              <Field
                label="Pie de página (opcional)"
                value={footer}
                limit={INTERACTIVE_LIMITS.footer}
              >
                <Input value={footer} onChange={(e) => setFooter(e.target.value)} />
              </Field>

              {/* ---- Botones ---- */}
              {interactiveType === 'buttons' && (
                <div className="space-y-3">
                  {buttons.map((b, i) => (
                    <Field key={b.id} label={`Botón ${i + 1}`} value={b.title} limit={20}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={b.title}
                          onChange={(e) => setButtonTitle(i, e.target.value)}
                          className="flex-1"
                        />
                        {buttons.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 flex-shrink-0"
                            onClick={() => removeButton(i)}
                            title="Quitar botón"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Field>
                  ))}
                  {buttons.length < INTERACTIVE_LIMITS.maxButtons && (
                    <Button type="button" variant="outline" size="sm" onClick={addButton}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar botón
                    </Button>
                  )}
                </div>
              )}

              {/* ---- Lista ---- */}
              {interactiveType === 'list' && (
                <div className="space-y-4">
                  <Field
                    label="Texto del botón de lista"
                    value={buttonLabel}
                    limit={INTERACTIVE_LIMITS.listButtonLabel}
                  >
                    <Input
                      value={buttonLabel}
                      onChange={(e) => setButtonLabel(e.target.value)}
                    />
                  </Field>

                  {sections.map((s, si) => (
                    <div key={si} className="rounded-md border border-border p-3 space-y-3">
                      <Field
                        label={`Sección ${si + 1} título (opcional)`}
                        value={s.title}
                        limit={INTERACTIVE_LIMITS.sectionTitle}
                      >
                        <Input
                          value={s.title}
                          onChange={(e) => setSectionTitle(si, e.target.value)}
                        />
                      </Field>

                      {s.rows.map((r, ri) => (
                        <div key={r.id} className="space-y-2 border-l-2 border-border pl-3">
                          <Field label={`Fila ${ri + 1}`} value={r.title} limit={INTERACTIVE_LIMITS.rowTitle}>
                            <div className="flex items-center gap-2">
                              <Input
                                value={r.title}
                                onChange={(e) => setRowTitle(si, ri, e.target.value)}
                                className="flex-1"
                              />
                              {totalRows > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 flex-shrink-0"
                                  onClick={() => removeRow(si, ri)}
                                  title="Quitar fila"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </Field>
                          <Field
                            label="Descripción (opcional)"
                            value={r.description ?? ''}
                            limit={INTERACTIVE_LIMITS.rowDescription}
                          >
                            <Input
                              value={r.description ?? ''}
                              onChange={(e) => setRowDescription(si, ri, e.target.value)}
                            />
                          </Field>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addRow(si)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar fila
                      </Button>
                    </div>
                  ))}

                  {sections.length < INTERACTIVE_LIMITS.maxSections && (
                    <Button type="button" variant="outline" size="sm" onClick={addSection}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar sección
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ---- Columna preview ---- */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold">Vista previa</p>
              <div className="rounded-lg bg-muted/30 p-4">
                <InteractiveBubble content={previewContent} />
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Errores agregados arriba del footer */}
        {hasErrors && (
          <ul className="space-y-0.5">
            {errors.map((err, i) => (
              <li key={i} className="text-[11px] text-destructive">
                {err.message}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] rounded-[4px]"
            disabled={sending || hasErrors}
            onClick={handleSend}
          >
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {sending ? 'Enviando…' : 'Enviar mensaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Campo con label + contador en vivo (texto-destructive cuando excede el limite). */
function Field({
  label,
  value,
  limit,
  children,
}: {
  label: string
  value: string
  limit: number
  children: React.ReactNode
}) {
  const over = value.length > limit
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[13px] font-semibold">{label}</Label>
        <span className={`text-[11px] ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
          {value.length}/{limit}
        </span>
      </div>
      {children}
      {over && <p className="text-[11px] text-destructive">Máx {limit} caracteres</p>}
    </div>
  )
}
