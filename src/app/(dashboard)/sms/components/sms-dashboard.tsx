'use client'

import { MessageSquareText } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SmsBalanceCard } from './sms-balance-card'
import { SmsMetricsCards } from './sms-metrics-cards'
import { SmsUsageChart } from './sms-usage-chart'
import { SmsHistoryTable } from './sms-history-table'
import { SmsSettings } from './sms-settings'
import type { SMSConfig, SMSMetrics } from '@/app/actions/sms'

interface SmsDashboardProps {
  initialConfig: SMSConfig | null
  initialMetrics: SMSMetrics
}

export function SmsDashboard({ initialConfig, initialMetrics }: SmsDashboardProps) {
  // Inactive / not configured state
  if (!initialConfig || !initialConfig.isActive) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <MessageSquareText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Servicio SMS no activado</h2>
        <p className="text-muted-foreground max-w-md">
          El servicio de SMS no esta activado para este workspace. Contacta al administrador para activar el envio de SMS.
        </p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="configuracion">Configuracion</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-6">
        <SmsBalanceCard
          balanceCop={initialConfig.balanceCop}
          totalSmsSent={initialConfig.totalSmsSent}
        />

        <SmsMetricsCards metrics={initialMetrics} />

        <SmsUsageChart />

        <SmsHistoryTable />
      </TabsContent>

      <TabsContent value="configuracion">
        <SmsSettings
          allowNegativeBalance={initialConfig.allowNegativeBalance}
          isActive={initialConfig.isActive}
        />
      </TabsContent>
    </Tabs>
  )
}
