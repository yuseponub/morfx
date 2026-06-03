---
phase: whatsapp-crm-read-latency
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/app/actions/conversations.ts
  - src/app/actions/orders.ts
  - src/app/actions/products.ts
  - src/app/actions/tags.ts
  - src/app/actions/order-notes.ts
autonomous: true
requirements: [L1, "Instr."]
must_haves:
  truths:
    - "Las 5 actions del hot-path (conversations, orders, products, tags, order-notes) resuelven auth via getRequestAuth() en vez de auth.getUser()"
    - "AMBOS timers [perf] de conversations.ts (getConversations + getConversationMessages) ENVUELVEN el auth (D-10) — la instrumentacion ya no es ciega en ninguno"
    - "getAuthContext de orders.ts ahora delega a getRequestAuth() preservando el contract { workspaceId, userId }"
    - "El comportamiento not-authed se preserva exactamente ([] / null / { error }) en cada call site"
    - "RLS y filtrado por workspace siguen identicos (workspaceId server-derivado de cookie)"
  artifacts:
    - path: "src/app/actions/conversations.ts"
      provides: "0 llamadas auth.getUser(); AMBOS timers [perf] (getConversations + getConversationMessages) envuelven auth (D-10)"
      contains: "getRequestAuth"
    - path: "src/app/actions/orders.ts"
      provides: "getAuthContext delega a getRequestAuth; 0 auth.getUser()"
      contains: "getRequestAuth"
    - path: "src/app/actions/products.ts"
      provides: "0 auth.getUser()"
      contains: "getRequestAuth"
    - path: "src/app/actions/tags.ts"
      provides: "0 auth.getUser()"
      contains: "getRequestAuth"
    - path: "src/app/actions/order-notes.ts"
      provides: "0 auth.getUser(); user.email → auth.email"
      contains: "getRequestAuth"
  key_links:
    - from: "src/app/actions/conversations.ts"
      to: "src/lib/auth/request-auth.ts"
      via: "import getRequestAuth"
      pattern: "getRequestAuth"
    - from: "src/app/actions/orders.ts"
      to: "src/lib/auth/request-auth.ts"
      via: "getAuthContext delega"
      pattern: "getRequestAuth"
---

<objective>
Ola 1 — migrar los 5 archivos del HOT-PATH (el flujo lento que reporta el usuario) de `auth.getUser()` (round-trip de red ~150-300ms por action) a `getRequestAuth()` (verificacion local cacheada por request). Esto elimina el costo de auth redundante en el camino caliente y arregla la instrumentacion ciega (D-10) en LOS DOS timers de conversations.ts.

Counts verificados de `auth.getUser()` a eliminar: conversations.ts=17, orders.ts=9, products.ts=7, tags.ts=6, order-notes.ts=4 (total 43 en el hot-path).

Purpose: Bajar la latencia percibida del cambio de conversacion y de las lecturas de pedido. El helper es drop-in (D-09); TypeScript atrapa cualquier mismatch en compile-time. Un commit atomico por archivo con typecheck en cada uno.

Output: 5 archivos migrados, cada uno con 0 `auth.getUser()`, comportamiento not-authed preservado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Example 2 (before/after de conversations.ts verbatim), Call-Site Audit (tabla de helpers que devuelven el user completo), Migration Strategy Wave 1, Pitfall 1/2/3.
- `src/lib/auth/request-auth.ts` (creado en Plan 01) — el contract `{ userId, email, workspaceId }`.
- `CLAUDE.md` Regla 6 (no romper prod), Regla 3 (estos son lectura; las mutaciones que tambien migren su auth siguen llamando domain layer — NO cambiar la logica de mutacion, solo el auth).
</read_first>

<interfaces>
From src/lib/auth/request-auth.ts:
```typescript
export interface RequestAuth { userId: string; email: string | null; workspaceId: string }
export const getRequestAuth: () => Promise<RequestAuth | null>
```

Patron de migracion drop-in (RESEARCH Code Example 2):
```typescript
// ANTES
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return []
const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) return []
// ...usa user.id, workspaceId...

// DESPUES
const auth = await getRequestAuth()
if (!auth) return []   // preserva el return not-authed existente ([] / null / { error })
const supabase = await createClient()
// ...usa auth.userId, auth.workspaceId, auth.email...
```

getAuthContext actual (orders.ts:77-89) — la forma objetivo YA es { workspaceId, userId }:
```typescript
async function getAuthContext(): Promise<{ workspaceId: string; userId: string } | { error: string }>
// Migracion: reemplazar el cuerpo por getRequestAuth();
//   const auth = await getRequestAuth()
//   if (!auth) return { error: 'No autenticado' }   // o 'No hay workspace seleccionado' — ver nota
//   return { workspaceId: auth.workspaceId, userId: auth.userId }
```

order-notes.ts:131 usa user.email para fallback de display name:
```typescript
user: profile || { id: user.id, email: user.email || 'Usuario' }
// → user: profile || { id: auth.userId, email: auth.email || 'Usuario' }
```

DOS timers [perf] en conversations.ts (ambos hoy CIEGOS — startTime DESPUES del auth):
```typescript
// getConversations: getUser L34 → startTime L44 (startTime cae despues del auth + getActiveWorkspaceId)
// getConversationMessages: getUser L228 → startTime L233 (startTime cae despues del auth)
// AMBOS deben quedar con startTime como PRIMERA linea del cuerpo, ANTES de getRequestAuth().
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrar conversations.ts (17 getUser) + arreglar AMBOS timers [perf] ciegos (D-10)</name>
  <files>src/app/actions/conversations.ts</files>
  <action>
1. Importar `getRequestAuth` de `@/lib/auth/request-auth`.
2. Reemplazar las 17 ocurrencias de `auth.getUser()` por el patron drop-in (ver <interfaces>). En cada call site PRESERVAR el return not-authed exacto que ya existe (`[]`, `null`, `{ error }` segun corresponda). Donde la action ademas leia `cookieStore.get('morfx_workspace')` o llamaba `getActiveWorkspaceId()` para el workspace, usar `auth.workspaceId` (el helper ya lo resuelve) y eliminar la resolucion duplicada de workspace + el chequeo de workspace nulo (el helper devuelve null si falta workspace). Mantener `createClient()` para la query Supabase (RLS via cookie sin cambios).
3. **D-10 — mover el `const startTime = Date.now()` para que ENVUELVA el auth en TODAS las funciones de conversations.ts que instrumentan `[perf]`. Hay DOS timers ciegos hoy (Warning 2 del checker):**
   - **getConversations (getUser L34 → startTime L44):** hoy `startTime` cae DESPUES de `auth.getUser()` Y de `getActiveWorkspaceId()`, asi que el warn `[perf]` de esta funcion NO mide el costo de auth. Mover `const startTime = Date.now()` para que sea la PRIMERA linea del cuerpo, ANTES de `await getRequestAuth()`. Si esta funcion no emite warn `[perf]` con su `elapsed`, agregar/preservar el patron del archivo; el objetivo es que el timer cubra auth+query.
   - **getConversationMessages (getUser L228 → startTime L233):** identico — mover `const startTime = Date.now()` a la PRIMERA linea de la funcion, ANTES de `await getRequestAuth()` (RESEARCH Code Example 2 "AFTER"). Mantener el `Promise.race` con timeout de 15s y el `.reverse()` final intactos.
   - El warn `[perf]` (threshold > 3000ms) en AMBAS ahora medira auth + query juntos.
4. Donde una action solo necesitaba `user.id` para confirmar autenticacion (no lo usa en la query), igual usar `if (!auth) return ...`.

VERIFICAR: si alguna action en este archivo es una MUTACION (no lectura), NO cambiar su logica de mutacion — solo el bloque de auth al inicio. Las mutaciones deben seguir pasando por domain layer (Regla 3) sin alteracion.

Commit atomico: `perf(whatsapp-crm-read-latency): migra conversations.ts a getRequestAuth + arregla AMBOS timers [perf] ciegos (D-10)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "auth.getUser()" src/app/actions/conversations.ts</automated>
  </verify>
  <done>
    - `grep -c "auth.getUser()" src/app/actions/conversations.ts` == 0
    - En getConversations Y en getConversationMessages, `startTime` se declara ANTES de `getRequestAuth()` (D-10 — ambos timers)
    - tsc verde; comportamiento not-authed preservado en cada action
  </done>
  <acceptance_criteria>
    - `grep -c "auth.getUser()" src/app/actions/conversations.ts` == 0
    - `grep -c "getRequestAuth" src/app/actions/conversations.ts` >= 1
    - En getConversations: `grep -n "startTime\|getRequestAuth" src/app/actions/conversations.ts` confirma que `startTime` aparece en una linea ANTERIOR a `getRequestAuth` dentro del cuerpo de getConversations
    - En getConversationMessages: idem — `startTime` aparece ANTES de `getRequestAuth`
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Migrar orders.ts (9 getUser, getAuthContext delega) + products.ts (7) + tags.ts (6)</name>
  <files>src/app/actions/orders.ts, src/app/actions/products.ts, src/app/actions/tags.ts</files>
  <action>
Tres commits atomicos (uno por archivo), typecheck en cada uno.

**orders.ts (9 getUser):**
- Reemplazar el CUERPO de `getAuthContext()` (L77-89) por delegacion a `getRequestAuth()` preservando el contract `{ workspaceId, userId } | { error }`:
  ```typescript
  async function getAuthContext() {
    const auth = await getRequestAuth()
    if (!auth) return { error: 'No autenticado' }
    return { workspaceId: auth.workspaceId, userId: auth.userId }
  }
  ```
  (Nota: el helper devuelve null tanto por falta de auth como por falta de workspace; el mensaje colapsa a 'No autenticado' — aceptable, los callers solo chequean la presencia de `error`. Verificar que ningun caller discrimine por el TEXTO exacto del error; si alguno lo hace, conservar ambos mensajes resolviendo workspace por separado — pero el audit indica que solo chequean presencia.)
- Migrar las demas ocurrencias inline de `auth.getUser()` (getPipelines L99-132, getOrder L409-440, etc.) al patron drop-in. Para getPipelines/getOrder usar `auth.workspaceId` y eliminar la lectura duplicada de cookie. NO cablear el cache de referencia aqui (eso es Plan 03) — solo migrar el auth.
- Mutaciones (createOrder, updateOrder, etc.): solo migrar el bloque auth; la logica via domain layer (`@/lib/domain/orders`) queda intacta (Regla 3).
- Commit: `perf(whatsapp-crm-read-latency): migra orders.ts a getRequestAuth (getAuthContext delega)`.

**products.ts (7 getUser):**
- Migrar getActiveProducts (L69-96), getProduct (L102-121) y el resto al patron drop-in. Usar `auth.workspaceId` donde se leia la cookie. NO cablear cache aun (Plan 03).
- Mutaciones (createProduct/updateProduct/...): solo auth; domain/revalidatePath intactos.
- Commit: `perf(whatsapp-crm-read-latency): migra products.ts a getRequestAuth`.

**tags.ts (6 getUser):**
- Migrar getTags, getTagsForScope (L245-282) y resto al patron drop-in. NO cablear cache aun.
- Mutaciones (createTag/updateTag/deleteTag): solo auth; domain/revalidatePath intactos.
- Commit: `perf(whatsapp-crm-read-latency): migra tags.ts a getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in orders products tags; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - `grep -c "auth.getUser()"` == 0 en orders.ts, products.ts, tags.ts
    - getAuthContext de orders.ts delega a getRequestAuth y devuelve { workspaceId, userId }
    - Logica de mutacion via domain layer sin cambios
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "auth.getUser()" src/app/actions/orders.ts` == 0
    - `grep -c "auth.getUser()" src/app/actions/products.ts` == 0
    - `grep -c "auth.getUser()" src/app/actions/tags.ts` == 0
    - `grep -n "getRequestAuth" src/app/actions/orders.ts` confirma uso en getAuthContext
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Migrar order-notes.ts (4 getUser, incluye user.email)</name>
  <files>src/app/actions/order-notes.ts</files>
  <action>
- Importar `getRequestAuth`.
- Migrar las 4 ocurrencias de `auth.getUser()` al patron drop-in.
- **user.email (L131):** reemplazar el fallback `{ id: user.id, email: user.email || 'Usuario' }` por `{ id: auth.userId, email: auth.email || 'Usuario' }`. El helper ya expone `email` (= claims.email), asi que el fallback de display name cuando no hay profile row se preserva identico.
- addOrderNote / mutaciones: solo migrar auth; domain + revalidatePath('/crm/pedidos') intactos.

Commit atomico: `perf(whatsapp-crm-read-latency): migra order-notes.ts a getRequestAuth (preserva fallback user.email)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "auth.getUser()" src/app/actions/order-notes.ts</automated>
  </verify>
  <done>
    - `grep -c "auth.getUser()" src/app/actions/order-notes.ts` == 0
    - El fallback de email usa `auth.email`
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "auth.getUser()" src/app/actions/order-notes.ts` == 0
    - `grep -n "auth.email\|auth.userId" src/app/actions/order-notes.ts` retorna match en el fallback de display name
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `for f in conversations orders products tags order-notes; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos 0
- `npx tsc --noEmit` verde (red de seguridad D-09 — atrapa cualquier campo consumido fuera del contract)
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- `grep -rln "getRequestAuth" src/` → SOLO bajo src/lib/auth/ + src/app/actions/** (nunca paths de agente — Pitfall 8)
- Suite completa: `npx vitest run` — ningun test de semantica de auth cambia
</verification>

<success_criteria>
- 5 archivos del hot-path con 0 auth.getUser()
- AMBOS timers [perf] de conversations.ts (getConversations + getConversationMessages) envuelven el auth (D-10)
- Comportamiento not-authed + RLS + filtrado por workspace preservados identicos
- 5 commits atomicos (1 por archivo), typecheck en cada uno
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/02-SUMMARY.md`
</output>
</output>
