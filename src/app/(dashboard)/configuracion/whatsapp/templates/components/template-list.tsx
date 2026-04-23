'use client'

import { Fragment, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

const categoryLabels: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticacion',
}

interface TemplateListProps {
  templates: Template[]
  v2?: boolean
}

export function TemplateList({ templates, v2: v2Prop }: TemplateListProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  if (templates.length === 0) {
    if (v2) {
      return (
        <div className="text-center py-12 flex flex-col items-center gap-3">
          <p className="mx-h3">No hay templates todavia.</p>
          <p className="mx-caption">Crea tu primer template para enviar mensajes fuera de la ventana de 24h.</p>
          <p className="mx-rule-ornament">· · ·</p>
        </div>
      )
    }
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay templates creados. Crea uno para enviar mensajes fuera de la
          ventana de 24h.
        </CardContent>
      </Card>
    )
  }

  if (v2) {
    return (
      <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Nombre</th>
              <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Categoria</th>
              <th className="text-left px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Estado</th>
              <th className="text-right px-[12px] py-[10px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)] w-[140px]" style={{ fontFamily: 'var(--font-sans)' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const isExpanded = expandedId === template.id
              return (
                <Fragment key={template.id}>
                  <tr className="hover:bg-[var(--paper-1)]">
                    <td className={cn('px-[12px] py-[10px] text-[13px] text-[var(--ink-1)] font-semibold', !isExpanded && 'border-b border-[var(--border)]')} style={{ fontFamily: 'var(--font-sans)' }}>
                      {template.name}
                    </td>
                    <td className={cn('px-[12px] py-[10px] text-[12px] text-[var(--ink-2)]', !isExpanded && 'border-b border-[var(--border)]')} style={{ fontFamily: 'var(--font-sans)' }}>
                      {categoryLabels[template.category]}
                    </td>
                    <td className={cn('px-[12px] py-[10px]', !isExpanded && 'border-b border-[var(--border)]')}>
                      <TemplateStatusBadge status={template.status} v2={v2} />
                    </td>
                    <td className={cn('px-[12px] py-[10px] text-right', !isExpanded && 'border-b border-[var(--border)]')}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : template.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <Link
                          href={`/configuracion/whatsapp/templates/${template.id}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-2)] text-[oklch(0.55_0.14_28)] hover:bg-[oklch(0.98_0.02_28)]">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-[20px] font-bold tracking-[-0.01em]" style={{ fontFamily: 'var(--font-display)' }}>Eliminar template</AlertDialogTitle>
                              <AlertDialogDescription className="text-[13px] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                                Esta accion no se puede deshacer. El template se eliminara de 360dialog.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(template.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] text-[13px] font-semibold"
                                style={{ fontFamily: 'var(--font-sans)' }}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} className="px-[18px] py-[14px] border-b border-[var(--border)] bg-[var(--paper-1)]">
                        {template.status === 'REJECTED' && template.rejected_reason && (
                          <div className="flex items-start gap-2 p-3 border border-[oklch(0.75_0.10_28)] bg-[oklch(0.98_0.02_28)] rounded-[var(--radius-3)] mb-3">
                            <AlertCircle className="h-4 w-4 text-[oklch(0.55_0.18_28)] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[13px] font-semibold text-[oklch(0.38_0.14_28)]" style={{ fontFamily: 'var(--font-sans)' }}>
                                Razon del rechazo:
                              </p>
                              <p className="text-[13px] text-[oklch(0.45_0.14_28)]" style={{ fontFamily: 'var(--font-sans)' }}>
                                {template.rejected_reason}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          {template.components.map((comp, idx) => (
                            <div key={idx} className="text-[13px]" style={{ fontFamily: 'var(--font-sans)' }}>
                              <span className="font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                                {comp.type}:
                              </span>{' '}
                              <span className="text-[var(--ink-2)]">{comp.text || '(sin texto)'}</span>
                            </div>
                          ))}
                        </div>

                        {Object.keys(template.variable_mapping).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[var(--border)]">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                              Variables mapeadas
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(template.variable_mapping).map(
                                ([key, value]) => (
                                  <span
                                    key={key}
                                    className="text-[11px] bg-[var(--paper-2)] border border-[var(--border)] text-[var(--ink-2)] px-[8px] py-[3px] rounded-[var(--radius-2)]"
                                    style={{ fontFamily: 'var(--font-mono)' }}
                                  >
                                    {`{{${key}}}`} → {value}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
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
    </div>
  )
}
