'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { VariableMapper } from './variable-mapper'
import { createTemplate } from '@/app/actions/templates'
import type { TemplateCategory, TemplateComponent } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'

const categoryInfo: Record<
  TemplateCategory,
  { label: string; description: string; examples: string }
> = {
  MARKETING: {
    label: 'Marketing',
    description: 'Promociones, ofertas, novedades. Mayor costo por mensaje.',
    examples: 'Ej: "Aprovecha 20% de descuento en tu proxima compra"',
  },
  UTILITY: {
    label: 'Utilidad',
    description: 'Actualizaciones de pedidos, confirmaciones, recordatorios.',
    examples: 'Ej: "Tu pedido #123 ha sido enviado con guia ABC123"',
  },
  AUTHENTICATION: {
    label: 'Autenticacion',
    description: 'Codigos OTP, verificaciones de identidad.',
    examples: 'Ej: "Tu codigo de verificacion es: 123456"',
  },
}

export function TemplateForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('UTILITY')
  const [language, setLanguage] = useState('es')
  const [headerText, setHeaderText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [variableMapping, setVariableMapping] = useState<
    Record<string, string>
  >({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Build components array
      const components: TemplateComponent[] = []

      if (headerText.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
      }

      if (bodyText.trim()) {
        components.push({ type: 'BODY', text: bodyText })
      } else {
        toast.error('El cuerpo del mensaje es requerido')
        setLoading(false)
        return
      }

      if (footerText.trim()) {
        components.push({ type: 'FOOTER', text: footerText })
      }

      const result = await createTemplate({
        name,
        language,
        category,
        components,
        variable_mapping: variableMapping,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Template creado y enviado a Meta para aprobacion')
        router.push('/configuracion/whatsapp/templates')
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al crear template'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informacion Basica</CardTitle>
          <CardDescription>
            El nombre debe ser unico y solo puede contener letras minusculas,
            numeros y guiones bajos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del template</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                  )
                }
                placeholder="confirmacion_envio"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Espanol</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(categoryInfo) as TemplateCategory[]).map((cat) => {
                const info = categoryInfo[cat]
                return (
                  <div
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      category === cat
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <p className="font-medium">{info.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {info.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contenido del Mensaje</CardTitle>
          <CardDescription>
            Usa {'{{1}}'}, {'{{2}}'}, etc. para agregar variables que se
            reemplazaran con datos del contacto o pedido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header">Encabezado (opcional)</Label>
            <Input
              id="header"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Actualizacion de tu pedido"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Cuerpo del mensaje *</Label>
            <Textarea
              id="body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Hola {{1}}, tu pedido #{{2}} ha sido enviado con la guia {{3}}."
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Ejemplo: Hola {'{{1}}'}, tu pedido #{'{{2}}'} ha sido enviado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer">Pie de pagina (opcional)</Label>
            <Input
              id="footer"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Gracias por tu compra - Tu Tienda"
            />
          </div>
        </CardContent>
      </Card>

      {(bodyText.includes('{{') || headerText.includes('{{')) && (
        <Card>
          <CardHeader>
            <CardTitle>Mapeo de Variables</CardTitle>
            <CardDescription>
              Conecta cada variable del mensaje con el campo correspondiente.
              Esto se usara al enviar el template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariableMapper
              templateBody={bodyText + headerText}
              mapping={variableMapping}
              onChange={setVariableMapping}
            />
          </CardContent>
        </Card>
      )}

      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Proceso de aprobacion</p>
              <p className="mt-1">
                Despues de crear el template, Meta lo revisara (1-24 horas). Solo
                podras usarlo cuando el estado sea &quot;Aprobado&quot;.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !name || !bodyText}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Crear y Enviar a Meta
        </Button>
      </div>
    </form>
  )
}
