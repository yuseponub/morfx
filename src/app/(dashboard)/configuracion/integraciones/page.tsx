// ============================================================================
// Phase 11 + Phase 20: Integrations Settings Page
// Configure external integrations (Shopify + SMS Onurix + BOLD)
// Accessible by Owner and Admin roles
// ============================================================================

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { cn } from '@/lib/utils'
import { getShopifyIntegration, getPipelinesForConfig, getWebhookEvents } from '@/app/actions/shopify'
import { ShopifyForm } from './components/shopify-form'
import { SyncStatus } from './components/sync-status'
import { SmsTab } from './components/sms-tab'
import { BoldForm } from './components/bold-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingBag, Settings2, MessageSquare, CreditCard } from 'lucide-react'

export default async function IntegracionesPage() {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get current workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    redirect('/crm/contactos')
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .single()

  // Owner + Admin can access integrations (per CONTEXT.md decision)
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    redirect('/crm/contactos')
  }

  // Load Shopify integration data
  const [integration, pipelines, webhookData, v2] = await Promise.all([
    getShopifyIntegration(),
    getPipelinesForConfig(),
    getWebhookEvents(10),
    getIsDashboardV2Enabled(workspaceId),
  ])

  if (v2) {
    const editorialTabTrigger =
      'flex items-center gap-2 px-3 py-2 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-[var(--ink-1)] data-[state=active]:text-[var(--ink-1)] data-[state=active]:font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] text-[13px]'
    return (
      <div className={cn('flex-1 overflow-y-auto bg-[var(--paper-1)]')}>
        {/* Editorial topbar */}
        <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Integraciones
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — conecta morfx con tus otras herramientas
              </em>
            </h1>
          </div>
        </div>

        <div className="px-8 py-6 max-w-[1200px]">
          <Tabs defaultValue="shopify" className="space-y-4">
            <TabsList className="bg-transparent border-b border-[var(--border)] rounded-none p-0 h-auto w-auto justify-start">
              <TabsTrigger value="shopify" className={editorialTabTrigger} style={{ fontFamily: 'var(--font-sans)' }}>
                <ShoppingBag className="h-4 w-4" />
                Shopify
              </TabsTrigger>
              <TabsTrigger value="sms" className={editorialTabTrigger} style={{ fontFamily: 'var(--font-sans)' }}>
                <MessageSquare className="h-4 w-4" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="bold" className={editorialTabTrigger} style={{ fontFamily: 'var(--font-sans)' }}>
                <CreditCard className="h-4 w-4" />
                BOLD
              </TabsTrigger>
            </TabsList>

            {/* Shopify Tab */}
            <TabsContent value="shopify" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Configuration Form */}
                <div className="lg:col-span-2">
                  <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                    <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                      <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                        <ShoppingBag className="h-5 w-5" />
                        Configuracion de Shopify
                      </h3>
                      <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                        Conecta tu tienda Shopify para sincronizar pedidos automaticamente. Los pedidos creados en Shopify apareceran en tu CRM.
                      </p>
                    </div>
                    <div className="px-[18px] py-[16px] max-h-[calc(100vh-300px)] overflow-y-auto">
                      <Suspense fallback={<div className="h-96 animate-pulse bg-[var(--paper-2)] rounded" />}>
                        <ShopifyForm
                          integration={integration}
                          pipelines={pipelines}
                          v2={v2}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>

                {/* Sync Status */}
                <div>
                  <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                    <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                      <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                        <Settings2 className="h-5 w-5" />
                        Estado de Sincronizacion
                      </h3>
                      <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                        Actividad reciente de webhooks
                      </p>
                    </div>
                    <div className="px-[18px] py-[16px]">
                      <SyncStatus
                        integration={integration}
                        events={webhookData.events}
                        stats={webhookData.stats}
                        v2={v2}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
                <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
                  <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>
                    Como configurar
                  </h3>
                </div>
                <div className="px-[18px] py-[16px]">
                  <ol className="list-decimal pl-4 space-y-2 text-[13px] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    <li>
                      En tu admin de Shopify, ve a <strong>Settings &gt; Apps and sales channels &gt; Develop apps</strong>
                    </li>
                    <li>
                      Crea una nueva app o selecciona una existente
                    </li>
                    <li>
                      En <strong>Configuration</strong>, habilita los permisos: <code className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>read_orders</code>, <code className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>read_customers</code>
                    </li>
                    <li>
                      En <strong>API credentials</strong>, copia el <strong>Admin API access token</strong> y el <strong>API secret key</strong>
                    </li>
                    <li>
                      Pega las credenciales en el formulario y prueba la conexion
                    </li>
                    <li>
                      Configura el webhook en Shopify:
                      <ul className="list-disc pl-4 mt-1">
                        <li>Topic: <code className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>orders/create</code></li>
                        <li>URL: <code className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>{process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/shopify</code></li>
                        <li>Format: JSON</li>
                      </ul>
                    </li>
                  </ol>
                </div>
              </div>
            </TabsContent>

            {/* SMS (Onurix) Tab */}
            <TabsContent value="sms" className="space-y-4">
              <Suspense fallback={<div className="h-64 animate-pulse bg-[var(--paper-2)] rounded" />}>
                <SmsTab v2={v2} />
              </Suspense>
            </TabsContent>

            {/* BOLD Tab */}
            <TabsContent value="bold" className="space-y-4">
              <Suspense fallback={<div className="h-96 animate-pulse bg-[var(--paper-2)] rounded" />}>
                <BoldForm v2={v2} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integraciones</h1>
        <p className="text-muted-foreground">
          Conecta tu tienda con servicios externos para sincronizar datos automaticamente.
        </p>
      </div>

      <Tabs defaultValue="shopify" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shopify" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Shopify
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="bold" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            BOLD
          </TabsTrigger>
        </TabsList>

        {/* Shopify Tab */}
        <TabsContent value="shopify" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Configuration Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5" />
                    Configuracion de Shopify
                  </CardTitle>
                  <CardDescription>
                    Conecta tu tienda Shopify para sincronizar pedidos automaticamente.
                    Los pedidos creados en Shopify apareceran en tu CRM.
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-[calc(100vh-300px)] overflow-y-auto">
                  <Suspense fallback={<div className="h-96 animate-pulse bg-muted rounded" />}>
                    <ShopifyForm
                      integration={integration}
                      pipelines={pipelines}
                    />
                  </Suspense>
                </CardContent>
              </Card>
            </div>

            {/* Sync Status */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Estado de Sincronizacion
                  </CardTitle>
                  <CardDescription>
                    Actividad reciente de webhooks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SyncStatus
                    integration={integration}
                    events={webhookData.events}
                    stats={webhookData.stats}
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Como configurar</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  En tu admin de Shopify, ve a <strong>Settings &gt; Apps and sales channels &gt; Develop apps</strong>
                </li>
                <li>
                  Crea una nueva app o selecciona una existente
                </li>
                <li>
                  En <strong>Configuration</strong>, habilita los permisos: <code>read_orders</code>, <code>read_customers</code>
                </li>
                <li>
                  En <strong>API credentials</strong>, copia el <strong>Admin API access token</strong> y el <strong>API secret key</strong>
                </li>
                <li>
                  Pega las credenciales en el formulario y prueba la conexion
                </li>
                <li>
                  Configura el webhook en Shopify:
                  <ul className="list-disc pl-4 mt-1">
                    <li>Topic: <code>orders/create</code></li>
                    <li>URL: <code>{process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/shopify</code></li>
                    <li>Format: JSON</li>
                  </ul>
                </li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS (Onurix) Tab */}
        <TabsContent value="sms" className="space-y-4">
          <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded" />}>
            <SmsTab />
          </Suspense>
        </TabsContent>

        {/* BOLD Tab */}
        <TabsContent value="bold" className="space-y-4">
          <Suspense fallback={<div className="h-96 animate-pulse bg-muted rounded" />}>
            <BoldForm />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  )
}
