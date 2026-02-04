// ============================================================================
// Phase 11: Integrations Settings Page
// Configure external integrations (Shopify, etc.)
// ============================================================================

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getShopifyIntegration, getPipelinesForConfig, getWebhookEvents } from '@/app/actions/shopify'
import { ShopifyForm } from './components/shopify-form'
import { SyncStatus } from './components/sync-status'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingBag, Settings2 } from 'lucide-react'

export default async function IntegracionesPage() {
  // Verify user is Owner
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Only Owner can access this page
  if (!member || member.role !== 'owner') {
    redirect('/crm/contactos')
  }

  // Load integration data
  const [integration, pipelines, webhookData] = await Promise.all([
    getShopifyIntegration(),
    getPipelinesForConfig(),
    getWebhookEvents(10),
  ])

  return (
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
          {/* Future integrations can be added here */}
        </TabsList>

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
      </Tabs>
    </div>
  )
}
