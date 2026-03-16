'use client'

import { Card, CardContent } from '@/components/ui/card'
import { DollarSign, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SmsBalanceCardProps {
  balanceCop: number
  totalSmsSent: number
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

function getBalanceColor(balance: number): string {
  if (balance > 5000) return 'text-green-600 dark:text-green-400'
  if (balance >= 1000) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function getBalanceBg(balance: number): string {
  if (balance > 5000) return 'bg-green-50 dark:bg-green-950/30'
  if (balance >= 1000) return 'bg-yellow-50 dark:bg-yellow-950/30'
  return 'bg-red-50 dark:bg-red-950/30'
}

export function SmsBalanceCard({ balanceCop, totalSmsSent }: SmsBalanceCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Balance */}
          <div className="flex items-center gap-4 flex-1">
            <div className={cn('rounded-full p-3', getBalanceBg(balanceCop))}>
              <DollarSign className={cn('h-6 w-6', getBalanceColor(balanceCop))} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo disponible</p>
              <p className={cn('text-3xl font-bold tracking-tight', getBalanceColor(balanceCop))}>
                {formatCOP(balanceCop)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Precio por SMS: $97 COP
              </p>
            </div>
          </div>

          {/* Total sent */}
          <div className="flex items-center gap-4">
            <div className="rounded-full p-3 bg-blue-50 dark:bg-blue-950/30">
              <Send className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total SMS enviados</p>
              <p className="text-3xl font-bold tracking-tight">
                {totalSmsSent.toLocaleString('es-CO')}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
