// ============================================================================
// SMS (Onurix) Integration Tab
// Server component — reads sms_workspace_config + sms_messages (last 30d).
// Replaces the legacy Twilio tab (twilio-form.tsx + twilio-usage.tsx).
//
// Role gating:
//   - Tab visibility (Owner / Admin) is enforced one level up by
//     /configuracion/integraciones/page.tsx (lines 38-48). NOT duplicated here.
//   - Super-admin (MORFX_OWNER_USER_ID) sees a link to /super-admin/sms for
//     balance recharge. Other Owner/Admin users see a "contact support" copy
//     (D-11 in CONTEXT.md).
// ============================================================================

import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, MessageSquare, ExternalLink } from 'lucide-react'
import { SMS_PRICE_COP } from '@/lib/sms/constants'
import { getIsSuperUser } from '@/lib/auth/super-user'
import { getSmsUsage } from '@/app/actions/integrations'

export async function SmsTab() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">No se pudo determinar el workspace.</p>
        </CardContent>
      </Card>
    )
  }

  const { data: config } = await supabase
    .from('sms_workspace_config')
    .select('is_active, balance_cop')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const isActive = config?.is_active ?? false
  const balance = config?.balance_cop ?? 0
  const hasBalance = balance >= SMS_PRICE_COP
  const needsAttention = !isActive || !hasBalance

  // Super-admin detection — drives recarga link vs contact-support copy (D-11).
  const isSuperAdmin = await getIsSuperUser()

  // Usage last 30d (Onurix-backed getSmsUsage from Plan 02). Fail-soft —
  // if the call throws (e.g. shape mismatch during migration), the stats
  // block simply does not render.
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  let usage: Awaited<ReturnType<typeof getSmsUsage>> | null = null
  try {
    usage = await getSmsUsage(workspaceId, thirtyDaysAgo.toISOString(), now.toISOString())
  } catch {
    usage = null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          SMS (Onurix)
        </CardTitle>
        <CardDescription>
          Envio de SMS a clientes via Onurix. Precio por segmento: ${SMS_PRICE_COP.toLocaleString('es-CO')} COP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Estado</span>
          {isActive ? (
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">Activo</Badge>
          ) : (
            <Badge variant="secondary">Inactivo</Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Saldo actual</span>
          <span className="text-lg font-semibold">
            ${balance.toLocaleString('es-CO')} COP
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Precio por segmento</span>
          <span className="text-sm">${SMS_PRICE_COP.toLocaleString('es-CO')} COP</span>
        </div>

        {usage && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="font-medium text-xs uppercase text-muted-foreground">Uso ultimos 30 dias</div>
            <div className="flex items-center justify-between">
              <span>SMS enviados</span>
              <span className="font-medium">{usage.totalSms.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Gasto total</span>
              <span className="font-medium">${usage.totalCostCop.toLocaleString('es-CO')} COP</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Entregados / fallidos / pendientes</span>
              <span>{usage.delivered} / {usage.failed} / {usage.pending}</span>
            </div>
          </div>
        )}

        {needsAttention && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              {!isActive
                ? 'SMS no esta activo para este workspace. Contacta al administrador para activarlo.'
                : `Saldo insuficiente (minimo ${SMS_PRICE_COP} COP). Contacta al administrador para recargar.`}
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          {isSuperAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/sms" className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Recargar saldo (super-admin)
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Para recargar saldo o activar el servicio, contacta al equipo de soporte.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
