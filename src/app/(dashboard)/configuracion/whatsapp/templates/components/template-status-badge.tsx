'use client'

import { Badge } from '@/components/ui/badge'
import type { TemplateStatus } from '@/lib/whatsapp/types'
import { cn } from '@/lib/utils'

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

interface TemplateStatusBadgeProps {
  status: TemplateStatus
}

export function TemplateStatusBadge({ status }: TemplateStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.PENDING
  return (
    <Badge variant="secondary" className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
