---
phase: twilio-to-onurix-migration
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/automations/action-executor.ts
  - src/lib/automations/constants.ts
  - src/app/actions/automations.ts
  - src/app/actions/integrations.ts
  - src/lib/twilio/client.ts
  - src/lib/twilio/types.ts
  - src/app/api/webhooks/twilio/status/route.ts
autonomous: true

must_haves:
  truths:
    - "Dispatcher in action-executor.ts routes both old-and-new 'send_sms' calls via domainSendSMS() (domain layer), never Twilio client directly"
    - "Action catalog in constants.ts has a single SMS entry with category='SMS' and label='Enviar SMS' (no 'send_sms_onurix', no 'Twilio' category)"
    - "checkTwilioConfigured function no longer exists; checkSmsConfigured exists and queries sms_workspace_config"
    - "getSmsUsage and getSmsUsageChart query sms_messages with provider='onurix' (not Twilio integrations table)"
    - "Directory src/lib/twilio/ does not exist; files client.ts + types.ts deleted"
    - "Route /api/webhooks/twilio/status no longer exists"
    - "saveTwilioIntegration, testTwilioConnection, getTwilioIntegration functions deleted from integrations.ts"
    - "Zero references to '@/lib/twilio' in src/ (grep)"
    - "TypeScript typecheck passes (pnpm build runs successfully)"
  artifacts:
    - path: "src/lib/automations/action-executor.ts"
      provides: "Single executeSendSms handler delegating to domainSendSMS"
      contains: "domainSendSMS"
    - path: "src/lib/automations/constants.ts"
      provides: "Unified SMS catalog entry"
      contains: "type: 'send_sms'"
    - path: "src/app/actions/automations.ts"
      provides: "checkSmsConfigured server action"
      exports: ["checkSmsConfigured"]
    - path: "src/app/actions/integrations.ts"
      provides: "Onurix-backed getSmsUsage + getSmsUsageChart (Twilio functions removed)"
      exports: ["getSmsUsage", "getSmsUsageChart"]
  key_links:
    - from: "src/lib/automations/action-executor.ts"
      to: "src/lib/domain/sms.ts"
      via: "domainSendSMS call in executeSendSms"
      pattern: "domainSendSMS"
    - from: "src/app/actions/automations.ts"
      to: "sms_workspace_config table"
      via: "supabase.from('sms_workspace_config') in checkSmsConfigured"
      pattern: "sms_workspace_config"
    - from: "src/app/actions/integrations.ts"
      to: "sms_messages table"
      via: "supabase.from('sms_messages').eq('provider', 'onurix')"
      pattern: "provider.*onurix"
---

<objective>
Fase B (parte 1/3) — Backend cleanup. Eliminar todo el código Twilio del backend en un set de commits atómicos y seguros: borrar el módulo `src/lib/twilio/`, el webhook `/api/webhooks/twilio/status`, unificar el dispatcher del action-executor, limpiar constants.ts, reemplazar `checkTwilioConfigured` → `checkSmsConfigured`, retirar las funciones Twilio de `integrations.ts`, adaptar `getSmsUsage`/`getSmsUsageChart` a Onurix.

Purpose: Sin este plan, el executor con código viejo seguiría ejecutando `executeSendSmsTwilio` aun cuando las automations ya dicen `send_sms` (Fase A). Este plan es lo que MUEVE la ruta del código a Onurix vía domain layer (Regla 3). Es el "go" real del cutover.

Output: Backend 100% Onurix. `pnpm build` pasa sin referencias `@/lib/twilio`. Server actions alineadas al nuevo modelo de datos (`sms_workspace_config`, `sms_messages.provider='onurix'`).

Este plan corre en paralelo con Plan 03 (UI cleanup). Ambos dependen de Plan 01 (data migration) y NO comparten archivos con Plan 03 — ver `files_modified` de ambos.

**Nota (wave gate):** `pnpm typecheck` NO es un gate por-plan aquí — se ejecuta a nivel de wave (tras merge de 02+03), porque los dos planes comparten contrato cruzado: Plan 02 exporta `checkSmsConfigured` que Plan 03 importa. Correr typecheck mid-execution en cualquiera de los dos dispara falsos positivos. El orquestador `gsd-execute-phase` es responsable del typecheck consolidado al cerrar wave 2.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/twilio-to-onurix-migration/CONTEXT.md — D-05 (rename), D-08 (delete webhook), D-12 (checkSmsConfigured), D-13 (adapt getSmsUsage)
@.planning/standalone/twilio-to-onurix-migration/RESEARCH.md — §Example 6 (checkSmsConfigured code), §Example 7 (executeSendSms code), §Example 8 (constants entry), §Pattern 3 commit 1-3 (safe ordering)
@.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md — §Inventario files 1-4, 9-11
@src/lib/domain/sms.ts — existing `sendSMS()` domain function (NO CHANGES — the target we delegate to)
@src/lib/sms/types.ts — canonical `SmsStatus` type (the one that survives)
@src/inngest/functions/sms-delivery-check.ts — polling function (NO CHANGES — replaces webhook)
@CLAUDE.md — Regla 3 (domain layer SIEMPRE), Regla 6 (proteger agente producción)

<interfaces>
<!-- From src/lib/domain/sms.ts (verified: read lines 31-75) -->
```typescript
export interface SendSMSParams {
  phone: string
  message: string
  source?: string
  automationExecutionId?: string
  contactName?: string
}

export interface SendSMSResult {
  smsMessageId: string
  dispatchId: string
  status: SmsStatus  // from '@/lib/sms/types'
  segmentsUsed: number
  costCop: number
}

export async function sendSMS(
  ctx: DomainContext,
  params: SendSMSParams
): Promise<DomainResult<SendSMSResult>>
```
<!-- NOTE: executor returns `result.data` as-is (opaque at this layer). No caller in src/ depends on the specific shape of SendSMSResult — grep confirmed. -->

<!-- From src/lib/automations/types (TriggerContext) -->
Action handlers signature: `async function executeXxx(params: Record<string, unknown>, context: TriggerContext, workspaceId: string): Promise<unknown>`

<!-- Current imports in action-executor.ts to REMOVE -->
Line 17: `import { getTwilioConfig, createTwilioClient } from '@/lib/twilio/client'`

<!-- Current imports in integrations.ts to REMOVE -->
Line 13: `import type { TwilioConfig, SmsMessage } from '@/lib/twilio/types'`
Line 14: `import { createTwilioClient } from '@/lib/twilio/client'`

<!-- Imports in integrations.ts to KEEP/VERIFY -->
`createClient` from '@/lib/supabase/server' (for getSmsUsage/Chart queries)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Unificar dispatcher + catálogo (action-executor.ts + constants.ts) y delete src/lib/twilio/</name>
  <files>
    src/lib/automations/action-executor.ts
    src/lib/automations/constants.ts
    src/lib/twilio/client.ts
    src/lib/twilio/types.ts
  </files>
  <read_first>
    - src/lib/automations/action-executor.ts (archivo completo — tiene 1159+ líneas; enfoque en líneas 17, 200-220, 1076-1159)
    - src/lib/automations/constants.ts (líneas 320-360)
    - src/lib/domain/sms.ts (contrato de `sendSMS()`)
    - src/lib/twilio/client.ts y src/lib/twilio/types.ts (archivos a eliminar — leer para confirmar que no exportan nada usado fuera del módulo twilio)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Example 7 (código target de executeSendSms) y §Example 8 (catalog entry target)
  </read_first>
  <action>
    **A. Editar `src/lib/automations/action-executor.ts`:**

    1. **Eliminar el import Twilio (línea 17):**
       ```typescript
       // DELETE línea 17:
       // import { getTwilioConfig, createTwilioClient } from '@/lib/twilio/client'
       ```

    2. **Actualizar el switch del dispatcher (líneas ~200-220):** el dispatcher actual tiene:
       ```typescript
       case 'send_sms':
         // ...
         return executeSendSmsTwilio(params, context, workspaceId)
       case 'send_sms_onurix':
         // ...
         return executeSendSmsOnurix(params, context, workspaceId)
       ```
       Reemplazar por un único case:
       ```typescript
       case 'send_sms':
         return executeSendSms(params, context, workspaceId)
       ```
       Elimina completamente el case `send_sms_onurix`.

    3. **Reemplazar líneas 1076-1159 (executeSendSmsTwilio + executeSendSmsOnurix) por un único handler `executeSendSms`:**
       ```typescript
       // ============================================================================
       // SMS Action — via Onurix domain layer
       // ============================================================================

       /**
        * Send an SMS via the domain layer (Onurix).
        * Delegates to domain/sms.ts which handles: phone validation, time window check,
        * balance pre-check, Onurix API call, message logging, balance deduction,
        * and Inngest delivery verification event emission.
        */
       async function executeSendSms(
         params: Record<string, unknown>,
         context: TriggerContext,
         workspaceId: string
       ): Promise<unknown> {
         const body = String(params.body || '')
         if (!body) throw new Error('body is required for send_sms')

         const to = params.to ? String(params.to) : context.contactPhone
         if (!to) {
           throw new Error(
             'No phone number available for SMS -- set "to" param or ensure trigger has contactPhone'
           )
         }

         const ctx: DomainContext = { workspaceId, source: 'automation' }
         const result = await domainSendSMS(ctx, {
           phone: to,
           message: body,
           source: 'automation',
           contactName: context.contactName || undefined,
         })

         if (!result.success) throw new Error(result.error || 'SMS send failed')
         return result.data
       }
       ```

       Notas:
       - Mantener el import existente `domainSendSMS` desde `@/lib/domain/sms` (ya está en el archivo).
       - Mantener el tipo `DomainContext` ya importado.
       - El parámetro `mediaUrl` del viejo Twilio handler NO se migra — Onurix no soporta MMS en esta iteración. Si algún usuario lo tenía configurado en sus actions, el parámetro se ignora silenciosamente (no rompe porque `params.mediaUrl` no se lee).
       - Regla 3 honrada: la ruta SIEMPRE es `executor → domainSendSMS → Onurix`. Cero llamadas directas a clients externos.

    **B. Editar `src/lib/automations/constants.ts` (líneas 338-358):**

    Reemplazar los DOS bloques (entry `send_sms` Twilio línea 338-348 + entry `send_sms_onurix` línea 349-358) por UNA sola entry:
    ```typescript
    {
      type: 'send_sms',
      label: 'Enviar SMS',
      category: 'SMS',
      description: 'Envia un mensaje SMS al contacto (Onurix - $97 COP)',
      params: [
        { name: 'body', label: 'Mensaje', type: 'textarea', required: true, supportsVariables: true },
        { name: 'to', label: 'Telefono destino (opcional)', type: 'text', required: false, supportsVariables: true },
      ],
    },
    ```
    - Elimina el param `mediaUrl` (Onurix no lo soporta).
    - Categoría `SMS` (no `Twilio`).

    **C. Eliminar el módulo `src/lib/twilio/`:**
    ```bash
    rm src/lib/twilio/client.ts
    rm src/lib/twilio/types.ts
    rmdir src/lib/twilio  # Solo si queda vacío; si el rm dejó el dir vacío, eliminar
    ```

    Confirmar que `src/lib/twilio/` no contiene otros archivos (solo los 2 listados) antes de `rm`. Si hay un `index.ts` u otro archivo, abortar y pedir review — AUDIT-REPORT dice solo 2 archivos.

    **Orden de ejecución dentro del commit:** primero editar action-executor.ts + constants.ts (retiran los imports) y SOLO DESPUÉS hacer `rm` del módulo. Esto evita que `pnpm build` rompa en un estado intermedio si el ejecutor pausa.
  </action>
  <verify>
    <automated>grep -rn "from '@/lib/twilio'" src/ 2>&1 | (! grep -q .)</automated>
    <automated>grep -rn "getTwilioConfig\|createTwilioClient\|executeSendSmsTwilio\|executeSendSmsOnurix" src/ 2>&1 | (! grep -q .)</automated>
    <automated>grep -rn "send_sms_onurix" src/ 2>&1 | (! grep -q .)</automated>
    <automated>test ! -d src/lib/twilio</automated>
    <automated>grep -c "type: 'send_sms'," src/lib/automations/constants.ts | grep -qx "1"</automated>
    <automated>! grep -q "type: 'send_sms_onurix'" src/lib/automations/constants.ts</automated>
    <automated>grep -q "category: 'SMS'" src/lib/automations/constants.ts</automated>
    <automated>grep -q "domainSendSMS" src/lib/automations/action-executor.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "from '@/lib/twilio'" src/` devuelve 0 matches.
    - `grep -rn "executeSendSmsTwilio\|executeSendSmsOnurix\|getTwilioConfig\|createTwilioClient" src/` devuelve 0 matches.
    - `grep -rn "send_sms_onurix" src/` devuelve 0 matches.
    - `src/lib/twilio/` directorio no existe.
    - `src/lib/automations/constants.ts` contiene EXACTAMENTE 1 entry con `type: 'send_sms'` (la unificada, con category 'SMS' y sin mediaUrl).
    - `src/lib/automations/action-executor.ts` contiene function `executeSendSms` y llama `domainSendSMS`.
    - `pnpm typecheck` se ejecuta al cerrar wave 2 (post-merge con Plan 03), NO aquí — evita false positives por dependencia cruzada checkSmsConfigured.
  </acceptance_criteria>
  <done>
    - 4 archivos modificados/eliminados, commit atómico con mensaje: `refactor(twilio-migration): unificar send_sms handler via domain layer + eliminar src/lib/twilio`
    - typecheck: se valida a nivel de wave tras merge con Plan 03 (orquestador)
    - El commit es bisect-safe para todo excepto el contrato cruzado con Plan 03 — una vez ambos commits estén en main, `pnpm typecheck` pasa verde
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Eliminar webhook /api/webhooks/twilio/status + funciones Twilio de integrations.ts + adaptar getSmsUsage a Onurix + reemplazar checkTwilioConfigured por checkSmsConfigured</name>
  <files>
    src/app/api/webhooks/twilio/status/route.ts
    src/app/actions/integrations.ts
    src/app/actions/automations.ts
  </files>
  <read_first>
    - src/app/api/webhooks/twilio/status/route.ts (archivo completo — confirmar que no tiene side-effects más allá de actualizar sms_messages)
    - src/app/actions/integrations.ts (archivo completo — ~400 líneas; foco en líneas 1-20 imports, 60-270 Twilio funcs, 280-395 getSmsUsage/Chart)
    - src/app/actions/automations.ts (líneas 940-964 — `checkTwilioConfigured` a eliminar)
    - src/lib/sms/constants.ts (para constante SMS_PRICE_COP=97)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Example 6 (código de checkSmsConfigured)
  </read_first>
  <action>
    **A. Eliminar el webhook:**
    ```bash
    rm src/app/api/webhooks/twilio/status/route.ts
    rmdir src/app/api/webhooks/twilio/status  # si queda vacío
    rmdir src/app/api/webhooks/twilio  # si queda vacío
    ```
    No crear stub — D-08 dice delete directo (Twilio no reintenta sobre 4xx, ver RESEARCH.md §Pitfall 2).

    **B. Editar `src/app/actions/integrations.ts`:**

    1. **Eliminar imports Twilio (líneas 13-14):**
       ```typescript
       // DELETE:
       // import type { TwilioConfig, SmsMessage } from '@/lib/twilio/types'
       // import { createTwilioClient } from '@/lib/twilio/client'
       ```

    2. **Eliminar funciones Twilio completas:**
       - `saveTwilioIntegration` (líneas ~63-140)
       - `testTwilioConnection` (líneas ~144-219) — estaba rota por R2, sale junto con el form
       - `getTwilioIntegration` (líneas ~224-270)

       Usar `grep -n "export async function saveTwilioIntegration\|export async function testTwilioConnection\|export async function getTwilioIntegration" src/app/actions/integrations.ts` para obtener las líneas exactas de inicio, y borrar desde el `export async function` hasta el `}` de cierre correspondiente (balanceo de llaves).

    3. **Actualizar el comentario de cabecera del archivo (líneas 1-6):** cambiar algo como:
       ```typescript
       // Phase 20: Integration Server Actions (Twilio + Shopify Extensions)
       // Manages Twilio credentials, test connection, SMS usage queries, ...
       ```
       A:
       ```typescript
       // Integration Server Actions (Shopify + SMS Onurix usage reporting)
       // Manages Shopify integration state + SMS (Onurix) usage/chart queries.
       ```

    4. **Adaptar `getSmsUsage(workspaceId, startDate, endDate)` a Onurix:**

       Reemplazar la query que hoy filtra por `provider = 'twilio'` o accede a `price_unit='USD'` por una que:
       - Consulte `sms_messages` filtrando `provider = 'onurix'` AND `workspace_id = ?` AND rango de fechas.
       - Agregue:
         - `total_sms`: `COUNT(*)`
         - `total_cost_cop`: `SUM(cost_cop)` (Onurix almacena COP enteros, no USD)
         - `delivered`: `COUNT(*) WHERE status='delivered'`
         - `failed`: `COUNT(*) WHERE status='failed'`
         - `pending`: `COUNT(*) WHERE status='pending'`
       - Devolver `{ totalSms, totalCostCop, delivered, failed, pending }` (ajustar signature si antes devolvía `price_usd`).

       Si la función original tenía caller(s) en UI, verificar con `grep -rn "getSmsUsage" src/` y actualizar cualquier consumer que use `price_usd` para que use `totalCostCop` (entero COP). Los consumers actuales (`twilio-usage.tsx`) se eliminan en Plan 03 — dejar la signature nueva aquí, el Plan 03 construye el nuevo componente sobre ella.

    5. **Adaptar `getSmsUsageChart(workspaceId, days)` a Onurix:**

       Filtrar por `provider='onurix'`, agrupar por día (`timezone('America/Bogota', created_at)`), devolver array `{ date, count, cost_cop }` para los últimos `days` días.

       Usar `createClient()` (server) si ya se usa en getSmsUsage — mantener consistencia; si cualquier función necesita bypass RLS, `createAdminClient()` desde `@/lib/supabase/admin` (ya hay precedente en domain layer).

    **C. Eliminar `checkTwilioConfigured` de `src/app/actions/automations.ts` y agregar `checkSmsConfigured`:**

    1. **Eliminar** la función `checkTwilioConfigured` (líneas 944-964) y su comentario JSDoc (línea 940-943).

    2. **Agregar** `checkSmsConfigured` después de donde estaba (misma zona del archivo). Código literal (basado en RESEARCH.md §Example 6):

       ```typescript
       /**
        * Check if SMS (Onurix) is configured and active for the current workspace.
        * Returns { configured: boolean, balance: number | null, hasBalance: boolean }
        * Used by the automations wizard to show configuration warnings.
        */
       export async function checkSmsConfigured(): Promise<{
         configured: boolean
         balance: number | null
         hasBalance: boolean
       }> {
         const ctx = await getAuthContext()
         if (!ctx) return { configured: false, balance: null, hasBalance: false }

         const { supabase, workspaceId } = ctx

         const { data, error } = await supabase
           .from('sms_workspace_config')
           .select('is_active, balance_cop')
           .eq('workspace_id', workspaceId)
           .maybeSingle()

         if (error || !data) {
           return { configured: false, balance: null, hasBalance: false }
         }

         const MINIMUM_BALANCE = 97 // SMS_PRICE_COP -- one segment

         return {
           configured: data.is_active,
           balance: data.balance_cop,
           hasBalance: data.balance_cop >= MINIMUM_BALANCE,
         }
       }
       ```

       Notas:
       - Usar `getAuthContext()` si ya existe en el archivo (grep primero); si el patrón existente del archivo usa un helper distinto (ej. `createClient()` + `auth.getUser()`), adaptar al patrón exacto del archivo, manteniendo la lógica (consulta a `sms_workspace_config` por `workspace_id`).
       - NO renombrar el archivo — sigue siendo `src/app/actions/automations.ts`.
       - Regla 3 honrada: la server action usa RLS client del server (o admin si el patrón existente del archivo lo requiere).
  </action>
  <verify>
    <automated>test ! -f src/app/api/webhooks/twilio/status/route.ts</automated>
    <automated>test ! -d src/app/api/webhooks/twilio</automated>
    <automated>grep -q "saveTwilioIntegration\|testTwilioConnection\|getTwilioIntegration\|checkTwilioConfigured" src/ -r 2>/dev/null; [ $? -ne 0 ]</automated>
    <automated>grep -q "export async function checkSmsConfigured" src/app/actions/automations.ts</automated>
    <automated>grep -q "sms_workspace_config" src/app/actions/automations.ts</automated>
    <automated>grep -q "provider.*onurix\|'onurix'" src/app/actions/integrations.ts</automated>
    <automated>grep -qE "from '@/lib/twilio" src/app/actions/integrations.ts && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/api/webhooks/twilio/status/route.ts` eliminado; directorio `src/app/api/webhooks/twilio/` no existe.
    - `src/app/actions/integrations.ts` ya no exporta `saveTwilioIntegration`, `testTwilioConnection`, `getTwilioIntegration` (grep 0 matches).
    - `src/app/actions/integrations.ts` ya no importa de `@/lib/twilio/*` (grep 0 matches).
    - `getSmsUsage` y `getSmsUsageChart` en integrations.ts filtran por `provider='onurix'` (grep encuentra literal).
    - `src/app/actions/automations.ts` ya no tiene `checkTwilioConfigured` (grep 0 matches).
    - `src/app/actions/automations.ts` tiene export `checkSmsConfigured` que consulta `sms_workspace_config`.
    - `pnpm typecheck` NO se evalúa en este task — es gate a nivel de wave (ver nota en `<objective>`). El orquestador `gsd-execute-phase` lo corre una vez Plan 02 + Plan 03 hayan mergeado.
  </acceptance_criteria>
  <done>
    - Webhook eliminado
    - Funciones Twilio eliminadas de integrations.ts
    - getSmsUsage / getSmsUsageChart reciben provider='onurix'
    - checkSmsConfigured agregado en automations.ts
    - Commit atómico: `refactor(twilio-migration): reemplazar funciones Twilio por Onurix en server actions + eliminar webhook`
  </done>
</task>

</tasks>

<verification>
- `grep -rn "from '@/lib/twilio\|executeSendSmsTwilio\|executeSendSmsOnurix\|send_sms_onurix\|getTwilioConfig\|createTwilioClient\|checkTwilioConfigured\|saveTwilioIntegration\|testTwilioConnection\|getTwilioIntegration" src/` devuelve 0 matches después de Plan 02 COMPLETO.
- `src/lib/twilio/` y `src/app/api/webhooks/twilio/` no existen.
- `pnpm typecheck` pasa en archivos que no son `actions-step.tsx` (este sigue teniendo imports legacy hasta Plan 03). Typecheck verde completo requiere Plan 03 mergeado.
- `getSmsUsage` y `getSmsUsageChart` funcionan con el nuevo schema Onurix.
</verification>

<success_criteria>
- Backend 100% sin referencias Twilio.
- Action executor rutea a domain layer (Regla 3 honrada).
- Server actions adaptadas al modelo `sms_workspace_config` + `sms_messages.provider='onurix'`.
- Commits atómicos (Task 1 y Task 2 son commits separados).
</success_criteria>

<output>
After completion, create `.planning/standalone/twilio-to-onurix-migration/02-SUMMARY.md` documenting:
- Archivos eliminados (lista)
- Funciones reemplazadas (old → new)
- Signature nueva de getSmsUsage / getSmsUsageChart
- Confirmación de grep 0 matches
- Issue conocido: typecheck de `actions-step.tsx` sigue rojo hasta que Plan 03 termine (esperado por división en paralelo)
</output>
