---
phase: bold-auth0-migration
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/actions/bold.ts
  - src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
autonomous: true
requirements: [D-06]

must_haves:
  truths:
    - "Server action `checkBoldRobotHealth` existe en src/app/actions/bold.ts y hace GET /api/health al robot con 5s timeout"
    - "checkBoldRobotHealth está envuelto en unstable_cache con revalidate: 30s y tag 'bold-robot-health' para deduplicar entre operators (Pitfall 9 mitigation)"
    - "checkBoldRobotHealth NUNCA throws — siempre retorna { healthy: boolean, checkedAt: ISOString } incluso si el robot no responde"
    - "BoldPaymentLinkButton hace polling cada 60s del checkBoldRobotHealth mientras está montado (solo si isConfigured===true)"
    - "El botón muestra tooltip 'Temporalmente no disponible — BOLD actualizando login' cuando robotHealthy===false (D-06)"
    - "El botón queda visualmente disabled (opacity-50, cursor-not-allowed) cuando robotHealthy===false (D-06)"
  artifacts:
    - path: "src/app/actions/bold.ts"
      provides: "checkBoldRobotHealth server action exported"
      contains: "export const checkBoldRobotHealth"
    - path: "src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx"
      provides: "Health-poll integration + disabled state on UI button"
      contains: "robotHealthy"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx useEffect"
      to: "src/app/actions/bold.ts checkBoldRobotHealth"
      via: "import + setInterval(poll, 60_000)"
      pattern: "checkBoldRobotHealth\\(\\)"
    - from: "src/app/actions/bold.ts checkBoldRobotHealth"
      to: "bold-robot/api/health"
      via: "fetch with 5s AbortController"
      pattern: "robotUrl.*\\/api\\/health"
---

<objective>
Implementar la degradación UX pasiva (D-06): cuando el robot BOLD está caído (timeout, 5xx, env var no configurado), el botón "Cobrar con BOLD" queda disabled visualmente con tooltip explicativo, sin requerir acción del operador. Esto evita la cascada de reportes "no funciona" cuando upstream cambie de nuevo.

Strategy (per RESEARCH §"Pattern 3" + RESEARCH Example 3 + Example 4):
- Server action `checkBoldRobotHealth` con `unstable_cache(..., { revalidate: 30 })` — el resultado se cachea 30s entre operators, ahorrando egress (Pitfall 9 mitigation).
- Cliente component (`BoldPaymentLinkButton`) hace polling cada 60s mientras está montado.
- El botón se DESHABILITA pero NO se oculta (operator ve que la función existe, solo está pausada).

Output: 2 archivos modificados (`src/app/actions/bold.ts` + el button component). Cero migraciones, cero env vars nuevas, cero nuevas dependencias.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-auth0-migration/CONTEXT.md
@.planning/standalone/bold-auth0-migration/RESEARCH.md
@src/app/actions/bold.ts
@src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
</context>

<interfaces>
<!-- Existing exports in src/app/actions/bold.ts (DO NOT change): -->
- `getBoldIntegration(): Promise<BoldIntegration | null>`
- `saveBoldIntegration(input): Promise<{success, error?}>`
- `createPaymentLinkAction({amount, description, imageUrl}): Promise<{success: true, url} | {success: false, error}>`

<!-- Existing state in BoldPaymentLinkButton (line 31-38, all retained): -->
```typescript
const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
const [isOpen, setIsOpen] = useState(false)
const [amount, setAmount] = useState('')
const [description, setDescription] = useState('')
const [imageUrl, setImageUrl] = useState('')
const [linkState, setLinkState] = useState<BoldLinkState | null>(null)
const [copied, setCopied] = useState(false)
const [error, setError] = useState<string | null>(null)
```

<!-- Existing guard (line 75, DO NOT change): -->
```typescript
if (isConfigured !== true) return null
```

<!-- This plan ADDS:
  - One new export to bold.ts: `checkBoldRobotHealth` (uses unstable_cache from 'next/cache')
  - One new state in the button: `robotHealthy` (default true)
  - One new useEffect that polls on mount + interval 60s
  - Tooltip + disabled + opacity class on the Button JSX
-->
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add checkBoldRobotHealth server action with unstable_cache</name>
  <read_first>
    - `src/app/actions/bold.ts` (full file — verify `'use server'` directive, existing imports, and append point at EOF)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 3 — Server action `checkBoldRobotHealth` (D-06 health-check)" (lines 713-758)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Pitfall 9: Health-check endpoint is unauthenticated, can be DDoS'd" (lines 522-528)
    - `.planning/standalone/bold-auth0-migration/CONTEXT.md` D-06
  </read_first>
  <files>src/app/actions/bold.ts</files>
  <action>
    Append the following code verbatim al final de `src/app/actions/bold.ts` (después de `createPaymentLinkAction` que termina en línea ~190):

    ```typescript
    // ============================================================================
    // 4. Check BOLD Robot Health (D-06 passive UX degradation)
    // ============================================================================

    /**
     * Pings the BOLD robot /api/health endpoint with a 5s timeout.
     * Result is cached for 30s to dedupe across operators (Pitfall 9 mitigation).
     *
     * Consumed by BoldPaymentLinkButton to disable the button when robot is down.
     * Never throws — returns { healthy: false } on any error.
     *
     * @see RESEARCH.md Example 3 + Pitfall 9
     * @see CONTEXT.md D-06
     */
    export const checkBoldRobotHealth = unstable_cache(
      async (): Promise<{ healthy: boolean; checkedAt: string }> => {
        const robotUrl = process.env.BOLD_ROBOT_URL
        if (!robotUrl) {
          return { healthy: false, checkedAt: new Date().toISOString() }
        }
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 5_000)
        try {
          const res = await fetch(`${robotUrl}/api/health`, {
            method: 'GET',
            signal: ctl.signal,
            // Tell Next not to cache this fetch itself — we cache the action result instead
            cache: 'no-store',
          })
          return { healthy: res.ok, checkedAt: new Date().toISOString() }
        } catch {
          return { healthy: false, checkedAt: new Date().toISOString() }
        } finally {
          clearTimeout(timer)
        }
      },
      ['bold-robot-health'],
      { revalidate: 30, tags: ['bold-robot-health'] }
    )
    ```

    Y al inicio del archivo (después de los imports existentes en `src/app/actions/bold.ts`), agregar:

    ```typescript
    import { unstable_cache } from 'next/cache'
    ```

    Reglas:
    - **NO MODIFICAR** las funciones existentes (`saveBoldIntegration`, `getBoldIntegration`, `createPaymentLinkAction`). El comentario `// 4.` reconoce que las funciones existentes son 1/2/3.
    - **NO añadir** auth/workspace check — `checkBoldRobotHealth` no toca la DB, solo hace fetch al robot público. Cualquier usuario autenticado puede consultarlo. (Si el archivo ya tiene `'use server'` en línea 1 que sí aplica, OK — todo server action ya está scope server-only.)
    - **NO importar createAdminClient** ni Supabase — esta función NO consulta la DB.
    - `'use server'` directive (línea 1 del archivo) cubre este export automáticamente — no añadir directiva nueva.
    - El `cache: 'no-store'` en el fetch es importante: queremos que el FETCH al robot pase por la red cada 30s (cuando unstable_cache revalida). Si lo cacheamos también a nivel fetch, podríamos tener stale-stale.
  </action>
  <acceptance_criteria>
    - `grep -c "export const checkBoldRobotHealth" src/app/actions/bold.ts` retorna 1
    - `grep -c "unstable_cache" src/app/actions/bold.ts` retorna ≥2 (1 import + 1 usage)
    - `grep -c "'bold-robot-health'" src/app/actions/bold.ts` retorna ≥1
    - `grep -c "revalidate: 30" src/app/actions/bold.ts` retorna 1
    - `grep -c "ctl.abort" src/app/actions/bold.ts` retorna ≥1 (5s timeout via AbortController)
    - `grep -c "process.env.BOLD_ROBOT_URL" src/app/actions/bold.ts` retorna ≥1
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc pasa y todos los grep de acceptance_criteria pasan. La función está exportada y usa unstable_cache.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Wire health-poll + disabled state in BoldPaymentLinkButton</name>
  <read_first>
    - `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx` (full file — verify existing `useEffect` patterns at lines 47-75, the `if (isConfigured !== true) return null` guard at line 75, and the Button JSX render)
    - `.planning/standalone/bold-auth0-migration/RESEARCH.md` §"Example 4 — Button disable logic (D-06 client wiring)" (lines 760-800)
    - `.planning/standalone/bold-auth0-migration/CONTEXT.md` D-06
  </read_first>
  <files>src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx</files>
  <action>
    Modificar `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx`:

    **Cambio 1 — Import:** Agregar `checkBoldRobotHealth` al import existente de `@/app/actions/bold` (mantener los otros imports intactos):

    ```typescript
    import {
      // ... imports existentes (getBoldIntegration, createPaymentLinkAction, etc.)
      checkBoldRobotHealth,
    } from '@/app/actions/bold'
    ```

    **Cambio 2 — Estado:** Después del último `useState` existente (línea ~38 con `setError`), agregar:

    ```typescript
    const [robotHealthy, setRobotHealthy] = useState<boolean>(true)
    ```

    Default `true` (optimistic): asumimos que el robot está OK hasta que el primer poll reporte lo contrario. Esto evita un flash de "disabled" en el mount inicial.

    **Cambio 3 — Polling useEffect:** Después de los `useEffect` existentes (cerca de línea 64-75, pero ANTES del `if (isConfigured !== true) return null` guard de línea 75), agregar:

    ```typescript
    // D-06: Health-check passive UX degradation.
    // Polls every 60s while button is mounted (only if BOLD is configured).
    // Server action checkBoldRobotHealth is cached 30s server-side (Pitfall 9).
    useEffect(() => {
      if (isConfigured !== true) return
      let cancelled = false
      const poll = async () => {
        const result = await checkBoldRobotHealth().catch(() => ({ healthy: false }))
        if (!cancelled) setRobotHealthy(result.healthy)
      }
      poll()
      const interval = setInterval(poll, 60_000)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }, [isConfigured])
    ```

    **Cambio 4 — Botón disabled + tooltip:** Localizar el JSX donde se renderiza el botón "Cobrar con BOLD" (el que abre el dialog) y modificarlo para que use `robotHealthy`:

    - Agregar `disabled={!robotHealthy || /* existing disabled conditions */}` al `<Button>` que renderiza "Cobrar con BOLD"
    - Agregar `title={!robotHealthy ? 'Temporalmente no disponible — BOLD actualizando login' : 'Generar link de pago BOLD'}`
    - Agregar al `className` (concatenado con las clases existentes): `${!robotHealthy ? 'opacity-50 cursor-not-allowed' : ''}`

    Reglas:
    - **MANTENER** el guard `if (isConfigured !== true) return null` (línea 75) — robotHealthy NO oculta el botón, solo lo deshabilita visualmente.
    - **NO modificar** el flow `handleSubmit` / `createPaymentLinkAction` — incluso si el operador logra clickear pese al disabled (DevTools), el server action tirará un error legible.
    - **NO cambiar** la lógica de `isConfigured` ni el primer `useEffect` que la setea.
    - El interval `60_000` (60s) es deliberado — combinado con el `revalidate: 30` del server-side cache, el peor caso son ~90s entre que el robot cae y todos los botones se deshabilitan.
    - El `cancelled` flag previene setState después de unmount (React 18 strict mode safe).
  </action>
  <acceptance_criteria>
    - `grep -c "robotHealthy" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥3 (state declaration + setState + JSX consumer)
    - `grep -c "checkBoldRobotHealth" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥2 (import + invocation in useEffect)
    - `grep -c "Temporalmente no disponible" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥1
    - `grep -c "BOLD actualizando login" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥1
    - `grep -c "setInterval(poll, 60_000)" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna 1
    - `grep -c "opacity-50 cursor-not-allowed" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥1
    - `grep -c "isConfigured !== true" src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` retorna ≥2 (existing guard at L75 + new useEffect early-return — DO NOT remove the L75 guard)
    - `npx tsc --noEmit` exit 0
    - `npm run lint -- src/app/\\(dashboard\\)/whatsapp/components/bold-payment-link-button.tsx` no introduce warnings nuevos
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - tsc pasa
    - Todos los acceptance_criteria pasan
    - El botón sigue oculto cuando isConfigured===false (no se rompe el flow existente)
    - El botón se deshabilita visualmente (opacity 50 + cursor not-allowed) cuando robotHealthy===false
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` exit 0
- Todos los grep de acceptance_criteria pasan
- Manual UAT post-deploy (User):
  1. Operator en /whatsapp con BOLD configurado → botón aparece habilitado (`robotHealthy=true` default)
  2. Robot caído (curl `/api/health` retorna 503 o no responde) → en <90s el botón se deshabilita visualmente con tooltip
  3. Hover sobre el botón disabled → tooltip "Temporalmente no disponible — BOLD actualizando login"
  4. Robot vuelve OK → próximo poll (60s) el botón vuelve a habilitarse
- Network tab: una sola request a /api/health cada 30s sin importar cuántos operators tengan /whatsapp abierto (unstable_cache server-side dedup)
</verification>

<success_criteria>
Cuando el robot BOLD esté caído, el operador ve el botón "Cobrar con BOLD" disabled con tooltip explicativo, sin necesidad de intentar generar un link para ver el error. Cuando el robot vuelve, el botón se rehabilita automáticamente en <90s sin acción del usuario.
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/bold-auth0-migration/02-SUMMARY.md` con:
- Files modified: src/app/actions/bold.ts (added checkBoldRobotHealth), src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx (added health-poll + disabled state)
- Commits creados
- Manual UAT result (screenshots si user los provee)
</output>
