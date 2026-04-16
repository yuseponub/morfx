---
phase: twilio-to-onurix-migration
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/app/(dashboard)/configuracion/integraciones/page.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
  - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
autonomous: true

must_haves:
  truths:
    - "Tab 'Twilio' ya no se renderiza en /configuracion/integraciones"
    - "Tab 'SMS' existe y muestra balance + is_active + precio + uso 30d + link/instrucción para recarga"
    - "SMS tab es accesible solo por Owner/Admin (gate existente en page.tsx líneas 38-48, no se duplica)"
    - "Super-admin (MORFX_OWNER_USER_ID) ve link a /super-admin/sms para recarga; resto de Owner/Admin ven copy de contacto a soporte (D-11)"
    - "SmsTab llama getSmsUsage (adaptado a Onurix en Plan 02) — funciones no quedan huérfanas"
    - "actions-step.tsx ya no importa checkTwilioConfigured; usa checkSmsConfigured"
    - "Categoría 'Twilio' ya no aparece en ACTION_CATEGORY_CONFIG del wizard de automations"
    - "Warning amarillo del wizard se dispara cuando sms_workspace_config.is_active=false O balance_cop < 97 (antes era falso positivo sobre integrations Twilio)"
    - "twilio-form.tsx y twilio-usage.tsx archivos eliminados (reemplazados por sms-tab.tsx)"
    - "bold-form.tsx ya no contiene el comentario 'copy of twilio-form' (o está actualizado a algo genérico)"
  artifacts:
    - path: "src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx"
      provides: "Nuevo componente React para tab SMS (balance Onurix + estado + link)"
      contains: "sms_workspace_config"
    - path: "src/app/(dashboard)/configuracion/integraciones/page.tsx"
      provides: "Tab SMS reemplaza tab Twilio"
      contains: 'value="sms"'
    - path: "src/app/(dashboard)/automatizaciones/components/actions-step.tsx"
      provides: "Warning driven by checkSmsConfigured contra sms_workspace_config"
      contains: "checkSmsConfigured"
  key_links:
    - from: "src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx"
      to: "sms_workspace_config table"
      via: "createClient (server) + .eq('workspace_id', ...)"
      pattern: "sms_workspace_config"
    - from: "src/app/(dashboard)/automatizaciones/components/actions-step.tsx"
      to: "src/app/actions/automations.ts::checkSmsConfigured"
      via: "await checkSmsConfigured() in useEffect"
      pattern: "checkSmsConfigured"
---

<objective>
Fase B (parte 2/3) — UI cleanup. Reemplazar el tab "Twilio" en `/configuracion/integraciones` por un tab "SMS" (balance Onurix + estado + link super-admin). Eliminar `twilio-form.tsx` y `twilio-usage.tsx`. Adaptar `actions-step.tsx` para que el warning amarillo consulte `checkSmsConfigured` (introducido en Plan 02) en vez de `checkTwilioConfigured`. Ajustar comentario en `bold-form.tsx`.

Purpose: Sin este plan, la UI seguiría mostrando el form Twilio roto y el warning del wizard arrojaría falsos positivos sobre una integración que ya no existe. Este plan cierra la experiencia del usuario.

Output: UI 100% Onurix. Tab SMS visible para Owner/Admin en integraciones. Wizard de automations muestra warning real (no falso positivo) cuando el workspace no tiene SMS activo o sin saldo.

Corre en paralelo con Plan 02 (backend cleanup). Ambos dependen de Plan 01 y NO comparten archivos — `files_modified` está aislado.

**Nota (wave gate):** `pnpm typecheck` NO se evalúa per-plan. Plan 03 Task 2 (`actions-step.tsx`) importa `checkSmsConfigured` que vive en `automations.ts` editado en Plan 02; correr typecheck mid-execution dispara falsos positivos cruzados. El orquestador `gsd-execute-phase` ejecuta typecheck al cerrar wave 2 (tras merge de 02+03).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/twilio-to-onurix-migration/CONTEXT.md — D-11 (tab SMS), D-12 (warning real)
@.planning/standalone/twilio-to-onurix-migration/RESEARCH.md — §Example 6 (callsite checkSmsConfigured), §Pitfall 5 (validación manual post-deploy)
@.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md — §Inventario files 5-8, 12
@src/app/super-admin/sms/page.tsx (y archivos del dir) — plantilla UI del dashboard SMS super-admin para tomar patrones (queries, layout, format)
@src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx — patrón de formulario similar en el mismo directorio (para copiar estilo de Card/CardHeader/CardContent)
@src/lib/sms/constants.ts — exporta `SMS_PRICE_COP = 97`

<interfaces>
<!-- From Plan 02 (dependency) -->
`checkSmsConfigured(): Promise<{ configured: boolean; balance: number | null; hasBalance: boolean }>` exportado de `@/app/actions/automations`

<!-- Current state of actions-step.tsx to refactor (from grep) -->
Line 52: `import { checkTwilioConfigured } from '@/app/actions/automations'`
Line 85: `Twilio: { icon: Phone, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50' },` (category icon map — eliminar entry Twilio)
Line 1157: prop `twilioWarning` passed down (rename to `smsWarning`)
Line 1171: prop type declaration `twilioWarning: boolean`
Line 1257: render condition `{twilioWarning && catalogEntry.category === 'SMS' && (...)`
Line 1518: `const [twilioWarning, setTwilioWarning] = useState(false)`
Line 1521-1538: effect that calls `checkTwilioConfigured()`
Line 1603: passes `twilioWarning={twilioWarning}`

<!-- Icon -->
Use lucide-react `MessageSquare` (or keep `Phone`) for SMS tab icon — the existing import `Phone` at line 19 of page.tsx can be reused (rename tab label only).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear sms-tab.tsx + reemplazar tab Twilio en page.tsx + ajustar comentario bold-form.tsx + eliminar twilio-form.tsx/twilio-usage.tsx</name>
  <files>
    src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
    src/app/(dashboard)/configuracion/integraciones/page.tsx
    src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx
    src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx
    src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
  </files>
  <read_first>
    - src/app/(dashboard)/configuracion/integraciones/page.tsx (archivo completo)
    - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx (ubicar comentario "copy of twilio-form")
    - src/app/super-admin/sms/page.tsx (plantilla de query sms_workspace_config — para copiar pattern)
    - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx (patrón Card usado en integraciones — para mantener consistencia visual)
    - src/lib/sms/constants.ts (para SMS_PRICE_COP)
    - .planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md §Inventario files 5-8
  </read_first>
  <action>
    **A. Crear `src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx`:**

    Componente React Server (async function, compatible con App Router) que:
    1. Lee `cookies()` para obtener `workspaceId`.
    2. Usa `createClient` de `@/lib/supabase/server` para consultar `sms_workspace_config` por `workspace_id`.
    3. Renderiza:
       - Card "Configuración de SMS (Onurix)"
       - Estado: `is_active ? "Activo" : "Inactivo"` (badge verde / gris)
       - Balance actual: `$${balance_cop.toLocaleString('es-CO')} COP`
       - Precio por SMS: `$97 COP por segmento` (importar `SMS_PRICE_COP` de `@/lib/sms/constants`)
       - Warning amarillo si `!is_active || balance_cop < 97`: "Sin saldo para enviar SMS. Contacta al super-admin para recargar."
       - Botón/link: "Abrir panel Super-admin" → `href="/super-admin/sms"` (deshabilitado/oculto si el usuario no tiene rol super-admin — para este plan, renderizar como texto estático "Contacta al administrador para recargar tu saldo" si no es super-admin; determinar via `user_metadata` o tabla `users.role` según patrón del repo).

    **Contexto de role-gating (verified):**
    - La page.tsx de `integraciones` (líneas 38-48) YA restringe acceso a Owner/Admin vía `workspace_members.role` + `redirect('/crm/contactos')`. Esto cubre el gate a nivel de tab para D-11.
    - Para distinguir super-admin (recarga) vs Owner/Admin (contactar soporte), el proyecto usa `getIsSuperUser()` de `@/lib/auth/super-user` (basado en env var `MORFX_OWNER_USER_ID`, patrón consistente con `src/app/super-admin/*` y `src/app/actions/sms-admin.ts`).

    Plantilla concreta (ajustar imports al patrón exacto del repo si difiere):
    ```typescript
    // src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
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

      // Usage last 30d (Q3 DISCUSSION-LOG: getSmsUsage adapted to Onurix). Fail-soft.
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
              Envío de SMS a clientes vía Onurix. Precio por segmento: ${SMS_PRICE_COP.toLocaleString('es-CO')} COP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Estado</span>
              {isActive ? (
                <Badge variant="default" className="bg-green-600">Activo</Badge>
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
                <div className="font-medium text-xs uppercase text-muted-foreground">Uso últimos 30 días</div>
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
                    ? 'SMS no está activo para este workspace. Contacta al administrador para activarlo.'
                    : `Saldo insuficiente (mínimo ${SMS_PRICE_COP} COP). Contacta al administrador para recargar.`}
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
    ```

    **Notas de implementación:**
    - Gate a nivel de tab: la page.tsx YA filtra Owner/Admin (líneas 38-48 — redirect si no es owner/admin). No se añade gate duplicado.
    - Link super-admin (`/super-admin/sms`) solo se renderiza si `getIsSuperUser()` devuelve true. Resto de Owner/Admin ven el copy "contacta al equipo de soporte" (D-11).
    - `getSmsUsage()` se llama dentro de try/catch — si la función falla (p.ej. tabla vacía), el bloque de estadísticas simplemente no se renderiza. No rompe el tab.
    - El componente sigue siendo Server Component async (sin `'use client'`).

    **B. Editar `src/app/(dashboard)/configuracion/integraciones/page.tsx`:**

    1. Eliminar imports `TwilioForm` y `TwilioUsage` (líneas 14-15).
    2. Agregar import `SmsTab` desde `./components/sms-tab`.
    3. Reemplazar el `TabsTrigger value="twilio"` (línea 73-76) por:
       ```tsx
       <TabsTrigger value="sms" className="flex items-center gap-2">
         <MessageSquare className="h-4 w-4" />
         SMS
       </TabsTrigger>
       ```
    4. Actualizar import lucide-react: añadir `MessageSquare` (eliminar `Phone` si ya no se usa en otros TabsTrigger — grep antes de borrar).
    5. Reemplazar el `<TabsContent value="twilio">` (líneas 168-176) por:
       ```tsx
       <TabsContent value="sms" className="space-y-4">
         <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded" />}>
           <SmsTab />
         </Suspense>
       </TabsContent>
       ```
    6. Actualizar el comentario del top del archivo (líneas 1-3) de "Configure external integrations (Shopify + Twilio)" a "Configure external integrations (Shopify + SMS Onurix + BOLD)".

    **C. Eliminar archivos Twilio UI:**
    ```bash
    rm src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx
    rm src/app/(dashboard)/configuracion/integraciones/components/twilio-usage.tsx
    ```

    **D. Editar `bold-form.tsx` para retirar el comentario "copy of twilio-form":**

    Localizar con `grep -n "twilio" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx`. Reemplazar el comentario por una descripción genérica (ej. "BOLD payment form — mirrors the Shopify form pattern") o eliminar la línea completa si es solo referencia histórica sin valor. Decisión del ejecutor: mínimamente invasiva — si la línea es un JSDoc, adaptarla; si es un comentario inline, borrarlo.
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx</automated>
    <automated>test ! -f src/app/\(dashboard\)/configuracion/integraciones/components/twilio-form.tsx</automated>
    <automated>test ! -f src/app/\(dashboard\)/configuracion/integraciones/components/twilio-usage.tsx</automated>
    <automated>grep -q 'value="sms"' src/app/\(dashboard\)/configuracion/integraciones/page.tsx</automated>
    <automated>grep -q 'value="twilio"' src/app/\(dashboard\)/configuracion/integraciones/page.tsx && exit 1 || exit 0</automated>
    <automated>grep -q 'TwilioForm\|TwilioUsage' src/app/\(dashboard\)/configuracion/integraciones/page.tsx && exit 1 || exit 0</automated>
    <automated>grep -i "twilio" src/app/\(dashboard\)/configuracion/integraciones/components/bold-form.tsx && exit 1 || exit 0</automated>
    <automated>grep -q "sms_workspace_config" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx</automated>
    <automated>grep -q "/super-admin/sms" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx</automated>
    <automated>grep -q "getIsSuperUser" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx</automated>
    <automated>grep -q "getSmsUsage" src/app/\(dashboard\)/configuracion/integraciones/components/sms-tab.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `sms-tab.tsx` existe, es un Server Component (async function), consulta `sms_workspace_config`.
    - `twilio-form.tsx` y `twilio-usage.tsx` eliminados.
    - `page.tsx` tiene tab "SMS" con `value="sms"` (no "twilio"), renderiza `<SmsTab />`, ya no importa `TwilioForm`/`TwilioUsage`.
    - `bold-form.tsx` no contiene ninguna mención a "twilio" (case-insensitive).
    - `sms-tab.tsx` usa `SMS_PRICE_COP` importado de `@/lib/sms/constants` (no hardcodea el número).
    - `sms-tab.tsx` contiene literal `/super-admin/sms` Y importa `getIsSuperUser` desde `@/lib/auth/super-user` (D-11: link a super-admin para recarga vs instrucción de contactar soporte según rol).
    - `sms-tab.tsx` llama `getSmsUsage` (adaptación Onurix de `integrations.ts` definida en Plan 02) — cubre uso últimos 30d de D-11 "Opcional: gráfico de uso" y evita que las funciones adaptadas queden huérfanas tras el PR.
    - Gate a nivel de tab: la page.tsx `integraciones` YA redirige a non-Owner/non-Admin (líneas 38-48 verificadas) — no se añade gate duplicado. Documentado en el action step.
  </acceptance_criteria>
  <done>
    - Archivos creados/eliminados, commit atómico: `refactor(twilio-migration): reemplazar tab Twilio por tab SMS (Onurix) en integraciones`
    - typecheck verde para `/configuracion/integraciones/*` (siempre que Plan 02 no esté rompiendo imports — ver nota en Plan 02 Task 2)
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Adaptar actions-step.tsx — eliminar categoría Twilio, reemplazar twilioWarning por smsWarning contra sms_workspace_config</name>
  <files>
    src/app/(dashboard)/automatizaciones/components/actions-step.tsx
  </files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/components/actions-step.tsx (archivo completo — ~1700 líneas; foco en líneas 52, 85-86, 1157, 1171, 1257, 1518-1538, 1603)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Example 6 (callsite smsWarning)
  </read_first>
  <action>
    Editar `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` con estos cambios literales:

    **1. Línea 52 — actualizar import:**
    Cambiar:
    ```typescript
    import { checkTwilioConfigured } from '@/app/actions/automations'
    ```
    Por:
    ```typescript
    import { checkSmsConfigured } from '@/app/actions/automations'
    ```

    **2. Línea 85 — eliminar entry `Twilio:` del ACTION_CATEGORY_CONFIG:**
    Quitar completamente la línea `Twilio: { icon: Phone, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50' },`.
    Si `Phone` de lucide-react ya no se usa en otro lado del archivo tras esto, eliminar el import de `Phone`. Usar `grep -n "Phone" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx` para confirmar.

    **3. Línea 1157 — rename prop passed down:**
    De `twilioWarning,` a `smsWarning,`.

    **4. Línea 1171 — rename prop type declaration:**
    De `twilioWarning: boolean` a `smsWarning: boolean`.

    **5. Línea 1257 — rename render condition y ajustar copy:**
    De:
    ```tsx
    {twilioWarning && catalogEntry.category === 'SMS' && (
      <div className="text-amber-600 dark:text-amber-500 text-xs flex items-start gap-1.5 mt-1">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          {/* mensaje Twilio viejo */}
        </span>
      </div>
    )}
    ```
    A:
    ```tsx
    {smsWarning && catalogEntry.category === 'SMS' && (
      <div className="text-amber-600 dark:text-amber-500 text-xs flex items-start gap-1.5 mt-1">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          SMS no está configurado o sin saldo. Revisa Integraciones → SMS.
        </span>
      </div>
    )}
    ```

    **6. Líneas 1518-1538 — reemplazar el useState + useEffect del warning:**

    Antes (aprox):
    ```typescript
    const [twilioWarning, setTwilioWarning] = useState(false)

    const hasTwilioAction = actions.some((a) => {
      const entry = ACTION_CATALOG.find((c) => c.type === a.type)
      return entry?.category === 'SMS'
    })

    useEffect(() => {
      if (!hasTwilioAction) {
        setTwilioWarning(false)
        return
      }
      let cancelled = false
      checkTwilioConfigured().then((configured) => {
        if (!cancelled) {
          setTwilioWarning(!configured)
        }
      })
      return () => { cancelled = true }
    }, [hasTwilioAction])
    ```

    Después:
    ```typescript
    const [smsWarning, setSmsWarning] = useState(false)

    const hasSmsAction = actions.some((a) => {
      const entry = ACTION_CATALOG.find((c) => c.type === a.type)
      return entry?.category === 'SMS'
    })

    useEffect(() => {
      if (!hasSmsAction) {
        setSmsWarning(false)
        return
      }
      let cancelled = false
      checkSmsConfigured().then((res) => {
        if (!cancelled) {
          // Warning si NO configurado O si no hay saldo mínimo
          setSmsWarning(!res.configured || !res.hasBalance)
        }
      })
      return () => { cancelled = true }
    }, [hasSmsAction])
    ```

    **7. Línea 1603 — pasar el nuevo prop:**
    De `twilioWarning={twilioWarning}` a `smsWarning={smsWarning}`.

    **Auditoría final del archivo:** tras todos los cambios, `grep -i "twilio" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx` debe devolver 0 matches.
  </action>
  <verify>
    <automated>grep -q "checkSmsConfigured" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx</automated>
    <automated>grep -i "twilio" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx && exit 1 || exit 0</automated>
    <automated>grep -q "smsWarning" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx</automated>
    <automated>grep -q "hasSmsAction" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx</automated>
    <automated>grep -q "res.hasBalance\|!res.configured" src/app/\(dashboard\)/automatizaciones/components/actions-step.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `actions-step.tsx` ya no contiene la palabra "twilio" (grep case-insensitive devuelve 0 matches).
    - `actions-step.tsx` importa `checkSmsConfigured` (no `checkTwilioConfigured`).
    - Categoría `Twilio` eliminada del ACTION_CATEGORY_CONFIG.
    - Warning se basa en `res.configured && res.hasBalance` (no solo configured).
    - `pnpm typecheck` NO se evalúa en este task — es gate a nivel de wave (ver nota en `<objective>`). El orquestador lo corre una vez 02+03 mergeados.
  </acceptance_criteria>
  <done>
    - actions-step.tsx refactorizado, commit atómico: `refactor(twilio-migration): reemplazar twilioWarning por smsWarning contra sms_workspace_config`
    - typecheck: se valida al cerrar wave 2 (orquestador), no aquí.
  </done>
</task>

</tasks>

<verification>
- `grep -ri "twilio" src/app/\(dashboard\)/` devuelve 0 matches (UI limpia).
- Tab "SMS" renderiza balance + is_active + precio.
- Warning en wizard de automations refleja estado real de `sms_workspace_config`.
- `pnpm typecheck` corre al cerrar wave 2 (orquestador `gsd-execute-phase` tras merge de 02+03). NO es gate per-plan.
</verification>

<success_criteria>
- UI 100% sin referencias Twilio.
- Tab SMS funcional con datos Onurix.
- Warning en wizard real (no falso positivo).
- 2 commits atómicos (Task 1 y Task 2 separados).
</success_criteria>

<output>
After completion, create `.planning/standalone/twilio-to-onurix-migration/03-SUMMARY.md` documenting:
- Archivo nuevo creado (sms-tab.tsx) — signature y layout
- Archivos eliminados
- Refactor aplicado a actions-step.tsx (line-by-line diff resumido)
- Confirmación de grep 0 matches en UI
</output>
