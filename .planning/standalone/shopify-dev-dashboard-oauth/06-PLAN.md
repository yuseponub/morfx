---
phase: shopify-dev-dashboard-oauth
plan: 06
title: UI refactor + actions delete refactor (D-03 + Regla 3 cleanup)
wave: 3
depends_on: [2, 4, 5]
files_modified:
  - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
  - src/app/(dashboard)/configuracion/integraciones/page.tsx
  - src/app/actions/shopify.ts
autonomous: true
estimated_minutes: 55
requirements_addressed: []
must_haves:
  truths:
    - "`shopify-form.tsx` muestra branch DISCONNECTED (input dominio + botón Conectar) y branch CONNECTED (pipeline/stage selectors + delete) — D-03"
    - "Branch DISCONNECTED llama `startShopifyOauth({ shopDomain })` (Plan 04) y hace `window.location.href = redirectUrl` en success"
    - "`useEffect` con `useSearchParams` muestra toast en español cuando hay `?error=oauth_failed&reason=X` o `?success=oauth_connected`, y limpia query params después (D-12)"
    - "Inputs `access_token` y `api_secret` ELIMINADOS de la UI (D-03 reemplazo total)"
    - "Branch CONNECTED PRESERVA pipeline_id, stage_id, product_matching, enable_fuzzy_matching selectors funcionando"
    - "`src/app/actions/shopify.ts` delete path llama a domain `deleteShopifyIntegration` con import alias (Opción A6 de Plan 01)"
    - "0 matches de `adminSupabase.from('integrations').(insert|update|upsert|delete)` en TODA la code base FUERA de `src/lib/domain/integrations.ts` (Regla 3 globalmente satisfecha)"
  artifacts:
    - path: "src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx"
      provides: "UI 2-branch (disconnected/connected) + toast de OAuth result"
      contains: "startShopifyOauth"
    - path: "src/app/actions/shopify.ts"
      provides: "Server actions refactored to call domain layer for delete"
      contains: "domainDeleteShopifyIntegration"
  key_links:
    - from: "shopify-form.tsx (disconnected branch)"
      to: "src/app/actions/shopify-oauth.ts → startShopifyOauth"
      via: "import { startShopifyOauth } from '@/app/actions/shopify-oauth'"
      pattern: "startShopifyOauth"
    - from: "shopify-form.tsx (toast effect)"
      to: "Plan 05 callback redirect query params"
      via: "useSearchParams + useEffect + toast.error/success"
      pattern: "searchParams.get\\('error'\\)|searchParams.get\\('reason'\\)|searchParams.get\\('success'\\)"
    - from: "src/app/actions/shopify.ts (delete path)"
      to: "src/lib/domain/integrations.ts → deleteShopifyIntegration"
      via: "import alias domainDeleteShopifyIntegration"
      pattern: "domainDeleteShopifyIntegration"
---

<objective>
Wave 3 finaliza la integración del flow nuevo con la UI + cierra Regla 3 globalmente:

1. `shopify-form.tsx` se reescribe en 2 branches (D-03 reemplazo total): disconnected (input dominio + Connect) / connected (selectors + delete preservados).
2. UI consume el redirect del callback (Plan 05) vía `useSearchParams` + `useEffect` + toast (D-12).
3. `page.tsx` se actualiza con copy mínimamente revisado (eliminar instrucciones legacy del shpat_ flow).
4. `actions/shopify.ts` delete path se refactoriza para llamar al domain layer (cierre de Regla 3 globally — gate verificable por grep).

Purpose: este es el plan visible al usuario — sin él, el flow funcional de Plans 02-05 no es usable. También cierra la deuda de Regla 3 que dejó Plan 02.

Output: UI lista para que el usuario haga el smoke test (Plan 07).

**Wave 3 depende de TODOS los Wave 1+2.** No paraleliza con nada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/PATTERNS.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/02-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/04-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/05-SUMMARY.md
@CLAUDE.md
@src/app/(dashboard)/configuracion/integraciones/page.tsx
@src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
@src/app/actions/shopify.ts
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx

<interfaces>
<!-- Inputs from prior plans + existing components. -->

From Plan 04 (`src/app/actions/shopify-oauth.ts`):
```typescript
export async function startShopifyOauth(input: { shopDomain: string }): Promise<
  | { success: true; redirectUrl: string }
  | { success: false; error: string }
>
```

From Plan 02 (`src/lib/domain/integrations.ts`):
```typescript
export async function deleteShopifyIntegration(ctx: DomainContext): Promise<DomainResult<void>>
```

From existing `src/app/actions/shopify.ts` (NOT to refactor wholesale — only the delete path):
```typescript
// Lines 359-402 (approximate):
export async function deleteShopifyIntegration(): Promise<{ success: boolean; error?: string }> {
  // auth gate (lines 366-388) — KEEP UNCHANGED
  // ...
  // lines 389-394 — REPLACE these direct adminSupabase calls with domain
  const { error } = await adminSupabase.from('integrations').delete()...
}
```

From `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:143-189` (the useSearchParams toast analog):
```tsx
const searchParams = useSearchParams()
// pattern: read searchParams.get('X'), useEffect fires toast, then clear params
```

From RESEARCH.md Example 9 — the target UI pattern (already adapted in PATTERNS.md):
```tsx
// 2-branch render
if (!integration) {
  return <DisconnectedBranch />  // input + Connect button
}
return <ConnectedShopifyView />   // existing logic, MINUS access_token/api_secret inputs
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Reescribir `shopify-form.tsx` con 2 branches + toast effect</name>
  <files>src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx</files>
  <read_first>
    - PATTERNS.md §"`shopify-form.tsx` (MODIFY — total replacement)" sección completa
    - El archivo actual completo: `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx`
    - RESEARCH.md §Code Examples §Example 9 (líneas 964-1044) — UI target
    - `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:143-189` (useSearchParams pattern)
    - CONTEXT.md D-03 (reemplazo TOTAL form manual), D-12 (toast con messages en español)
  </read_first>
  <action>
    **Antes de editar:** leer el archivo `shopify-form.tsx` COMPLETO para conocer exactamente qué props recibe (`ShopifyFormProps`), qué selectors tiene el branch connected (pipeline_id, stage_id, product_matching, enable_fuzzy_matching), y qué imports necesita preservar.

    **Estrategia (preservar lo bueno, reemplazar lo legacy):**

    1. **Imports a AGREGAR** (al top del archivo):
       ```typescript
       import { useEffect } from 'react'
       import { useRouter, useSearchParams } from 'next/navigation'
       import { startShopifyOauth } from '@/app/actions/shopify-oauth'
       import { ShoppingBag, Loader2 } from 'lucide-react'  // si Loader2/ShoppingBag no están ya importados
       ```

    2. **Imports a ELIMINAR** del archivo legacy:
       - Cualquier llamada a `saveShopifyIntegration` y `testConnection` (server actions legacy).
       - El `register('access_token')` y `register('api_secret')` del form (eliminar los inputs en JSX y los campos del schema de validación si existe).

    3. **State a AGREGAR** dentro del componente:
       ```typescript
       const router = useRouter()
       const searchParams = useSearchParams()
       const [shopDomain, setShopDomain] = useState('')
       const [isPending, startTransition] = useTransition()
       ```
       (Si `useTransition` ya está, reusar.)

    4. **`useEffect` para toast desde callback redirect** (RESEARCH Example 9 líneas 982-999 + PATTERNS.md adaptation note about clearing params):
       ```typescript
       useEffect(() => {
         const error = searchParams.get('error')
         const reason = searchParams.get('reason')
         const success = searchParams.get('success')

         if (error === 'oauth_failed' && reason) {
           const messages: Record<string, string> = {
             denied: 'Permisos denegados. Es necesario aceptar todos los permisos solicitados.',
             hmac_mismatch: 'Error de seguridad al conectar (HMAC invalido). Intenta de nuevo.',
             state_expired: 'La conexion expiro. Intenta de nuevo.',
             shopify_error: 'Shopify devolvio un error. Verifica el dominio de tu tienda e intenta de nuevo.',
           }
           toast.error(messages[reason] ?? 'Error al conectar con Shopify')
           // Limpiar query params para que un refresh no re-dispare el toast
           router.replace('/configuracion/integraciones', { scroll: false })
         } else if (success === 'oauth_connected') {
           toast.success('Tienda Shopify conectada exitosamente')
           router.replace('/configuracion/integraciones', { scroll: false })
         }
         // eslint-disable-next-line react-hooks/exhaustive-deps
       }, [searchParams])
       ```

       **Nota PATTERNS.md:** usar `router.replace` (Next router), NO `window.history.replaceState` — queremos re-render para que el branch connected muestre datos frescos. Comparar con `orders-view.tsx:185` que usa `replaceState` precisamente porque NO quiere re-render — caso opuesto al nuestro.

    5. **Handler de connect**:
       ```typescript
       const handleConnect = () => {
         const domain = shopDomain.trim()
         if (!domain) {
           toast.error('Ingresa el dominio de tu tienda')
           return
         }
         startTransition(async () => {
           const result = await startShopifyOauth({ shopDomain: domain })
           if (!result.success) {
             toast.error(result.error)
             return
           }
           // Cross-origin redirect — usar window.location.href, NO router.push
           window.location.href = result.redirectUrl
         })
       }
       ```

    6. **JSX — branch disconnected** (when `!integration`):
       ```tsx
       if (!integration) {
         return (
           <div className="space-y-4">
             <p className="text-sm text-muted-foreground">
               Conecta tu tienda Shopify para sincronizar pedidos automaticamente.
             </p>
             <div>
               <Label htmlFor="shop_domain">Dominio de tu tienda</Label>
               <Input
                 id="shop_domain"
                 placeholder="mitienda.myshopify.com"
                 value={shopDomain}
                 onChange={(e) => setShopDomain(e.target.value)}
                 disabled={isPending}
               />
             </div>
             <Button onClick={handleConnect} disabled={isPending} className="w-full">
               {isPending ? (
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
               ) : (
                 <ShoppingBag className="h-4 w-4 mr-2" />
               )}
               Conectar con Shopify
             </Button>
           </div>
         )
       }
       ```

    7. **JSX — branch connected** (when `integration` exists):
       **Preservar literal** la lógica actual del branch connected (lo que renderiza pipeline selector, stage selector, product_matching radio, enable_fuzzy_matching switch, delete button). **Solo eliminar**:
       - Los inputs/registers para `access_token` y `api_secret`.
       - Los botones / lógica de `testConnection` (ya no hace falta — el callback prueba antes de persistir).

       Sigue mostrando:
       - Header con nombre de tienda (`integration.config.shop_domain` o `integration.name`).
       - Selectors de pipeline/stage/product_matching/enable_fuzzy_matching (los selectors EXISTEN — solo se preservan).
       - Botón "Eliminar / Desconectar" que llama al server action existente `deleteShopifyIntegration` (Task 2 refactoriza su implementación).

    8. **Asegurar Suspense boundary intacto** — `page.tsx` ya envuelve este componente en `<Suspense>` (línea 99-104). `useSearchParams` requiere Suspense en Next 16; NO crashar build.

    **Decisiones D referenciadas:** D-03 (reemplazo total), D-12 (mensajes en español).
  </action>
  <verify>
    <automated>grep -E "'use client'" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx | head -1</automated>
    <automated>grep -c "useSearchParams\|useEffect.*searchParams" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>grep -c "startShopifyOauth" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>grep -c "toast\.\(error\|success\)" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>! grep -E "register\(['\"]access_token['\"]|register\(['\"]api_secret['\"]" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx && echo "OK: access_token/api_secret inputs removed"</automated>
    <automated>grep -c "Permisos denegados\|HMAC invalido\|conexion expiro\|Shopify devolvio" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>grep "window.location.href = result.redirectUrl" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>grep -c "router.replace\|router\.replace" src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "shopify-form.tsx" | head -10</automated>
  </verify>
  <done>
    - Form con 2 branches: disconnected (input + Connect) y connected (existing selectors preservados, menos credentials)
    - `useEffect` con `useSearchParams` muestra 4 toast errores + 1 toast success — todos en español
    - `router.replace` limpia query params después del toast
    - Inputs `access_token` y `api_secret` ELIMINADOS
    - `window.location.href` para redirect cross-origin (NO `router.push`)
    - TypeScript sin errores
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor `src/app/actions/shopify.ts` — delete path llama a domain (cierre Regla 3)</name>
  <files>src/app/actions/shopify.ts</files>
  <read_first>
    - `src/app/actions/shopify.ts` (file completo — confirmar líneas 359-402 son el delete path)
    - PATTERNS.md §"`src/app/actions/shopify.ts` (MODIFY — refactor to call domain)" §"Pre-refactor snippet" + "Post-refactor target"
    - `src/lib/domain/integrations.ts` (la firma de `deleteShopifyIntegration` del Plan 02)
    - Plan 01 SUMMARY (decisión A6 — si Opción A "import alias" o B "rename server action")
    - CONTEXT.md D-10 (Regla 3)
  </read_first>
  <action>
    Según la decisión A6 del Plan 01 (default recomendado: **Opción A — import alias**):

    **Si A6 = Opción A (recomendado):**

    1. Agregar al top del archivo:
       ```typescript
       import { deleteShopifyIntegration as domainDeleteShopifyIntegration } from '@/lib/domain/integrations'
       ```

    2. En el server action existente `deleteShopifyIntegration` (líneas ~359-402), localizar el bloque que hace `.from('integrations').delete()` directo:
       ```typescript
       // ANTES (líneas ~389-394):
       const { error } = await adminSupabase
         .from('integrations')
         .delete()
         .eq('workspace_id', workspaceId)
         .eq('type', 'shopify')

       if (error) {
         console.error('Error deleting integration:', error)
         return { success: false, error: 'Error al eliminar integracion' }
       }
       ```

    3. Reemplazarlo con:
       ```typescript
       // DESPUES:
       const result = await domainDeleteShopifyIntegration({
         workspaceId,
         source: 'server-action',
       })
       if (!result.success) {
         console.error('Error deleting integration:', result.error)
         return { success: false, error: 'Error al eliminar integracion' }
       }
       ```

    **Si A6 = Opción B:** renombrar el server action a `deleteShopifyIntegrationAction` y actualizar los callers en UI (`shopify-form.tsx`). El executor escoge según el SUMMARY de Plan 01.

    4. **TAMBIÉN refactorizar el legacy `saveShopifyIntegration`** que aún está en el archivo:
       - PATTERNS.md §"`src/app/actions/shopify.ts` (MODIFY)" línea 305 dice: "Delete `testConnection`, `saveShopifyIntegration` (these become unused; the OAuth callback owns the test+save path now)".
       - **Verificación previa al delete:** ejecutar `grep -rn "saveShopifyIntegration\|testConnection" src/ --include='*.ts' --include='*.tsx'`. Si hay callers además del archivo mismo, NO eliminar — solo dejarlo dead-code (Task 1 elimina los callers en UI).
       - **Si no hay callers en src/ tras Task 1:** eliminar las funciones (`saveShopifyIntegration` + `testConnection` si está aquí también).
       - **Si hay callers:** ANTAR el TODO con comentario `// TODO(shopify-oauth phase): unused since D-03; verify callers and delete in cleanup` y dejar las funciones — pero refactorizar su body para usar domain (`upsertShopifyIntegration`) si el caller realmente las llama.

       **Caminos seguros (recomendado):**
       - Verificar con grep que tras Task 1, `saveShopifyIntegration` no tiene callers en `src/`.
       - Si 0 callers → eliminar funciones legacy.
       - Si quedan callers → refactor body a domain layer (mismo patrón que delete) + dejar funciones.

    5. **`getShopifyIntegration`, `toggleShopifyIntegration`, `getIntegrationStatus`, `getWebhookEvents`, `getPipelinesForConfig`** → NO TOCAR (read-only o non-config; PATTERNS.md línea 305 dice "untouched by this standalone").

    6. **Commit del archivo (atómico):**
       ```bash
       npx tsc --noEmit 2>&1 | grep "actions/shopify.ts" | head -10
       # esperado: sin errores

       git add src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx \
         src/app/actions/shopify.ts \
         # NO incluir page.tsx aquí — Task 3 lo commitea
       git commit -m "$(cat <<'EOF'
       feat(shopify-oauth 06): UI 2-branch + delete via domain (D-03, Regla 3 cierre)

       shopify-form.tsx:
       - Branch disconnected: input dominio + boton Conectar con Shopify (D-03)
       - Branch connected: pipeline/stage selectors preservados, credentials inputs ELIMINADOS
       - useEffect + useSearchParams + toast.error/success (4 reasons + connected, D-12)
       - router.replace limpia query params post-toast
       - window.location.href para redirect cross-origin (NO router.push)

       actions/shopify.ts:
       - delete path refactor: domainDeleteShopifyIntegration (Regla 3)
       - saveShopifyIntegration/testConnection: <eliminadas si sin callers | refactored a domain>

       Plan 06/Wave 3. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       EOF
       )"
       ```

    **Decisión D referenciada:** D-10 (Regla 3 — todas las mutaciones via domain).
  </action>
  <verify>
    <automated>grep "domainDeleteShopifyIntegration\|deleteShopifyIntegrationAction" src/app/actions/shopify.ts | head -3</automated>
    <automated>! grep -E "from\('integrations'\)\.(insert|update|upsert|delete)" src/app/actions/shopify.ts && echo "OK: Regla 3 closed in actions/shopify.ts"</automated>
    <automated>grep -E "from\('integrations'\)\.(insert|update|upsert|delete)" src/ -rn --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "actions/shopify.ts" | head -10</automated>
    <automated>git log --oneline -1 | grep -E "feat\(shopify-oauth 06\)"</automated>
  </verify>
  <done>
    - Server action `deleteShopifyIntegration` llama a domain layer (sin direct mutations)
    - `saveShopifyIntegration` y `testConnection` eliminadas (si 0 callers) o refactored
    - **0 matches GLOBALES** de `from('integrations').(insert|update|upsert|delete)` fuera de domain (Regla 3 cerrada)
    - TypeScript sin errores
    - Commit con shopify-form.tsx + actions/shopify.ts
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Limpiar `page.tsx` — eliminar instrucciones legacy del shpat_ flow + commit final</name>
  <files>src/app/(dashboard)/configuracion/integraciones/page.tsx</files>
  <read_first>
    - El archivo completo: `src/app/(dashboard)/configuracion/integraciones/page.tsx`
    - PATTERNS.md §"`src/app/(dashboard)/configuracion/integraciones/page.tsx` (MODIFY — minor)" — sección entera
    - CONTEXT.md D-03 (reemplazo TOTAL — incluye instrucciones)
  </read_first>
  <action>
    Cambio mínimo: localizar la Card "Como configurar" (PATTERNS.md indica líneas ~133-164, pero verificar leyendo el archivo) que describe el flow legacy (cómo crear app custom, copiar `shpat_`, etc.) y reemplazarla por una versión corta:

    1. Si existe un componente Card o `<section>` con título "Como configurar" o similar describing el legacy flow:
       - **REEMPLAZAR su contenido** con un párrafo corto, ej:
         ```tsx
         <Card>
           <CardHeader>
             <CardTitle>Como conectar</CardTitle>
             <CardDescription>
               Ingresa el dominio de tu tienda Shopify y haz click en "Conectar con Shopify".
               Te redirigiremos a Shopify para autorizar el acceso. Al volver, configuras
               el pipeline y etapa donde se crearan los pedidos.
             </CardDescription>
           </CardHeader>
         </Card>
         ```
       - Mantener el resto de page.tsx intacto (Suspense boundary, layout, etc.).

    2. **NO modificar:**
       - El `<Suspense fallback={...}>` que envuelve `ShopifyForm` (líneas ~99-104) — la consigna requiere preservarlo para `useSearchParams` en el form.
       - Cualquier otro Card de la página (e.g., si hay sección de webhooks o pipeline default, NO tocar).

    3. **Si NO hay tal Card en page.tsx** (PATTERNS dice "Optional — RESEARCH and CONTEXT don't mandate removal, but D-03 says 'Reemplazo TOTAL del form'"):
       - Skip el cambio. Anota en SUMMARY: "page.tsx sin cambios — no había Card de instrucciones legacy".

    4. **Commit + verificación final globalmente:**
       ```bash
       # Si page.tsx cambió:
       git add src/app/\(dashboard\)/configuracion/integraciones/page.tsx
       git commit -m "$(cat <<'EOF'
       chore(shopify-oauth 06): limpia instrucciones legacy del shpat_ flow en page (D-03)

       Plan 06/Wave 3. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       EOF
       )"

       # Verificación global Regla 3 (TODA la base de código):
       grep -rn "from('integrations')\.\(insert\|update\|upsert\|delete\)" src/ \
         --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'
       # esperado: 0 matches

       # Build verification:
       pnpm run build 2>&1 | tail -50
       # esperado: build success, sin errores TS, sin warnings sobre useSearchParams sin Suspense
       ```

    **NO push.** El orchestrator pushea después de Plan 07 smoke.
  </action>
  <verify>
    <automated>grep -rn "from('integrations')\.\(insert\|update\|upsert\|delete\)" src/ --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts' | wc -l</automated>
    <automated>! grep -E "shpat_|api_secret.*pega|access.token.*pegar|copia.*token" src/app/\(dashboard\)/configuracion/integraciones/page.tsx && echo "OK: legacy instructions removed if existed"</automated>
    <automated>pnpm run build 2>&1 | tail -5 | grep -E "compiled|success|error"</automated>
    <automated>git log --oneline -3 | head -3</automated>
  </verify>
  <done>
    - Card "Como configurar" actualizada (o documentado en SUMMARY si no existía)
    - **0 matches globales de Regla 3 violations** (grep gate)
    - `pnpm run build` compila sin errores
    - Commit creado
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser URL query params → React component (`useSearchParams`) | URL es untrusted (atacante puede mandar al usuario un link con `?error=...&reason=<XSS>`); reason se mapea a string fijo del map — NO se renderiza directamente |
| `shopDomain` input → server action | Solo se manda al server action que ya valida; no se renderiza HTML |
| `integration.config.access_token` (en branch connected) | NUNCA se muestra en UI; PATTERNS.md elimina el input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-29 | I (Information disclosure) | `access_token` mostrado en UI accidentalmente | mitigate | Branch connected solo lee `integration.config.shop_domain` y `integration.config.default_pipeline_id` etc.; cero render de `access_token` (grep gate); PATTERNS.md elimina inputs explícitos |
| T-shopify-oauth-30 | T (Tampering) | XSS via `?reason=<script>` en URL | mitigate | `reason` se mapea a Record fijo de 4 keys (`denied|hmac_mismatch|state_expired|shopify_error`); fallback a "Error al conectar con Shopify"; React por defecto escapa; NO usamos `dangerouslySetInnerHTML` |
| T-shopify-oauth-31 | I (Information disclosure) | Toast persiste tras navegación → user comparte screenshot con info | mitigate | `router.replace` limpia query params post-toast |
| T-shopify-oauth-32 | T (Tampering) | Caller bypassea domain (Regla 3) en otro archivo de `actions/` | mitigate | Grep gate global al final del Task 3 — debe retornar 0 matches |
</threat_model>

<verification>
Al final del plan, gates globales:

```bash
# 1. Regla 3 cerrada (gate principal de este plan):
grep -rn "from('integrations')\.\(insert\|update\|upsert\|delete\)" src/ --include='*.ts' --include='*.tsx' \
  | grep -v 'src/lib/domain/integrations.ts'
# esperado: 0 matches

# 2. Build:
pnpm run build 2>&1 | tail -5
# esperado: build success

# 3. No regression de Plan 02 ni 05 (verificar files todavía existen):
test -f src/lib/domain/integrations.ts && test -f src/app/api/integrations/shopify/oauth/callback/route.ts

# 4. UI toast strings en español presentes:
grep -c "Permisos denegados\|HMAC invalido\|conexion expiro\|Shopify devolvio\|conectada exitosamente" \
  src/app/\(dashboard\)/configuracion/integraciones/components/shopify-form.tsx
# esperado: >= 5 (4 errores + 1 success)
```
</verification>

<success_criteria>
- [ ] `shopify-form.tsx` con 2-branch + toast effect + Connect button
- [ ] Inputs `access_token` / `api_secret` ELIMINADOS de UI
- [ ] Toast en español para 4 reasons + success (D-12 cubierto)
- [ ] `router.replace` limpia query params tras toast
- [ ] `window.location.href` para cross-origin redirect (NO `router.push`)
- [ ] Branch connected preserva selectors (pipeline/stage/product_matching/enable_fuzzy_matching) + delete
- [ ] `actions/shopify.ts` delete path llama a `domainDeleteShopifyIntegration` (Opción A6)
- [ ] **Regla 3 cerrada globalmente** — 0 matches grep en TODA `src/`
- [ ] `saveShopifyIntegration` y `testConnection` eliminadas (si sin callers) o refactored a domain
- [ ] `page.tsx` instrucciones legacy limpiadas (si existían)
- [ ] `pnpm run build` exitoso
- [ ] 2 commits atómicos (shopify-form+actions, page.tsx)
- [ ] **NO push** (orchestrator)
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/06-SUMMARY.md` con:
- Resumen del refactor por archivo
- Output del grep gate global de Regla 3 (debe ser 0)
- Output de `pnpm run build` (success)
- Lista de funciones eliminadas o refactored en `actions/shopify.ts`
- Decisión final A6 implementada (Opción A o B)
- Hand-off para Plan 07 (smoke): qué tab/URL abrir, qué credenciales del dev store usar
</output>
