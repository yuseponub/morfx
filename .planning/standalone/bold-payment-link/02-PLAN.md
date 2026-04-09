---
phase: bold-payment-link
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/bold/types.ts
  - src/lib/bold/client.ts
  - src/app/actions/bold.ts
  - src/app/actions/integrations.ts
  - src/app/(dashboard)/configuracion/integraciones/page.tsx
  - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
  - src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
autonomous: true

must_haves:
  truths:
    - "Admin/owner puede guardar username + password de BOLD por workspace en la tabla integrations con type='bold'"
    - "Server action createPaymentLinkAction() llama al robot Railway via HTTP y devuelve la URL"
    - "Botón 'Cobrar con BOLD' aparece en chat-header.tsx a la derecha de los toggles de agentes (sólo si BOLD está configurado)"
    - "Modal del botón captura monto, descripción y muestra el link generado con botón copiar"
    - "Errores del robot (credenciales inválidas, timeout) se muestran legibles en el modal"
  artifacts:
    - path: "src/lib/bold/types.ts"
      provides: "Tipos TS para BOLD config y request/response del robot"
      exports: ["BoldConfig", "CreatePaymentLinkInput", "CreatePaymentLinkResponse"]
    - path: "src/lib/bold/client.ts"
      provides: "Wrapper de fetch para llamar al robot Railway"
      exports: ["callBoldRobot"]
    - path: "src/app/actions/bold.ts"
      provides: "Server actions: guardar config, leer config, generar link"
      exports: ["saveBoldIntegration", "getBoldIntegration", "createPaymentLinkAction"]
    - path: "src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx"
      provides: "Formulario para guardar credenciales BOLD"
    - path: "src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx"
      provides: "Botón + modal para generar link desde el chat"
  key_links:
    - from: "src/app/actions/bold.ts"
      to: "tabla integrations (type='bold')"
      via: "createAdminClient + workspace_id filter"
      pattern: "createAdminClient.*integrations"
    - from: "src/app/actions/bold.ts"
      to: "Railway bold-robot"
      via: "fetch POST /api/create-link"
      pattern: "callBoldRobot"
    - from: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      to: "BoldPaymentLinkButton"
      via: "import + render entre toggles agentes y botón GoDentist"
      pattern: "BoldPaymentLinkButton"
---

<objective>
Integración Next.js completa del robot BOLD: credenciales por workspace, UI de configuración, y botón en el header de conversación WhatsApp. Depende de tener el robot Plan 01 desplegado y funcional en Railway.

Output: Nueva tab "BOLD" en /configuracion/integraciones para guardar credenciales, y botón "Cobrar con BOLD" en chat-header.tsx que abre un modal con monto/descripción, llama al robot, y muestra la URL generada.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-payment-link/CONTEXT.md — Decisiones + arquitectura
@.planning/standalone/bold-payment-link/01-PLAN.md — Plan del robot (dependencia de este plan)
@src/app/actions/integrations.ts — Patrón getIntegrationAuthContext + canManageIntegrations + saveTwilioIntegration (L20-160)
@src/app/actions/shopify.ts — Patrón getShopifyIntegration (L24-44)
@src/lib/twilio/types.ts — Patrón TwilioConfig
@src/app/(dashboard)/configuracion/integraciones/page.tsx — UI tabs (L66-171)
@src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx — Patrón form
@src/app/(dashboard)/whatsapp/components/chat-header.tsx — L240-263 lugar del botón
</context>

<prerequisites>
  - Plan 01 completado: robot desplegado en Railway con URL pública
  - URL del robot conocida (ej: `https://bold-robot-production.up.railway.app`)
  - Credenciales reales de BOLD disponibles para testing del flow end-to-end
</prerequisites>

<tasks>

<task type="auto">
  <name>Task 1: Env var del robot URL</name>
  <files>
    .env.example
    .env.local
  </files>
  <action>
    Agregar a `.env.example` (y pedir al usuario que agregue a `.env.local` y Vercel):
    ```
    # BOLD Robot (Railway Playwright service)
    BOLD_ROBOT_URL=https://bold-robot-production.up.railway.app
    ```

    ⚠️ **Action del usuario:** Setear `BOLD_ROBOT_URL` en Vercel environment variables (Settings → Environment Variables → Production + Preview + Development) con la URL real del robot desplegado en Plan 01.
  </action>
  <verify>
    - `.env.example` actualizado
    - Usuario confirmó que `BOLD_ROBOT_URL` está en Vercel
  </verify>
</task>

<task type="auto">
  <name>Task 2: Tipos + cliente HTTP del robot</name>
  <files>
    src/lib/bold/types.ts
    src/lib/bold/client.ts
  </files>
  <action>
    **`src/lib/bold/types.ts`:**
    ```ts
    export interface BoldConfig {
      username: string
      password: string
    }

    export interface CreatePaymentLinkInput {
      amount: number
      description: string
    }

    export interface CreatePaymentLinkResponse {
      url: string
    }

    export class BoldRobotError extends Error {
      constructor(message: string, public hint?: string) { super(message) }
    }
    ```

    **`src/lib/bold/client.ts`:**
    ```ts
    import { BoldConfig, CreatePaymentLinkInput, CreatePaymentLinkResponse, BoldRobotError } from './types'

    const ROBOT_TIMEOUT_MS = 60000 // 60s — Playwright flow puede tardar 15-30s

    export async function callBoldRobot(
      config: BoldConfig,
      input: CreatePaymentLinkInput
    ): Promise<CreatePaymentLinkResponse> {
      const robotUrl = process.env.BOLD_ROBOT_URL
      if (!robotUrl) {
        throw new BoldRobotError('BOLD_ROBOT_URL no configurado en el servidor')
      }

      if (!input.amount || input.amount <= 0) {
        throw new BoldRobotError('Monto inválido')
      }
      if (!input.description?.trim()) {
        throw new BoldRobotError('Descripción requerida')
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), ROBOT_TIMEOUT_MS)

      try {
        const res = await fetch(`${robotUrl}/api/create-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: config.username,
            password: config.password,
            amount: Math.floor(input.amount),
            description: input.description.trim()
          }),
          signal: controller.signal
        })

        const data = await res.json()

        if (!res.ok) {
          throw new BoldRobotError(data.error || `Robot respondió ${res.status}`, data.hint)
        }

        if (!data.url || !data.url.includes('checkout.bold.co')) {
          throw new BoldRobotError('Robot no devolvió una URL válida')
        }

        return { url: data.url }
      } catch (err) {
        if (err instanceof BoldRobotError) throw err
        if ((err as Error).name === 'AbortError') {
          throw new BoldRobotError('El robot tardó demasiado (>60s). Intenta de nuevo.')
        }
        throw new BoldRobotError(`Error llamando al robot: ${(err as Error).message}`)
      } finally {
        clearTimeout(timeout)
      }
    }
    ```
  </action>
  <verify>
    - `src/lib/bold/types.ts` exports BoldConfig, CreatePaymentLinkInput, CreatePaymentLinkResponse, BoldRobotError
    - `src/lib/bold/client.ts` exports callBoldRobot
    - `npx tsc --noEmit` pasa
  </verify>
</task>

<task type="auto">
  <name>Task 3: Exportar helpers de auth de integrations.ts</name>
  <files>
    src/app/actions/integrations.ts
  </files>
  <action>
    Hacer `export` en `getIntegrationAuthContext` (L20) y `canManageIntegrations` (L55) para reusar desde `bold.ts`. Solo agregar la keyword `export`, no cambiar firma ni lógica.
  </action>
  <verify>
    - Las dos funciones están exportadas
    - `npx tsc --noEmit` pasa
    - Imports existentes en integrations.ts siguen funcionando
  </verify>
</task>

<task type="auto">
  <name>Task 4: Server actions de BOLD</name>
  <files>
    src/app/actions/bold.ts
  </files>
  <action>
    Crear `src/app/actions/bold.ts` con `'use server'`. Importar helpers exportados en Task 3.

    **Funciones:**

    1. `saveBoldIntegration({ username, password }): Promise<{ success: boolean; error?: string }>`
       - Auth + canManageIntegrations
       - Validar username y password no vacíos
       - Upsert en `integrations` con `type='bold'`, `config={ username, password }`, `is_active=true`
       - Patrón idéntico a `saveTwilioIntegration` (L63-160 de integrations.ts)
       - `revalidatePath('/configuracion/integraciones')` al final

    2. `getBoldIntegration(): Promise<{ id: string; config: BoldConfig; isActive: boolean } | null>`
       - Auth (sin requerir admin)
       - SELECT en `integrations` por workspace_id + type='bold' .single()
       - Retorna null si no existe

    3. `createPaymentLinkAction({ amount, description }): Promise<{ success: true; url: string } | { success: false; error: string }>`
       - Auth (cualquier miembro del workspace)
       - Llama `getBoldIntegration()` — si null → `{ success: false, error: 'BOLD no configurado' }`
       - Llama `callBoldRobot(config, { amount, description })`
       - Try/catch BoldRobotError → retorna `{ success: false, error: err.message }`
       - Si todo OK → retorna `{ success: true, url }`

    Todas las funciones deben usar `createAdminClient()` para escrituras (bypass RLS) y filtrar por workspace_id, per CLAUDE.md Regla 3.
  </action>
  <verify>
    - `src/app/actions/bold.ts` exports las 3 funciones
    - Las 3 validan workspace_id desde cookie morfx_workspace
    - `createPaymentLinkAction` nunca retorna URL si el robot falló
    - `npx tsc --noEmit` pasa
  </verify>
</task>

<task type="auto">
  <name>Task 5: UI de configuración de credenciales BOLD</name>
  <files>
    src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
    src/app/(dashboard)/configuracion/integraciones/page.tsx
  </files>
  <action>
    **`bold-form.tsx`** (client component):
    - Copiar estructura de `twilio-form.tsx`
    - Dos inputs:
      - Username (email) — `type="email"`
      - Contraseña — `type="password"`
    - Botón "Guardar"
    - Submit → `saveBoldIntegration({ username, password })`
    - Estado con `useState` + toast/alert para éxito/error
    - Props: `initialUsername?: string` (la contraseña NO se prellenar por seguridad; mostrar placeholder "••••••••" si hay config guardada)
    - Aviso en el form: "Estas credenciales se usan para automatizar el panel web de BOLD mediante un robot Playwright. Se guardan en texto plano (deuda técnica heredada). No compartas esta cuenta con equipos grandes."

    **`page.tsx`** — Modificar:
    - Importar `BoldForm` y `getBoldIntegration`
    - En server-side: llamar `getBoldIntegration()` y pasar `initialUsername` al form
    - L66-75 (TabsList): agregar `<TabsTrigger value="bold">BOLD</TabsTrigger>` después de Twilio
    - Después de L171 (TabsContent Twilio): agregar `<TabsContent value="bold"><BoldForm initialUsername={...} /></TabsContent>`
  </action>
  <verify>
    - Tab "BOLD" visible en /configuracion/integraciones
    - Submit persiste en `integrations` (verificar: `SELECT * FROM integrations WHERE type='bold'`)
    - Refresh muestra el username guardado (password no)
    - Solo owner/admin pueden guardar
  </verify>
</task>

<task type="auto">
  <name>Task 6: Botón + modal en chat-header</name>
  <files>
    src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
    src/app/(dashboard)/whatsapp/components/chat-header.tsx
  </files>
  <action>
    **`bold-payment-link-button.tsx`** (client component):
    - Props: ninguno
    - Estado con `useState`:
      - `open: boolean` — modal
      - `boldConfigured: boolean | null` — null=loading
      - `amount: string`, `description: string` — form
      - `loading: boolean`
      - `error: string | null`
      - `resultUrl: string | null`
      - `copied: boolean`
    - `useEffect` inicial: llamar `getBoldIntegration()` via server action. Setea `boldConfigured = !!result`
    - Si `boldConfigured !== true` → no renderizar nada (botón oculto)
    - Botón con icono `CreditCard` (lucide), `size="sm"`, `variant="ghost"`, className matching GoDentist button: `h-8 gap-1 text-xs`
    - Title: "Generar link de pago BOLD"
    - Click → `setOpen(true)`
    - Modal (usar `Dialog` de shadcn, ver `src/components/ui/dialog.tsx`):
      - Title: "Cobrar con BOLD"
      - Si NO hay `resultUrl`:
        - Input número "Monto (COP)" — required, min 1
        - Textarea "Descripción" — required, placeholder "Ej: 1x ELIXIR DEL SUEÑO"
        - Botón "Generar link" → disabled si loading o campos vacíos
        - Si `error` → mostrar en rojo debajo
        - Mensaje bajo el botón: "⏱️ Puede tardar 15-30 segundos"
      - Si SÍ hay `resultUrl`:
        - Label: "Link generado:"
        - Input readonly con `value={resultUrl}` (full width, selectable)
        - Botón "Copiar" → `navigator.clipboard.writeText(resultUrl)` + `setCopied(true)` + reset después de 2s
        - Botón "Crear otro" → resetear form (amount, description, resultUrl, error)
    - Submit:
      - Validar amount > 0 y description no vacío
      - `setLoading(true)`
      - `const res = await createPaymentLinkAction({ amount: Number(amount), description })`
      - Si `res.success` → `setResultUrl(res.url)`
      - Si no → `setError(res.error)`
      - `setLoading(false)`
    - onClose del modal: resetear todo

    **`chat-header.tsx`** — Modificar:
    - Importar `BoldPaymentLinkButton`
    - Insertar `<BoldPaymentLinkButton />` justo después del cierre `</div>` del bloque `{agentConversational !== null && (...)}` (L263), antes del bloque GoDentist (L265-266). El botón se auto-oculta si BOLD no está configurado, así que no necesita guard adicional.
  </action>
  <verify>
    - Workspace SIN BOLD: el botón NO aparece
    - Workspace CON BOLD: el botón aparece en header
    - Click abre modal con 2 inputs
    - Submit con datos válidos llama al robot y retorna URL real en 15-30s
    - URL aparece en input readonly + botón copiar funcional
    - "Crear otro" resetea el form
    - Errores del robot se muestran legibles
    - Cerrar y reabrir modal resetea estado
  </verify>
</task>

</tasks>

<verification_loop>
  Manual UAT end-to-end:
  1. Login como owner en el dashboard
  2. Ir a /configuracion/integraciones → tab BOLD → llenar username + password reales → Guardar → ver confirmación
  3. Ir a /whatsapp, abrir cualquier conversación
  4. Verificar que aparece botón "Cobrar con BOLD" en header a la derecha de los toggles de agentes
  5. Click → modal abre
  6. Llenar monto=10000, descripción="Test 1x ELIXIR" → Generar link
  7. Esperar 15-30s → URL aparece
  8. Click "Copiar" → verificar que se copió al clipboard
  9. Abrir URL en otra pestaña → debe cargar checkout real de BOLD con $10.000 y descripción correcta
  10. "Crear otro" → form se resetea → probar de nuevo con otros datos
  11. Probar caso de error: cambiar password en configuración a uno inválido → intentar generar link → debe mostrar error legible
  12. Workspace sin BOLD configurado: confirmar que botón NO aparece
</verification_loop>

<commits>
  - feat(bold): tipos + cliente HTTP para robot Playwright en Railway
  - refactor(integrations): exportar helpers de auth para reuso
  - feat(bold): server actions saveBoldIntegration, getBoldIntegration, createPaymentLinkAction
  - feat(bold): UI de configuración en /configuracion/integraciones
  - feat(bold): botón + modal Cobrar con BOLD en header de conversación WhatsApp
</commits>
