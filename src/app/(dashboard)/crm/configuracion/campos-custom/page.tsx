import Link from 'next/link'
import { ArrowLeftIcon, GripVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { getCustomFields } from '@/app/actions/custom-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FIELD_TYPE_LABELS } from '@/lib/custom-fields/validator'
import { FieldBuilder } from './components/field-builder'
import { DeleteFieldButton } from './components/delete-field-button'

export default async function CustomFieldsSettingsPage() {
  const fields = await getCustomFields()

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/crm/contactos">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver a contactos
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campos personalizados</h1>
          <p className="text-muted-foreground">
            Define campos adicionales para tus contactos
          </p>
        </div>
        <FieldBuilder />
      </div>

      {/* Fields list */}
      {fields.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-4">
              No hay campos personalizados definidos
            </p>
            <FieldBuilder
              trigger={
                <Button variant="outline">
                  Crear primer campo
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  {/* Drag handle (visual only for now) */}
                  <div className="text-muted-foreground cursor-grab">
                    <GripVerticalIcon className="h-5 w-5" />
                  </div>

                  {/* Field info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {FIELD_TYPE_LABELS[field.field_type]}
                      </Badge>
                      {field.is_required && (
                        <Badge variant="destructive" className="text-xs">
                          Obligatorio
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Clave: <code className="bg-muted px-1 rounded text-xs">{field.key}</code>
                      {field.options && field.options.length > 0 && (
                        <span className="ml-2">
                          Opciones: {field.options.join(', ')}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <FieldBuilder
                      field={field}
                      trigger={
                        <Button variant="ghost" size="icon">
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DeleteFieldButton fieldId={field.id} fieldName={field.name} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Help text */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tipos de campo disponibles</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="grid grid-cols-2 gap-1">
            <li><strong>Texto:</strong> Texto libre</li>
            <li><strong>Numero:</strong> Valores numericos</li>
            <li><strong>Fecha:</strong> Selector de fecha</li>
            <li><strong>Seleccion:</strong> Lista de opciones</li>
            <li><strong>Casilla:</strong> Si/No</li>
            <li><strong>URL:</strong> Enlaces web</li>
            <li><strong>Email:</strong> Correo electronico</li>
            <li><strong>Telefono:</strong> Numero de telefono</li>
            <li><strong>Moneda:</strong> Valores monetarios</li>
            <li><strong>Porcentaje:</strong> Valores 0-100%</li>
            <li><strong>Archivo:</strong> URL de archivo</li>
            <li><strong>Contacto:</strong> Relacion con otro contacto</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
