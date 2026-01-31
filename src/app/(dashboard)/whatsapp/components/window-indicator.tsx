'use client'

import { differenceInHours, differenceInMinutes } from 'date-fns'
import { AlertTriangle, Lock } from 'lucide-react'
import type { WindowStatus } from '@/lib/whatsapp/types'

interface WindowIndicatorProps {
  lastCustomerMessageAt: string | null
}

/**
 * Calculates 24h window status.
 * - Open (>2h remaining): returns null (show nothing)
 * - Closing (<2h remaining): yellow warning
 * - Closed (>24h): red alert
 */
function getWindowStatus(lastCustomerMessageAt: string | null): {
  status: WindowStatus
  hoursRemaining: number
  minutesRemaining: number
} | null {
  if (!lastCustomerMessageAt) {
    // No customer message yet, window is closed
    return { status: 'closed', hoursRemaining: 0, minutesRemaining: 0 }
  }

  const lastMessage = new Date(lastCustomerMessageAt)
  const now = new Date()
  const windowCloses = new Date(lastMessage.getTime() + 24 * 60 * 60 * 1000)

  const hoursRemaining = differenceInHours(windowCloses, now)
  const minutesRemaining = differenceInMinutes(windowCloses, now) % 60

  if (hoursRemaining < 0) {
    // Window closed
    return { status: 'closed', hoursRemaining: 0, minutesRemaining: 0 }
  }

  if (hoursRemaining < 2) {
    // Closing soon
    return { status: 'closing', hoursRemaining, minutesRemaining }
  }

  // Window open with >2h remaining - don't show anything
  return null
}

/**
 * Indicator for 24h WhatsApp messaging window.
 * Only shows warning when window is closing or closed.
 * Returns null when window is open (>2h remaining).
 */
export function WindowIndicator({ lastCustomerMessageAt }: WindowIndicatorProps) {
  const windowInfo = getWindowStatus(lastCustomerMessageAt)

  // Don't show anything when window is open
  if (!windowInfo) {
    return null
  }

  if (windowInfo.status === 'closed') {
    return (
      <div className="mx-4 mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
        <div className="flex items-center gap-2 text-destructive">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Ventana cerrada</p>
            <p className="text-xs opacity-80">Solo puedes enviar templates</p>
          </div>
        </div>
      </div>
    )
  }

  // Closing soon
  const timeString = windowInfo.hoursRemaining > 0
    ? `${windowInfo.hoursRemaining}h ${windowInfo.minutesRemaining}m`
    : `${windowInfo.minutesRemaining}m`

  return (
    <div className="mx-4 mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Ventana cierra en {timeString}</p>
          <p className="text-xs opacity-80">Responde pronto para mantener la conversacion</p>
        </div>
      </div>
    </div>
  )
}
