'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Template } from '@/lib/whatsapp/types'
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
import { Trash2, Edit, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { deleteTemplate } from '@/app/actions/templates'
import { toast } from 'sonner'

const categoryLabels: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticacion',
}

interface TemplateListProps {
  templates: Template[]
}

export function TemplateList({ templates }: TemplateListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
                <Link href={`/configuracion/whatsapp/templates/${template.id}`}>
                  <Button variant="ghost" size="icon">
                    <Edit className="h-4 w-4" />
                  </Button>
                </Link>
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
              {template.rejected_reason && (
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
    </div>
  )
}
