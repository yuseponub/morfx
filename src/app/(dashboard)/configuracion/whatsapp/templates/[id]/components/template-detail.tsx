'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Template } from '@/lib/whatsapp/types'
import { TemplateStatusBadge } from '../../components/template-status-badge'
import { VariableMapper } from '../../components/variable-mapper'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateTemplateMapping } from '@/app/actions/templates'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, AlertCircle } from 'lucide-react'

const categoryLabels: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticacion',
}

interface TemplateDetailProps {
  template: Template
}

export function TemplateDetail({ template }: TemplateDetailProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(
    template.variable_mapping || {}
  )
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const bodyText =
    template.components.find((c) => c.type === 'BODY')?.text || ''
  const headerText =
    template.components.find((c) => c.type === 'HEADER')?.text || ''
  const footerText =
    template.components.find((c) => c.type === 'FOOTER')?.text || ''

  const handleMappingChange = (newMapping: Record<string, string>) => {
    setMapping(newMapping)
    setHasChanges(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updateTemplateMapping(template.id, mapping)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Mapeo de variables guardado')
        setHasChanges(false)
      }
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/configuracion/whatsapp/templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{template.name}</h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-muted-foreground">
            {categoryLabels[template.category]} ·{' '}
            {template.language === 'es' ? 'Espanol' : 'English'}
          </p>
        </div>
      </div>

      {template.rejected_reason && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Template rechazado por Meta</p>
                <p className="mt-1">{template.rejected_reason}</p>
                <p className="mt-2 text-xs">
                  Debes crear un nuevo template con contenido diferente. Los
                  templates rechazados no pueden ser editados.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contenido del Template</CardTitle>
          <CardDescription>
            El contenido no puede ser editado despues de enviar a Meta. Solo
            puedes modificar el mapeo de variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {headerText && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Encabezado
              </p>
              <p className="mt-1">{headerText}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-muted-foreground">Cuerpo</p>
            <p className="mt-1 whitespace-pre-wrap">{bodyText}</p>
          </div>

          {footerText && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Pie de pagina
              </p>
              <p className="mt-1">{footerText}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(bodyText.includes('{{') || headerText.includes('{{')) && (
        <Card>
          <CardHeader>
            <CardTitle>Mapeo de Variables</CardTitle>
            <CardDescription>
              Puedes cambiar a que campos se conectan las variables en cualquier
              momento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <VariableMapper
              templateBody={bodyText + headerText}
              mapping={mapping}
              onChange={handleMappingChange}
            />

            {hasChanges && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar Mapeo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Informacion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="text-muted-foreground">Creado</p>
              <p>
                {new Date(template.created_at).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                })}
              </p>
            </div>
            {template.submitted_at && (
              <div>
                <p className="text-muted-foreground">Enviado a Meta</p>
                <p>
                  {new Date(template.submitted_at).toLocaleString('es-CO', {
                    timeZone: 'America/Bogota',
                  })}
                </p>
              </div>
            )}
            {template.approved_at && (
              <div>
                <p className="text-muted-foreground">Aprobado</p>
                <p>
                  {new Date(template.approved_at).toLocaleString('es-CO', {
                    timeZone: 'America/Bogota',
                  })}
                </p>
              </div>
            )}
            {template.quality_rating && (
              <div>
                <p className="text-muted-foreground">Calidad</p>
                <p>{template.quality_rating}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
