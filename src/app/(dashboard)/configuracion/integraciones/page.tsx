// ============================================================================
// Phase 11 + Phase 20: Integrations Settings Page
// Configure external integrations (Shopify + SMS Onurix + BOLD)
// Accessible by Owner and Admin roles
// ============================================================================

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getShopifyIntegration, getPipelinesForConfig, getWebhookEvents } from '@/app/actions/shopify'
import { ShopifyForm } from './components/shopify-form'
import { SyncStatus } from './components/sync-status'
import { SmsTab } from './components/sms-tab'
import { BoldForm } from './components/bold-form'
import { ConnectWhatsApp } from '@/components/settings/connect-whatsapp'
import { ConnectFacebook } from '@/components/settings/connect-facebook'
import { ConnectInstagram } from '@/components/settings/connect-instagram'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingBag, Settings2, MessageSquare, CreditCard, MessageCircle, Facebook, Instagram } from 'lucide-react'

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
  const [integration, pipelines, webhookData] = await Promise.all([
    getShopifyIntegration(),
    getPipelinesForConfig(),
    getWebhookEvents(10),
  ])

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
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp (Meta directo)
          </TabsTrigger>
          <TabsTrigger value="facebook" className="flex items-center gap-2">
            <Facebook className="h-4 w-4" />
            Facebook Messenger
          </TabsTrigger>
          <TabsTrigger value="instagram" className="flex items-center gap-2">
            <Instagram className="h-4 w-4" />
            Instagram
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
              <CardTitle>Como conectar</CardTitle>
              <CardDescription>
                Ingresa el dominio de tu tienda Shopify (ej:
                <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">mitienda.myshopify.com</code>)
                y haz click en "Conectar con Shopify". Te redirigiremos a
                Shopify para autorizar el acceso a pedidos, clientes y borradores
                de pedidos. Al volver, configuras el pipeline y la etapa donde
                se crearan los pedidos. Los webhooks (orders/create,
                orders/updated, draft_orders/create) se crean automaticamente
                — no es necesario configurarlos a mano.
              </CardDescription>
            </CardHeader>
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

        {/* WhatsApp (Meta directo) Tab — Embedded Signup self-service onboarding */}
        <TabsContent value="whatsapp" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    WhatsApp (Meta directo)
                  </CardTitle>
                  <CardDescription>
                    Conecta un número de WhatsApp Business directamente con Meta
                    mediante Embedded Signup. Autoriza tu cuenta de WhatsApp
                    Business y el número en la ventana de Meta; al finalizar, el
                    número queda registrado de forma segura. Conectar un número
                    no cambia el proveedor de envío actual de tu workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConnectWhatsApp />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Facebook Messenger Tab — classic FB Login Page connect (Phase 40) */}
        <TabsContent value="facebook" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Facebook className="h-5 w-5" />
                    Facebook Messenger
                  </CardTitle>
                  <CardDescription>
                    Conecta una página de Facebook para atender los mensajes de
                    Messenger directamente con Meta. Autoriza tu página y el
                    permiso de mensajería en la ventana de Meta; al finalizar, la
                    página queda registrada de forma segura. Conectar una página
                    no cambia el proveedor de envío actual de tu workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConnectFacebook />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Instagram Direct Tab — IG rides on the connected Facebook Page (Phase 41) */}
        <TabsContent value="instagram" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Instagram className="h-5 w-5" />
                    Instagram Direct
                  </CardTitle>
                  <CardDescription>
                    Conecta la cuenta de Instagram Profesional vinculada a tu
                    página de Facebook para atender los mensajes directos de
                    Instagram con Meta. Instagram usa la conexión de tu página de
                    Facebook ya autorizada; no se abre ninguna ventana adicional.
                    Al finalizar, la cuenta queda registrada de forma segura.
                    Conectar Instagram no cambia el proveedor de envío actual de
                    tu workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConnectInstagram />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  )
}
