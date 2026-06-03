'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Template, TemplateStatus, TemplateComponent } from '@/lib/whatsapp/types'
import { TemplateStatusBadge } from './template-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, Edit, Copy, AlertCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { deleteTemplate, editTemplate } from '@/app/actions/templates'
import { toast } from 'sonner'

const categoryLabels: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticacion',
}

/**
 * Statuses Meta permits editing for (D-05 table). PENDING / DISABLED are NOT editable —
 * the UI hides Edit and offers "Duplicar como nuevo" instead. This MUST match the action
 * (editTemplate) + the service guard (editTemplateMeta) — defense in depth, no unconstrained
 * edit promised to the operator.
 */
const EDITABLE_STATUSES = new Set<TemplateStatus>(['APPROVED', 'REJECTED', 'PAUSED'])

/** Read the BODY text out of a template's components (the only field this UI edits). */
function getBodyText(components: TemplateComponent[]): string {
  const body = components.find((c) => c.type === 'BODY')
  return body?.text ?? ''
}

interface TemplateListProps {
  templates: Template[]
}

export function TemplateList({ templates }: TemplateListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay templates creados. Crea uno para enviar mensajes fuera de la
          ventana de 24h.
        </CardContent>
      </Card>
    )
  }

  async function handleDelete(id: string) {
    try {
      const result = await deleteTemplate(id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Template eliminado')
      }
    } catch {
      toast.error('Error al eliminar template')
    }
  }

  function openEdit(template: Template) {
    setEditTarget(template)
    setEditBody(getBodyText(template.components))
  }

  async function handleEditSubmit() {
    if (!editTarget) return
    setEditSubmitting(true)
    try {
      // Only the BODY text is editable here. name/language are NEVER sent (D-05 immutable);
      // category is locked too (editing it triggers re-classification, D-05 A4). Rebuild the
      // components array preserving every non-BODY component verbatim.
      const components: TemplateComponent[] = editTarget.components.map((c) =>
        c.type === 'BODY' ? { ...c, text: editBody } : c
      )
      const result = await editTemplate({ id: editTarget.id, components })
      if ('error' in result) {
        // Surfaces the D-05 (or provider) violation cleanly — e.g. 360dialog "duplica y recrea",
        // or a status that is no longer editable on Meta's side.
        toast.error(result.error)
      } else {
        toast.success('Template enviado a revision de Meta (queda PENDING)')
        setEditTarget(null)
      }
    } catch {
      toast.error('Error al editar template')
    } finally {
      setEditSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base font-medium">
                  {template.name}
                </CardTitle>
                <TemplateStatusBadge status={template.status} />
                <span className="text-xs text-muted-foreground">
                  {categoryLabels[template.category]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setExpandedId(
                      expandedId === template.id ? null : template.id
                    )
                  }
                >
                  {expandedId === template.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                {EDITABLE_STATUSES.has(template.status) ? (
                  // D-05: edit is allowed only for APPROVED / REJECTED / PAUSED.
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Editar contenido"
                    onClick={() => openEdit(template)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                ) : (
                  // PENDING / DISABLED are NOT editable on Meta — offer duplicate-as-new instead.
                  <Link href="/configuracion/whatsapp/templates/nuevo">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Duplicar como nuevo (este estado no permite edicion)"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar template</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta accion no se puede deshacer. El template se
                        eliminara de 360dialog.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(template.id)}
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>

          {expandedId === template.id && (
            <CardContent className="pt-0 pb-4">
              {template.status === 'REJECTED' && template.rejected_reason && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg mb-3">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      Razon del rechazo:
                    </p>
                    <p className="text-sm text-red-700">
                      {template.rejected_reason}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {template.components.map((comp, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium text-muted-foreground">
                      {comp.type}:
                    </span>{' '}
                    <span>{comp.text || '(sin texto)'}</span>
                  </div>
                ))}
              </div>

              {Object.keys(template.variable_mapping).length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Variables mapeadas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(template.variable_mapping).map(
                      ([key, value]) => (
                        <span
                          key={key}
                          className="text-xs bg-muted px-2 py-1 rounded"
                        >
                          {`{{${key}}}`} → {value}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* D-05 edit dialog — name/language/category are LOCKED; only the BODY text is editable. */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar template</DialogTitle>
            <DialogDescription>
              Solo se puede editar el contenido del cuerpo. El nombre, el idioma y la
              categoria no se pueden cambiar (Meta no lo permite).
            </DialogDescription>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-4">
              {/* Locked identity fields — rendered as read-only, NEVER as editable inputs (D-05). */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre (bloqueado)</Label>
                  <p className="text-sm font-medium">{editTarget.name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Idioma (bloqueado)</Label>
                  <p className="text-sm font-medium">{editTarget.language}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Categoria (bloqueada)</Label>
                  <p className="text-sm font-medium">
                    {categoryLabels[editTarget.category] ?? editTarget.category}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Estado actual</Label>
                  <TemplateStatusBadge status={editTarget.status} />
                </div>
              </div>

              {/* APPROVED warning: rate-limited + re-review (D-05). */}
              {editTarget.status === 'APPROVED' && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    Solo se puede editar 1 vez cada 24h, 10 veces cada 30 dias. Editar reenvia el
                    template a revision de Meta (queda PENDING).
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="edit-body">Cuerpo del mensaje</Label>
                <Textarea
                  id="edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  maxLength={1024}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting || !editBody.trim()}>
              {editSubmitting ? 'Enviando...' : 'Guardar y reenviar a revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
