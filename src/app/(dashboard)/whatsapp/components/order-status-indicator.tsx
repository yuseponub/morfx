'use client'

import { getOrderPhase, PHASE_INDICATORS, shouldShowIndicator, type OrderPhase } from '@/lib/orders/stage-phases'
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
  // Filter to only active (non-won) orders and get their phases
  const activePhases = orders
    .map(order => ({
      order,
      phase: getOrderPhase(order.stage.name),
    }))
    .filter(({ phase }) => shouldShowIndicator(phase))

  if (activePhases.length === 0) {
    return null
  }

  // Group by phase (deduplicate) and get unique phases
  const uniquePhases = [...new Set(activePhases.map(({ phase }) => phase))]
  const displayedPhases = uniquePhases.slice(0, maxDisplay)
  const overflow = uniquePhases.length - maxDisplay

  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  if (!showTooltip) {
    return (
      <div className="flex items-center gap-0.5">
        {displayedPhases.map((phase) => (
          <span
            key={phase}
            className={sizeClasses}
            aria-label={PHASE_INDICATORS[phase].label}
          >
            {PHASE_INDICATORS[phase].emoji}
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
        {displayedPhases.map((phase) => {
          // Get orders for this phase for tooltip
          const phaseOrders = activePhases.filter(({ phase: p }) => p === phase)
          const indicator = PHASE_INDICATORS[phase]

          return (
            <Tooltip key={phase}>
              <TooltipTrigger asChild>
                <span
                  className={`${sizeClasses} cursor-help`}
                  aria-label={indicator.label}
                >
                  {indicator.emoji}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="text-xs">
                  <p className="font-medium">{indicator.label}</p>
                  <p className="text-muted-foreground">
                    {phaseOrders.length} pedido{phaseOrders.length > 1 ? 's' : ''}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
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
