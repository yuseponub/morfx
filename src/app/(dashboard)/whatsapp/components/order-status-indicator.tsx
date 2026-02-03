'use client'

import {
  getStageEmoji,
  shouldShowStageIndicator,
  PHASE_INDICATORS,
  getOrderPhase,
  type StageWithOrderState,
} from '@/lib/orders/stage-phases'
import type { OrderSummary } from '@/lib/whatsapp/types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface OrderStatusIndicatorProps {
  /** Orders to display indicators for */
  orders: OrderSummary[]
  /** Maximum number of indicators to show (default: 3) */
  maxDisplay?: number
  /** Show tooltip with stage details on hover */
  showTooltip?: boolean
  /** Size variant */
  size?: 'sm' | 'md'
}

/**
 * Displays order status indicators as subtle emoji badges.
 * Groups orders by phase and shows up to maxDisplay indicators.
 *
 * Design decisions:
 * - Won orders don't show indicators (no visual noise for success)
 * - Multiple orders of same phase show single indicator
 * - Overflow shown as "+N"
 * - Small, subtle to not distract from conversation content
 */
export function OrderStatusIndicator({
  orders,
  maxDisplay = 3,
  showTooltip = true,
  size = 'sm',
}: OrderStatusIndicatorProps) {
  // Filter to orders with stages that should show indicators (DB-driven or fallback)
  const activeOrders = orders.filter(order =>
    shouldShowStageIndicator(order.stage as StageWithOrderState)
  )

  if (activeOrders.length === 0) {
    return null
  }

  // Get unique emojis (deduplicate by emoji value)
  const emojiMap = new Map<string, { emoji: string; label: string; orders: typeof activeOrders }>()

  for (const order of activeOrders) {
    const emoji = getStageEmoji(order.stage as StageWithOrderState)
    if (emoji) {
      const existing = emojiMap.get(emoji)
      // Label: use order_state.name if available, otherwise fallback to legacy phase label
      const label = order.stage.order_state?.name ||
        PHASE_INDICATORS[getOrderPhase(order.stage.name)].label
      if (existing) {
        existing.orders.push(order)
      } else {
        emojiMap.set(emoji, { emoji, label, orders: [order] })
      }
    }
  }

  const uniqueEmojis = Array.from(emojiMap.values())
  const displayedEmojis = uniqueEmojis.slice(0, maxDisplay)
  const overflow = uniqueEmojis.length - maxDisplay

  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  if (!showTooltip) {
    return (
      <div className="flex items-center gap-0.5">
        {displayedEmojis.map(({ emoji, label }) => (
          <span
            key={emoji}
            className={sizeClasses}
            aria-label={label}
          >
            {emoji}
          </span>
        ))}
        {overflow > 0 && (
          <span className={`${sizeClasses} text-muted-foreground`}>
            +{overflow}
          </span>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5">
        {displayedEmojis.map(({ emoji, label, orders: emojiOrders }) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <span
                className={`${sizeClasses} cursor-help`}
                aria-label={label}
              >
                {emoji}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <div className="text-xs">
                <p className="font-medium">{label}</p>
                <p className="text-muted-foreground">
                  {emojiOrders.length} pedido{emojiOrders.length > 1 ? 's' : ''}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${sizeClasses} text-muted-foreground cursor-help`}>
                +{overflow}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">{overflow} etapas mas</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Single order stage badge for detailed display (e.g., contact panel).
 */
export function OrderStageBadge({
  stage,
  size = 'sm',
}: {
  stage: { name: string; color: string }
  size?: 'sm' | 'md'
}) {
  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-2.5 py-1'

  return (
    <span
      className={`${sizeClasses} rounded-full shrink-0 font-medium`}
      style={{
        backgroundColor: stage.color + '20',
        color: stage.color,
      }}
    >
      {stage.name}
    </span>
  )
}
