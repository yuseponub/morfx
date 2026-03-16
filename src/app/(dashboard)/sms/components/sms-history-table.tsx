'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react'
import { getSMSHistory, type SMSHistoryMessage } from '@/app/actions/sms'

const PAGE_SIZE = 20

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)

function statusBadge(status: string) {
  switch (status) {
    case 'delivered':
      return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">Entregado</Badge>
    case 'failed':
      return <Badge variant="destructive">Fallido</Badge>
    case 'sent':
    case 'pending':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100">Enviado</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function sourceLabel(source: string | null): string {
  if (!source) return '-'
  switch (source) {
    case 'automation': return 'Automatizacion'
    case 'manual': return 'Manual'
    case 'script': return 'Script'
    default: return source
  }
}

export function SmsHistoryTable() {
  const [messages, setMessages] = useState<SMSHistoryMessage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true)
    const result = await getSMSHistory(p, PAGE_SIZE)
    setMessages(result.data)
    setTotal(result.total)
    setPage(result.page)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historial de SMS</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquareText className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No hay mensajes SMS registrados</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2 font-medium">Fecha</th>
                    <th className="text-left py-3 px-2 font-medium">Destinatario</th>
                    <th className="text-left py-3 px-2 font-medium">Mensaje</th>
                    <th className="text-left py-3 px-2 font-medium">Estado</th>
                    <th className="text-right py-3 px-2 font-medium">Costo</th>
                    <th className="text-left py-3 px-2 font-medium">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 whitespace-nowrap text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString('es-CO', {
                          timeZone: 'America/Bogota',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-2">
                        <div>
                          {msg.contact_name && (
                            <span className="font-medium block">{msg.contact_name}</span>
                          )}
                          <span className="text-muted-foreground text-xs">{msg.to_number}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 max-w-[200px]">
                        <span className="truncate block" title={msg.body}>
                          {msg.body.length > 50 ? msg.body.slice(0, 50) + '...' : msg.body}
                        </span>
                      </td>
                      <td className="py-3 px-2">{statusBadge(msg.status)}</td>
                      <td className="py-3 px-2 text-right whitespace-nowrap">
                        {msg.cost_cop !== null ? formatCOP(msg.cost_cop) : '-'}
                      </td>
                      <td className="py-3 px-2 text-muted-foreground">
                        {sourceLabel(msg.source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      {msg.contact_name && (
                        <span className="font-medium block text-sm">{msg.contact_name}</span>
                      )}
                      <span className="text-muted-foreground text-xs">{msg.to_number}</span>
                    </div>
                    {statusBadge(msg.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {msg.body.length > 80 ? msg.body.slice(0, 80) + '...' : msg.body}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {new Date(msg.created_at).toLocaleString('es-CO', {
                        timeZone: 'America/Bogota',
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{msg.cost_cop !== null ? formatCOP(msg.cost_cop) : '-'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  {total} mensajes totales
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => fetchPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => fetchPage(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
