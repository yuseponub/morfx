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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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

export function TemplateForm({ v2: v2Prop }: { v2?: boolean } = {}) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
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
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({})
  const [headerExamples, setHeaderExamples] = useState<Record<string, string>>({})

  // Editorial tokens (v2)
  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const textareaV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
  const selectTriggerV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
    : ''
  const selectContentV2 = v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]' : ''
  const selectItemV2 = v2 ? 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]' : ''
  const btnSecondaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
    : ''
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined
  const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined

  // Card class overrides when v2 (CSS-level swap: shadcn Card primitive keeps shape but visual follows tokens)
  const cardV2 = v2 ? '!bg-[var(--paper-0)] !border !border-[var(--ink-1)] !rounded-[var(--radius-3)] !shadow-[0_1px_0_var(--ink-1)]' : ''
  const cardTitleV2 = v2 ? '!text-[18px] !font-bold !tracking-[-0.01em]' : ''
  const cardDescV2 = v2 ? '!text-[12px] !text-[var(--ink-3)]' : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Build components array
      const components: TemplateComponent[] = []

      if (headerText.trim()) {
        const headerVarNums = [...new Set(
          (headerText.match(/\{\{(\d+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ''))
        )]
        const headerComponent: TemplateComponent = { type: 'HEADER', format: 'TEXT', text: headerText }
        if (headerVarNums.length > 0) {
          headerComponent.example = {
            header_text: headerVarNums.map(num => headerExamples[num] || `ejemplo_${num}`)
          }
        }
        components.push(headerComponent)
      }

      if (bodyText.trim()) {
        const bodyVarNums = [...new Set(
          (bodyText.match(/\{\{(\d+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ''))
        )]
        const bodyComponent: TemplateComponent = { type: 'BODY', text: bodyText }
        if (bodyVarNums.length > 0) {
          bodyComponent.example = {
            body_text: [bodyVarNums.map(num => bodyExamples[num] || `ejemplo_${num}`)]
          }
        }
        components.push(bodyComponent)
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
      <Card className={cardV2}>
        <CardHeader>
          <CardTitle className={cardTitleV2} style={v2FontDisplay}>Informacion Basica</CardTitle>
          <CardDescription className={cardDescV2} style={v2FontSans}>
            El nombre debe ser unico y solo puede contener letras minusculas,
            numeros y guiones bajos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className={labelV2} style={v2FontSans}>Nombre del template</Label>
              <Input
                id="name"
                className={inputV2}
                style={v2FontMono}
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
              <Label htmlFor="language" className={labelV2} style={v2FontSans}>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className={selectTriggerV2} style={v2FontSans}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentV2}>
                  <SelectItem value="es" className={selectItemV2} style={v2FontSans}>Espanol</SelectItem>
                  <SelectItem value="en_US" className={selectItemV2} style={v2FontSans}>English (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelV2} style={v2FontSans}>Categoria</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(categoryInfo) as TemplateCategory[]).map((cat) => {
                const info = categoryInfo[cat]
                const isActive = category === cat
                return (
                  <div
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'p-3 border rounded-lg cursor-pointer transition-colors',
                      v2
                        ? isActive
                          ? 'border-[var(--ink-1)] bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]'
                          : 'border-[var(--border)] bg-[var(--paper-0)] hover:bg-[var(--paper-1)]'
                        : isActive
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <p className={cn('font-medium', v2 && 'text-[13px] font-semibold text-[var(--ink-1)]')} style={v2FontSans}>{info.label}</p>
                    <p className={cn('text-xs text-muted-foreground mt-1', v2 && '!text-[11px] !text-[var(--ink-3)]')} style={v2FontSans}>
                      {info.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cardV2}>
        <CardHeader>
          <CardTitle className={cardTitleV2} style={v2FontDisplay}>Contenido del Mensaje</CardTitle>
          <CardDescription className={cardDescV2} style={v2FontSans}>
            Usa {'{{1}}'}, {'{{2}}'}, etc. para agregar variables que se
            reemplazaran con datos del contacto o pedido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header" className={labelV2} style={v2FontSans}>Encabezado (opcional)</Label>
            <Input
              id="header"
              className={inputV2}
              style={v2FontSans}
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Actualizacion de tu pedido"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body" className={labelV2} style={v2FontSans}>Cuerpo del mensaje *</Label>
            <Textarea
              id="body"
              className={textareaV2}
              style={v2FontSans}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Hola {{1}}, tu pedido #{{2}} ha sido enviado con la guia {{3}}."
              rows={4}
              required
            />
            <p className={hintV2} style={v2FontSans}>
              Ejemplo: Hola {'{{1}}'}, tu pedido #{'{{2}}'} ha sido enviado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer" className={labelV2} style={v2FontSans}>Pie de pagina (opcional)</Label>
            <Input
              id="footer"
              className={inputV2}
              style={v2FontSans}
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Gracias por tu compra - Tu Tienda"
            />
          </div>
        </CardContent>
      </Card>

      {(bodyText.includes('{{') || headerText.includes('{{')) && (
        <Card className={cardV2}>
          <CardHeader>
            <CardTitle className={cardTitleV2} style={v2FontDisplay}>Mapeo de Variables</CardTitle>
            <CardDescription className={cardDescV2} style={v2FontSans}>
              Conecta cada variable del mensaje con el campo correspondiente.
              Esto se usara al enviar el template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariableMapper
              templateBody={bodyText + headerText}
              mapping={variableMapping}
              onChange={setVariableMapping}
              v2={v2}
            />
          </CardContent>
        </Card>
      )}

      {(() => {
        const bVars = [...new Set((bodyText.match(/\{\{(\d+)\}\}/g) || []).map(v => v.replace(/[{}]/g, '')))]
        const hVars = [...new Set((headerText.match(/\{\{(\d+)\}\}/g) || []).map(v => v.replace(/[{}]/g, '')))]
        if (bVars.length === 0 && hVars.length === 0) return null
        return (
          <Card className={cardV2}>
            <CardHeader>
              <CardTitle className={cardTitleV2} style={v2FontDisplay}>Valores de Ejemplo</CardTitle>
              <CardDescription className={cardDescV2} style={v2FontSans}>
                Meta requiere ejemplos para aprobar el template. Escribe un valor
                realista para cada variable. Solo se usan para la revision de Meta,
                no se envian a los clientes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {hVars.length > 0 && (
                <div className="space-y-2">
                  <p className={cn('text-xs font-medium text-muted-foreground uppercase', v2 && '!text-[10px] !text-[var(--rubric-2)] !tracking-[0.12em] !font-semibold')} style={v2FontSans}>Encabezado</p>
                  {hVars.map(num => (
                    <div key={`h-${num}`} className="flex items-center gap-3">
                      <span className={cn('text-sm font-mono bg-muted px-2 py-1 rounded min-w-[60px] text-center', v2 && '!bg-[var(--paper-2)] !border !border-[var(--border)] !text-[12px] !text-[var(--ink-2)]')} style={v2FontMono}>
                        {`{{${num}}}`}
                      </span>
                      <Input
                        className={inputV2}
                        style={v2FontSans}
                        placeholder={`Ej: valor para {{${num}}}`}
                        value={headerExamples[num] || ''}
                        onChange={(e) => setHeaderExamples({ ...headerExamples, [num]: e.target.value })}
                        required
                      />
                    </div>
                  ))}
                </div>
              )}
              {bVars.length > 0 && (
                <div className="space-y-2">
                  {hVars.length > 0 && (
                    <p className={cn('text-xs font-medium text-muted-foreground uppercase', v2 && '!text-[10px] !text-[var(--rubric-2)] !tracking-[0.12em] !font-semibold')} style={v2FontSans}>Cuerpo</p>
                  )}
                  {bVars.map(num => (
                    <div key={`b-${num}`} className="flex items-center gap-3">
                      <span className={cn('text-sm font-mono bg-muted px-2 py-1 rounded min-w-[60px] text-center', v2 && '!bg-[var(--paper-2)] !border !border-[var(--border)] !text-[12px] !text-[var(--ink-2)]')} style={v2FontMono}>
                        {`{{${num}}}`}
                      </span>
                      <Input
                        className={inputV2}
                        style={v2FontSans}
                        placeholder={`Ej: valor para {{${num}}}`}
                        value={bodyExamples[num] || ''}
                        onChange={(e) => setBodyExamples({ ...bodyExamples, [num]: e.target.value })}
                        required
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <Card className={cn('border-yellow-200 bg-yellow-50', v2 && '!bg-[oklch(0.98_0.04_70)] !border-[oklch(0.80_0.09_70)] !shadow-none !rounded-[var(--radius-3)]')}>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className={cn('h-5 w-5 text-yellow-600 flex-shrink-0', v2 && 'text-[oklch(0.55_0.14_70)]')} />
            <div className={cn('text-sm text-yellow-800', v2 && '!text-[13px] !text-[oklch(0.32_0.10_70)]')} style={v2FontSans}>
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
        <Button type="button" variant="outline" onClick={() => router.back()} className={btnSecondaryV2} style={v2FontSans}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !name || !bodyText} className={btnPrimaryV2} style={v2FontSans}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Crear y Enviar a Meta
        </Button>
      </div>
    </form>
  )
}
