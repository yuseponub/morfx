'use client'

import { Badge } from '@/components/ui/badge'
import type { TemplateStatus } from '@/lib/whatsapp/types'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

const statusConfig: Record<TemplateStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  APPROVED: {
    label: 'Aprobado',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  REJECTED: {
    label: 'Rechazado',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
  },
  PAUSED: {
    label: 'Pausado',
    className: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  },
  DISABLED: {
    label: 'Deshabilitado',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  },
}

// Editorial mx-tag mapping per D-DASH-15
const editorialMapping: Record<TemplateStatus, string> = {
  APPROVED: 'mx-tag--verdigris',
  PENDING: 'mx-tag--gold',
  REJECTED: 'mx-tag--rubric',
  PAUSED: 'mx-tag--indigo',
  DISABLED: 'mx-tag--ink',
}

interface TemplateStatusBadgeProps {
  status: TemplateStatus
  v2?: boolean
}

export function TemplateStatusBadge({ status, v2: v2Prop }: TemplateStatusBadgeProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const config = statusConfig[status] || statusConfig.PENDING

  if (v2) {
    const variant = editorialMapping[status] ?? 'mx-tag--ink'
    return <span className={cn('mx-tag', variant)}>{config.label}</span>
  }

  return (
    <Badge variant="secondary" className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
