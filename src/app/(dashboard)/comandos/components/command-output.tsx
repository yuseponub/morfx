'use client'

/**
 * Command Output
 * Phase 24 + Phase 27 + Phase 28: Chat de Comandos UI
 *
 * Scrollable output area showing typed command messages.
 * Auto-scrolls to bottom on new messages.
 * Renders OCR result summaries with categorized guide matching results.
 * Renders document_result messages with download links for generated PDFs/Excels.
 */

import { useEffect, useRef } from 'react'
import { ChevronRight, AlertCircle, HelpCircle, CheckCircle2, AlertTriangle, XCircle, Download, MapPin, Phone, DollarSign } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CommandMessage } from './comandos-layout'

interface CommandOutputProps {
  messages: CommandMessage[]
}

// ---- Help text content ----
const HELP_COMMANDS = [
  { cmd: 'subir ordenes coord', desc: 'Subir ordenes pendientes a Coordinadora' },
  { cmd: 'buscar guias coord', desc: 'Buscar guias asignadas por Coordinadora' },
  { cmd: 'leer guias', desc: 'Leer guias de envio por OCR (adjuntar fotos primero)' },
  { cmd: 'generar guias inter', desc: 'Generar guias PDF para Interrapidisimo' },
  { cmd: 'generar guias bogota', desc: 'Generar guias PDF para envios Bogota' },
  { cmd: 'generar excel envia', desc: 'Generar archivo Excel para carga masiva Envia' },
  { cmd: 'estado', desc: 'Ver estado del job activo' },
  { cmd: 'ayuda', desc: 'Mostrar esta ayuda' },
]

export function CommandOutput({ messages }: CommandOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <p>Escribe un comando o usa los botones rapidos.</p>
          <p className="text-xs">Escribe &quot;ayuda&quot; para ver los comandos disponibles.</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-3">
        {messages.map((msg, idx) => (
          <MessageRenderer key={idx} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

// ---- Message renderer ----

function MessageRenderer({ message }: { message: CommandMessage }) {
  switch (message.type) {
    case 'command':
      return (
        <div className="flex items-start gap-2">
          <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm">{message.text}</span>
            <span className="text-xs text-muted-foreground ml-2">{message.timestamp}</span>
          </div>
        </div>
      )

    case 'system':
      return (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
          {message.text}
        </div>
      )

    case 'error':
      return (
        <div className="flex items-start gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">{message.text}</span>
        </div>
      )

    case 'progress':
      return (
        <div className="text-sm text-muted-foreground pl-6">
          Procesando: {message.current}/{message.total}
        </div>
      )

    case 'result':
      return (
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Resultado:</span>
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800">
              {message.success} exitosas
            </Badge>
            {message.error > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800">
                {message.error} errores
              </Badge>
            )}
          </div>
          <div className="space-y-1">
            {message.details.map((detail, idx) => (
              <div
                key={idx}
                className={cn(
                  'text-xs flex items-center gap-2 pl-2',
                  detail.status === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                )}
              >
                <span className="font-mono">{detail.orderName || detail.orderId.slice(0, 8)}</span>
                {detail.status === 'success' && detail.trackingNumber && (
                  <span className="text-muted-foreground">#{detail.trackingNumber}</span>
                )}
                {detail.status === 'error' && detail.errorMessage && (
                  <span className="text-muted-foreground">{detail.errorMessage}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )

    case 'ocr_result':
      return (
        <div className="pl-6 space-y-3">
          {/* Auto-assigned */}
          {message.autoAssigned.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Asignadas automaticamente ({message.autoAssigned.length})
              </div>
              {message.autoAssigned.map((item, idx) => (
                <div key={idx} className="text-xs pl-6 flex items-center gap-2">
                  <span className="font-mono">#{item.guideNumber}</span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span>{item.orderName || 'Orden'}</span>
                  <Badge variant="outline" className="text-[10px]">{item.carrier}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Pending confirmation */}
          {message.pendingConfirmation.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                Pendientes de confirmacion ({message.pendingConfirmation.length})
              </div>
              {message.pendingConfirmation.map((item, idx) => (
                <div key={idx} className="text-xs pl-6 flex items-center gap-2">
                  <span className="font-mono">#{item.guideNumber || '?'}</span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span>{item.suggestedOrderName || '?'}</span>
                  <span className="text-muted-foreground">({item.confidence}% por {item.matchedBy})</span>
                </div>
              ))}
            </div>
          )}

          {/* No match */}
          {message.noMatch.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
                <XCircle className="h-4 w-4" />
                Sin coincidencia ({message.noMatch.length})
              </div>
              {message.noMatch.map((item, idx) => (
                <div key={idx} className="text-xs pl-6">
                  Guia {item.guideNumber || 'sin numero'} ({item.carrier})
                </div>
              ))}
            </div>
          )}

          {/* OCR Failed */}
          {message.ocrFailed.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                No se pudo leer ({message.ocrFailed.length})
              </div>
              {message.ocrFailed.map((item, idx) => (
                <div key={idx} className="text-xs pl-6 text-muted-foreground">
                  {item.fileName}
                </div>
              ))}
            </div>
          )}
        </div>
      )

    case 'shipment_result':
      return (
        <div className="pl-6 space-y-3">
          {message.successItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {message.successItems.length} pedido(s) creado(s)
              </div>
              {message.successItems.map((item, idx) => (
                <div key={idx} className="pl-6 text-xs space-y-0.5 border-l-2 border-green-200 dark:border-green-800 ml-2">
                  <div className="font-medium">
                    #{item.trackingNumber} - {item.orderName || 'Sin nombre'}
                  </div>
                  {item.address && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{item.address}</span>
                    </div>
                  )}
                  {(item.city || item.department) && (
                    <div className="text-muted-foreground pl-4">
                      {[item.city, item.department].filter(Boolean).join(' (')}
                      {item.department ? ')' : ''}
                    </div>
                  )}
                  {item.phone && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{item.phone}</span>
                    </div>
                  )}
                  {item.totalValue > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="h-3 w-3 shrink-0" />
                      <span>${item.totalValue.toLocaleString('es-CO')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {message.errorItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                {message.errorItems.length} error(es) del robot
              </div>
              {message.errorItems.map((item, idx) => (
                <div key={idx} className="pl-6 text-xs space-y-0.5 border-l-2 border-red-200 dark:border-red-800 ml-2">
                  <div className="font-medium">{item.orderName || 'Sin nombre'}</div>
                  {item.phone && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{item.phone}</span>
                    </div>
                  )}
                  <div className="text-red-600 dark:text-red-400">{item.errorMessage}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )

    case 'guide_lookup_result':
      return (
        <div className="pl-6 space-y-3">
          <div className="text-sm font-medium">
            Guias Coordinadora - Resumen
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span>Total: {message.total}</span>
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800">
              Con guia: {message.updatedItems.length}
            </Badge>
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
              Sin guia: {message.pendingItems.length}
            </Badge>
          </div>

          {message.updatedItems.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {message.updatedItems.length} actualizada(s)
              </div>
              {message.updatedItems.map((item, idx) => (
                <div key={idx} className="text-xs pl-6 space-y-0.5">
                  <div>{item.orderName || 'Sin nombre'}</div>
                  <div className="text-muted-foreground">
                    Pedido: {item.pedidoNumber} &rarr; Guia: {item.guideNumber}
                  </div>
                </div>
              ))}
            </div>
          )}

          {message.pendingItems.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {message.pendingItems.length} pendiente(s)
              </div>
              {message.pendingItems.map((item, idx) => (
                <div key={idx} className="text-xs pl-6 text-muted-foreground">
                  {item.orderName || 'Sin nombre'} - Pedido: {item.pedidoNumber}
                </div>
              ))}
            </div>
          )}
        </div>
      )

    case 'document_result':
      return (
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Documento generado: {message.carrierName}
          </div>
          <div className="text-sm text-muted-foreground">
            {message.totalOrders} orden{message.totalOrders !== 1 ? 'es' : ''} procesada{message.totalOrders !== 1 ? 's' : ''}
          </div>
          {message.documentUrl && (
            <a
              href={message.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Download className="h-4 w-4" />
              Descargar {message.documentType === 'pdf' ? 'PDF' : 'Excel'}
            </a>
          )}
        </div>
      )

    case 'warning':
      return (
        <div className="pl-6">
          <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 rounded-r-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {message.title}
            </div>
            <div className="space-y-2">
              {message.items.map((item, idx) => (
                <div key={idx} className="text-xs space-y-0.5">
                  <div>
                    <span className="font-semibold text-yellow-800 dark:text-yellow-300">
                      {item.orderName || 'Sin nombre'}
                    </span>
                    {item.products ? (
                      // Warning de combinacion de productos
                      <>
                        <span className="text-muted-foreground">{' — '}</span>
                        <span className="font-bold text-yellow-700 dark:text-yellow-300">
                          {item.products}
                        </span>
                      </>
                    ) : (
                      // Warning de correccion de ciudad por IA (legacy — mantener render)
                      <>
                        <span className="text-muted-foreground">{' — '}</span>
                        <span className="text-muted-foreground">&quot;{item.originalCity}&quot;</span>
                        <span className="text-muted-foreground">{' → '}</span>
                        <span className="font-bold text-yellow-700 dark:text-yellow-300">
                          {item.resolvedCity}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-muted-foreground pl-4 italic">
                    {item.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )

    case 'help':
      return (
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="h-4 w-4" />
            Comandos disponibles:
          </div>
          <div className="space-y-1.5">
            {HELP_COMMANDS.map(({ cmd, desc }) => (
              <div key={cmd} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="font-mono text-xs">
                  {cmd}
                </Badge>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )

    default:
      return null
  }
}
