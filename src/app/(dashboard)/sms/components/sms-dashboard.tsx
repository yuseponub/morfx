'use client'

import Link from 'next/link'
import { MessageSquareText, Settings } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { SmsBalanceCard } from './sms-balance-card'
import { SmsMetricsCards } from './sms-metrics-cards'
import { SmsUsageChart } from './sms-usage-chart'
import { SmsHistoryTable } from './sms-history-table'
import { SmsSettings } from './sms-settings'
import type { SMSConfig, SMSMetrics } from '@/app/actions/sms'

interface SmsDashboardProps {
  initialConfig: SMSConfig | null
  initialMetrics: SMSMetrics
  isSuperAdmin?: boolean
}

export function SmsDashboard({ initialConfig, initialMetrics, isSuperAdmin }: SmsDashboardProps) {
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
        {isSuperAdmin && (
          <Button asChild className="mt-4" variant="outline">
            <Link href="/super-admin/sms">
              <Settings className="h-4 w-4 mr-2" />
              Administrar SMS
            </Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="configuracion">Configuracion</TabsTrigger>
        </TabsList>
        {isSuperAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link href="/super-admin/sms">
              <Settings className="h-4 w-4 mr-2" />
              Admin SMS
            </Link>
          </Button>
        )}
      </div>

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
