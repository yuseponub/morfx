'use client'

/**
 * Command Output
 * Phase 24: Chat de Comandos UI
 *
 * Scrollable output area showing typed command messages.
 * Auto-scrolls to bottom on new messages.
 */

import { useEffect, useRef } from 'react'
import { ChevronRight, AlertCircle, HelpCircle } from 'lucide-react'
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
