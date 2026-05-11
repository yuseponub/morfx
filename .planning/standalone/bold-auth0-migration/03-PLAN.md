---
phase: bold-auth0-migration
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/bold/client.ts
  - src/app/actions/bold.ts
  - src/inngest/functions/bold-upstream-broken.ts
  - src/app/api/inngest/route.ts
autonomous: true
requirements: [D-07]

must_haves:
  truths:
    - "callBoldRobot acepta workspaceId en su input signature y lo recibe desde createPaymentLinkAction"
    - "Cuando callBoldRobot lanza un error que matchea REGRESSION_SIGNATURES (timeout locator / login falló / MFA requerido / sigue en auth.bold.co), se incrementa un counter en platform_config.bold_robot_failure_count"
    - "callBoldRobot success resetea el counter a 0 (recordSuccess)"
    - "Cuando el counter alcanza 3 consecutivos, se dispara await (inngest.send as any)({ name: 'bold-robot/upstream-broken', data: {...} }) y el counter se resetea"
    - "Nueva inngest function `boldUpstreamBroken` (id: 'bold-upstream-broken') existe en src/inngest/functions/bold-upstream-broken.ts y se registra en src/app/api/inngest/route.ts dentro del array `functions`"
    - "boldUpstreamBroken usa concurrency limit 1 (single-flight) y escribe en agent_observability_events con event_type='bold_robot_upstream_broken'"
  artifacts:
    - path: "src/lib/bold/client.ts"
      provides: "callBoldRobot extendido con failure counter + inngest event"
      contains: "bold_robot_failure_count"
    - path: "src/lib/bold/client.ts"
      provides: "Workspace id propagation"
      contains: "workspaceId"
    - path: "src/inngest/functions/bold-upstream-broken.ts"
      provides: "Inngest handler boldUpstreamBroken"
      contains: "export const boldUpstreamBroken"
    - path: "src/app/api/inngest/route.ts"
      provides: "boldUpstreamBroken registered"
      contains: "boldUpstreamBroken"
  key_links:
    - from: "src/app/actions/bold.ts createPaymentLinkAction"
      to: "src/lib/bold/client.ts callBoldRobot"
      via: "explicit workspaceId argument"
      pattern: "workspaceId: ctx\\.workspaceId"
    - from: "src/lib/bold/client.ts recordFailureAndMaybeAlert"
      to: "Inngest event bold-robot/upstream-broken"
      via: "await (inngest.send as any)({...}) — never fire-and-forget on Vercel (Pitfall 8)"
      pattern: "bold-robot/upstream-broken"
    - from: "src/inngest/functions/bold-upstream-broken.ts"
      to: "Supabase agent_observability_events"
      via: "step.run('log-to-observability', ...) insert"
      pattern: "bold_robot_upstream_broken"
---

<objective>
Implementar telemetría reactiva (D-07): cuando el robot BOLD falla 3+ veces consecutivas con un error que matchea la firma de "upstream cambió" (timeout locator, login falló, MFA requerido, sigue en auth.bold.co), disparar un evento Inngest `bold-robot/upstream-broken` que:
1. Persiste un registro en `agent_observability_events` con detalles del fallo.
2. (Stub para futuro) abre la puerta a notificar al operator vía WhatsApp template.

Esto convierte "enterarse del bug por reporte de cliente 24h después" en "enterarse <5min después del primer fallo".

Strategy (per RESEARCH §"Example 5" + Example 6 + Pitfall 8):
- Tabla `platform_config` ya existe en Supabase y es usada por otros flags (knowledge-sync-v4, etc.) — usar singleton key `bold_robot_failure_count`.
- Counter es **global** (no workspace-scoped) — tech debt aceptado per RESEARCH §Open Questions Q3 (current setup es single-tenant BOLD).
- `await (inngest.send as any)({...})` — el cast es el patrón establecido del codebase para custom event names.
- `boldUpstreamBroken` registra en `agent_observability_events`; envío WhatsApp template es follow-up explícito en TODO comment.

Output: 4 archivos modificados — 1 nuevo file (`bold-upstream-broken.ts`), 1 update a `route.ts` (register), 1 update a `client.ts` (counter + signature), 1 update a `bold.ts` (thread workspaceId).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-auth0-migration/CONTEXT.md
@.planning/standalone/bold-auth0-migration/RESEARCH.md
@src/lib/bold/client.ts
@src/lib/bold/types.ts
@src/app/actions/bold.ts
@src/app/api/inngest/route.ts
@src/inngest/functions/knowledge-sync-v4.ts
@CLAUDE.md
</context>

<interfaces>
<!-- Existing callBoldRobot signature (src/lib/bold/client.ts line 22-24, MUST be extended): -->
```typescript
export async function callBoldRobot(
  input: CreatePaymentLinkInput
): Promise<CreatePaymentLinkResponse>
```

<!-- AFTER this plan (signature extended): -->
```typescript
export async function callBoldRobot(
  input: CreatePaymentLinkInput & { workspaceId: string }
): Promise<CreatePaymentLinkResponse>
```

<!-- Current call site (src/app/actions/bold.ts line 172-179, MUST be extended): -->
```typescript
const result = await callBoldRobot({
  username: config.username,
  password: config.password,
  amount: input.amount,
  description: input.description.trim(),
  ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
})
```

<!-- AFTER (add workspaceId from `ctx.workspaceId` available earlier in createPaymentLinkAction): -->
<!-- The ctx variable is established earlier (see lines 52, 74, 107, 154 — `ctx.workspaceId`) -->

<!-- Existing inngest client import path: '@/inngest/client' (consistent across functions/) -->

<!-- agent_observability_events table schema (used by recompra-preload-context, pw-confirmation-preload-and-invoke, godentist-reminders): -->
```typescript
{
  workspace_id: string  // uuid (nullable when system-wide event — set to data.workspaceId)
  event_type: string    // 'bold_robot_upstream_broken' for this plan
  agent_id: string      // 'bold-robot' for this plan
  payload: jsonb        // arbitrary
}
```

<!-- platform_config schema (used by knowledge-sync-v4.ts, unknown-cases-cluster-v4.ts): -->
```typescript
{ key: string, value: jsonb }  // PK on key; upsert via onConflict: 'key'
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend callBoldRobot with failure counter + inngest fire (RESEARCH Example 5)</name>
  <read_first>
    - `src/lib/bold/client.ts` (full file — 74 lines; verify current `callBoldRobot` signature, fetch logic, and error handling)
    - `src/lib/bold/types.ts` (verify CreatePaymentLinkInput shape — does it currently include workspaceId? If not, we add it inline in callBoldRobot via intersection type)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 5 — Failure counter + Inngest event (D-07)" (lines 802-884)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Pitfall 8: Vercel serverless drops unawaited inngest.send" (lines 514-520)
    - `src/inngest/functions/knowledge-sync-v4.ts` lines 55-70 — established platform_config read/upsert pattern in this codebase
    - `src/inngest/client.ts` (existing inngest client — verify export shape)
  </read_first>
  <files>src/lib/bold/client.ts</files>
  <action>
    Reescribir `src/lib/bold/client.ts` para:

    1. **Imports nuevos** al inicio (después de los existentes):
       ```typescript
       import { inngest } from '@/inngest/client'
       import { createAdminClient } from '@/lib/supabase/admin'
       ```

    2. **Helpers privados** (definidos al nivel module, NO exportados — entre los imports y el `export async function callBoldRobot`):
       ```typescript
       const REGRESSION_SIGNATURES = [
         /Timeout.*waiting for locator/i,
         /Login falló/i,
         /BOLD ahora requiere MFA/i,
         /Playwright sigue en auth\.bold\.co/i,
       ]

       function looksLikeUpstreamRegression(errorMessage: string): boolean {
         return REGRESSION_SIGNATURES.some(rx => rx.test(errorMessage))
       }

       async function recordFailureAndMaybeAlert(errorMessage: string, workspaceId: string) {
         if (!looksLikeUpstreamRegression(errorMessage)) return

         // Use Supabase `platform_config` as a simple distributed counter.
         // Key format: `bold_robot_failure_count` (singleton across all workspaces;
         // 3 consecutive failures from ANY workspace = upstream issue).
         const supabase = createAdminClient()
         const { data } = await supabase
           .from('platform_config')
           .select('value')
           .eq('key', 'bold_robot_failure_count')
           .single()

         const currentCount = (data?.value as number) ?? 0
         const newCount = currentCount + 1

         await supabase
           .from('platform_config')
           .upsert({ key: 'bold_robot_failure_count', value: newCount }, { onConflict: 'key' })

         if (newCount >= 3) {
           // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early — Pitfall 8)
           await (inngest.send as any)({
             name: 'bold-robot/upstream-broken',
             data: {
               consecutiveFailures: newCount,
               lastErrorMessage: errorMessage.slice(0, 500),
               workspaceId,
               detectedAt: new Date().toISOString(),
             },
           })
           // Reset counter so we don't spam — next 3 failures will re-trigger
           await supabase
             .from('platform_config')
             .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
         }
       }

       async function recordSuccess() {
         // Reset counter on any successful call
         const supabase = createAdminClient()
         await supabase
           .from('platform_config')
           .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
       }
       ```

    3. **Modificar la signature** de `callBoldRobot` para aceptar `workspaceId`:
       ```typescript
       export async function callBoldRobot(
         input: CreatePaymentLinkInput & { workspaceId: string }
       ): Promise<CreatePaymentLinkResponse> {
         // ... mantener TODO el body existente intacto excepto los try/catch wrappers que envuelven el fetch ...
       }
       ```

    4. **Envolver el fetch existente** con `await recordSuccess()` en el happy path y `await recordFailureAndMaybeAlert(message, input.workspaceId).catch(() => {})` en el catch:

       En el `try { ... }` actual (líneas 32-60), DESPUÉS de la línea `return result` (línea 60) — en realidad antes de retornar — agregar `await recordSuccess()`.

       En el `catch (error) { ... }` actual (líneas 61-70), ANTES de relanzar el error, agregar:
       ```typescript
       const message = error instanceof Error ? error.message : String(error)
       await recordFailureAndMaybeAlert(message, input.workspaceId).catch(() => {})
       ```

       El `.catch(() => {})` es defensivo: si la DB está caída, NO queremos enmascarar el error original de BOLD — propagamos siempre el error original.

    Reglas:
    - **NO MODIFICAR** el flow del fetch (request body, AbortController, timeout, JSON parsing, error mapping). SOLO añadir las dos llamadas (`recordSuccess` y `recordFailureAndMaybeAlert`) en los lugares apropiados.
    - **NO añadir** workspaceId al BODY del fetch al robot — el robot no lo necesita. SOLO se usa en el counter/event.
    - `(inngest.send as any)` cast es el patrón establecido — `inngest.send` no permite custom event names por default en TS estricto, pero los demás archivos del codebase usan este cast (ver memory `inngest_observability_merge.md`).
    - El counter resetea a 0 INMEDIATAMENTE después de disparar el evento (línea 854 RESEARCH) — sin esto, los próximos 3 fallos en 5min spamean events.
    - El imports `createAdminClient` viene de `@/lib/supabase/admin` (path canónico del proyecto — verificar en otros archivos del codebase si hay duda).
  </action>
  <acceptance_criteria>
    - `grep -c "REGRESSION_SIGNATURES" src/lib/bold/client.ts` retorna ≥1
    - `grep -c "looksLikeUpstreamRegression" src/lib/bold/client.ts` retorna ≥1
    - `grep -c "recordFailureAndMaybeAlert" src/lib/bold/client.ts` retorna ≥2 (definition + call)
    - `grep -c "recordSuccess" src/lib/bold/client.ts` retorna ≥2 (definition + call)
    - `grep -c "bold_robot_failure_count" src/lib/bold/client.ts` retorna ≥3 (select + upsert + reset upsert)
    - `grep -c "await (inngest.send as any)" src/lib/bold/client.ts` retorna ≥1 (Pitfall 8 mitigation — awaited)
    - `grep -c "'bold-robot/upstream-broken'" src/lib/bold/client.ts` retorna ≥1
    - `grep -c "workspaceId" src/lib/bold/client.ts` retorna ≥4 (signature, event data, recordFailure call, recordFailure param)
    - `grep -c "input: CreatePaymentLinkInput & { workspaceId: string }" src/lib/bold/client.ts` retorna 1
    - `grep -c "newCount >= 3" src/lib/bold/client.ts` retorna 1
    - `grep -c "Pitfall 8" src/lib/bold/client.ts` retorna ≥1 (comment ref preserved)
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc pasa; signature de callBoldRobot ahora requiere workspaceId; ya hay counter + inngest fire awaited.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Thread workspaceId through createPaymentLinkAction call site</name>
  <read_first>
    - `src/app/actions/bold.ts` lines 130-190 — verify the `createPaymentLinkAction` function, the `ctx` object that has `.workspaceId` (used at lines 52, 74, 107, 154), and the current `callBoldRobot` invocation at lines 172-179
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 5 — Failure counter + Inngest event (D-07)" final note: "The existing `callBoldRobot` signature does NOT include `workspaceId`. The planner needs to thread it through from `createPaymentLinkAction` (`src/app/actions/bold.ts:172-179`) — easy 1-line change."
  </read_first>
  <files>src/app/actions/bold.ts</files>
  <action>
    En `src/app/actions/bold.ts`, modificar la invocación de `callBoldRobot` (líneas 172-179) para pasar `workspaceId`. El objeto `ctx` (con `ctx.workspaceId`) ya está disponible — está siendo usado en líneas 52, 74, 107, 154 dentro de las otras funciones, y dentro de `createPaymentLinkAction` el patrón debe ser idéntico (auth context establecido al inicio de la función).

    Cambio:
    ```typescript
    // ANTES (líneas 172-179):
    const result = await callBoldRobot({
      username: config.username,
      password: config.password,
      amount: input.amount,
      description: input.description.trim(),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    })

    // DESPUÉS:
    const result = await callBoldRobot({
      username: config.username,
      password: config.password,
      amount: input.amount,
      description: input.description.trim(),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      workspaceId: ctx.workspaceId,
    })
    ```

    Reglas:
    - **NO RENAME** del `ctx` ni `input`. Solo agregar la línea `workspaceId: ctx.workspaceId,`.
    - **NO MODIFICAR** otras funciones (`saveBoldIntegration`, `getBoldIntegration`) — sus contratos quedan intactos.
    - **NO MODIFICAR** `checkBoldRobotHealth` añadido por Plan 02 (este plan corre en wave 2 paralela — si Plan 02 ya commiteó, el archivo tiene `checkBoldRobotHealth`; si no, no hay conflicto porque tocamos un bloque distinto).
    - Si `ctx.workspaceId` no está disponible en el scope de `createPaymentLinkAction` (porque la función obtiene auth de otra forma), abrir el archivo y verificar — los otros call sites (líneas 52, 74, 107, 154) son el patrón confirmado.
  </action>
  <acceptance_criteria>
    - `grep -c "workspaceId: ctx.workspaceId" src/app/actions/bold.ts` retorna ≥1 (la línea añadida)
    - `grep -A 10 "await callBoldRobot" src/app/actions/bold.ts | grep -c "workspaceId"` retorna ≥1 (within the callBoldRobot invocation)
    - `npx tsc --noEmit` exit 0 (verifica que el nuevo type intersection requirement de callBoldRobot se satisface)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc pasa; createPaymentLinkAction ahora pasa workspaceId al callBoldRobot.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create inngest function boldUpstreamBroken</name>
  <read_first>
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 6 — Inngest handler `bold-upstream-broken.ts` (D-07 alert receiver)" (lines 886-934)
    - `src/inngest/functions/recompra-preload-context.ts` (existing pattern: createFunction + step.run + agent_observability_events insert)
    - `src/inngest/functions/godentist-reminders.ts` (existing pattern for concurrency limits + retries)
    - `src/lib/audit/logger.ts` (existing logger helper — `createModuleLogger`)
  </read_first>
  <files>src/inngest/functions/bold-upstream-broken.ts</files>
  <action>
    Crear el archivo nuevo `src/inngest/functions/bold-upstream-broken.ts` con el contenido verbatim de RESEARCH Example 6:

    ```typescript
    import { inngest } from '../client'
    import { createAdminClient } from '@/lib/supabase/admin'
    import { createModuleLogger } from '@/lib/audit/logger'

    const logger = createModuleLogger('bold-upstream-broken')

    export const boldUpstreamBroken = inngest.createFunction(
      {
        id: 'bold-upstream-broken',
        name: 'BOLD Robot Upstream Broken — Alert Operator',
        retries: 1,
        // Single-flight: only one alert at a time across all workspaces
        concurrency: [{ key: '"bold-upstream-broken"', limit: 1 }],
      },
      { event: 'bold-robot/upstream-broken' },
      async ({ event, step }) => {
        const { consecutiveFailures, lastErrorMessage, workspaceId, detectedAt } = event.data

        logger.warn(
          { consecutiveFailures, workspaceId, detectedAt, lastErrorMessage },
          'BOLD upstream broken — alerting operator',
        )

        // Look up the workspace owner's phone for WhatsApp notification.
        // For now, log to agent_observability_events; WhatsApp template wire-up can be a follow-up.
        const supabase = createAdminClient()
        await step.run('log-to-observability', async () => {
          await supabase.from('agent_observability_events').insert({
            workspace_id: workspaceId,
            event_type: 'bold_robot_upstream_broken',
            agent_id: 'bold-robot',
            payload: { consecutiveFailures, lastErrorMessage, detectedAt },
          })
        })

        // TODO follow-up: send WhatsApp template `bold_robot_alert` to operator(s).
        // Out of scope for initial fix — observability log is sufficient for now.

        return { alerted: true }
      },
    )
    ```

    Reglas:
    - El import del cliente Inngest es `from '../client'` (path relativo) — match el patrón de las otras functions en `src/inngest/functions/`.
    - El `createModuleLogger` viene de `@/lib/audit/logger` (path alias canónico).
    - El concurrency key string-literal `'"bold-upstream-broken"'` (las comillas dobles dentro de comillas simples) es **intencional** — Inngest expression syntax requiere comillas para literales, ver `crm-bot-expire-proposals.ts` para precedente.
    - **NO ENVIAR** WhatsApp template aún — el TODO comment lo deja claro. Esto se podría hacer en un Plan 05 follow-up si el user quiere.
    - El `retries: 1` permite que un retry cubra fallos transitorios de DB.
    - El `step.run('log-to-observability', ...)` permite que Inngest retry idempotently este paso si falla.
  </action>
  <acceptance_criteria>
    - El archivo `src/inngest/functions/bold-upstream-broken.ts` existe
    - `grep -c "export const boldUpstreamBroken" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `grep -c "id: 'bold-upstream-broken'" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `grep -c "event: 'bold-robot/upstream-broken'" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `grep -c "'bold_robot_upstream_broken'" src/inngest/functions/bold-upstream-broken.ts` retorna 1 (event_type literal — must match grep on Plan 04)
    - `grep -c "agent_observability_events" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `grep -c "agent_id: 'bold-robot'" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `grep -c "concurrency" src/inngest/functions/bold-upstream-broken.ts` retorna 1
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Archivo creado, tsc pasa, todos los grep pasan.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Register boldUpstreamBroken in serve route</name>
  <read_first>
    - `src/app/api/inngest/route.ts` (full file — 88 lines; verify the import block ~L17-38 and the `functions:` array inside `serve({...})` ~L65-86)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 6" final note: "Don't forget: register the function in `src/inngest/index.ts` (wherever functions are exported)."
  </read_first>
  <files>src/app/api/inngest/route.ts</files>
  <action>
    Modificar `src/app/api/inngest/route.ts` para registrar la nueva función:

    **Cambio 1 — Import:** Agregar import después de los existentes (después de la línea ~38 `import { routingAuditCleanup } from ...`):

    ```typescript
    import { boldUpstreamBroken } from '@/inngest/functions/bold-upstream-broken'
    ```

    **Cambio 2 — Array `functions`:** Agregar `boldUpstreamBroken,` al array `functions:` dentro del `serve({...})`. Insertarlo entre los otros singletons (no-spread items) como `taskOverdueCron`, `closeStaleSessionsCron`, etc. (línea ~79-85). Sugerencia: agregarlo al final del array (después de `routingAuditCleanup,` línea 85) — ordenado por adición temporal como hacen los demás.

    Resultado esperado de la sección `functions:`:
    ```typescript
    functions: [
      ...agentTimerFunctions,
      ...agentProductionFunctions,
      // ... (todos los existentes intactos) ...
      routingAuditCleanup,
      boldUpstreamBroken,  // Standalone: bold-auth0-migration (D-07 — telemetry receiver)
    ],
    ```

    Reglas:
    - **NO TOCAR** ninguna otra entrada del array — todos los demás handlers quedan en orden y posición existente.
    - **NO MODIFICAR** los imports existentes — solo añadir el nuevo al final del bloque de imports.
    - Agregar el comentario `// Standalone: bold-auth0-migration (D-07 — telemetry receiver)` al lado para mantener consistencia con cómo route.ts documenta cada handler (ver línea 78 patrón pwConfirmationPreloadAndInvokeFunctions).
  </action>
  <acceptance_criteria>
    - `grep -c "import { boldUpstreamBroken }" src/app/api/inngest/route.ts` retorna 1
    - `grep -c "from '@/inngest/functions/bold-upstream-broken'" src/app/api/inngest/route.ts` retorna 1
    - `grep -c "boldUpstreamBroken," src/app/api/inngest/route.ts` retorna 1 (the entry in the functions array, with trailing comma)
    - `grep -A 30 "functions: \\[" src/app/api/inngest/route.ts | grep -c "boldUpstreamBroken"` retorna 1 (verifies it's inside the functions array, not just imported and unused)
    - `npx tsc --noEmit` exit 0
    - `npm run build` (Next.js build) compila sin errores nuevos — la inngest serve route es construible
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc pasa; el handler está importado y registrado en el array de funciones del serve route.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` exit 0
- Todos los acceptance_criteria de Tasks 1-4 pasan
- Manual smoke (post-deploy, requiere Plan 01 shipped):
  1. Inducir failure: Setear creds inválidas en `integrations`, intentar 3 veces generar link → en el 3er fallo debería dispararse el evento.
  2. Verificar Inngest dashboard (https://app.inngest.com/) → el run de `bold-upstream-broken` aparece.
  3. Verificar SQL: `SELECT * FROM agent_observability_events WHERE event_type='bold_robot_upstream_broken' ORDER BY created_at DESC LIMIT 1;` retorna 1 fila con payload poblado.
  4. Verificar SQL: `SELECT value FROM platform_config WHERE key='bold_robot_failure_count';` retorna 0 (reseteado tras disparar).
  5. Restaurar creds válidas + un call exitoso → `SELECT value FROM platform_config WHERE key='bold_robot_failure_count';` sigue siendo 0 (recordSuccess).
</verification>

<success_criteria>
Cuando el robot BOLD falle 3+ veces consecutivas con un error de "upstream changed" (locator timeout, login falló, MFA requerido, sigue en auth.bold.co), el evento Inngest se dispara, se loggea a `agent_observability_events`, y el counter se resetea automáticamente. El user puede consultar el dashboard de Inngest o el SQL para enterarse del problema sin esperar reporte de cliente.
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/bold-auth0-migration/03-SUMMARY.md` con:
- Files modified: src/lib/bold/client.ts, src/app/actions/bold.ts, src/inngest/functions/bold-upstream-broken.ts (new), src/app/api/inngest/route.ts
- Commits creados
- Inngest run ID del primer smoke artificial (si aplicable)
</output>
