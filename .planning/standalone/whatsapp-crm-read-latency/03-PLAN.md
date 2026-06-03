---
phase: whatsapp-crm-read-latency
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/app/actions/order-detail.ts
  - src/app/actions/products.ts
  - src/app/actions/tags.ts
  - src/app/actions/orders.ts
  - src/app/actions/pipelines.ts
  - src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
autonomous: false
requirements: [L2, L3]
must_haves:
  truths:
    - "view-order-sheet.tsx (el ojito) llama UNA sola Server Action getOrderDetailBundle en vez de 5 actions serializadas"
    - "getOrderDetailBundle resuelve UN solo auth y hace Promise.all REAL server-side de las 5 lecturas"
    - "getActiveProducts / getTagsForScope / getPipelines leen del Next Data Cache por workspace (no re-fetch por click)"
    - "Las mutaciones de products/tags/pipelines invalidan su tag de cache (revalidateTag) para que el cache no quede stale"
    - "El sheet muestra exactamente los mismos datos que antes (order, pipelines, products, tags, notes)"
  artifacts:
    - path: "src/app/actions/order-detail.ts"
      provides: "getOrderDetailBundle(orderId) — 1 auth + Promise.all de las 5 lecturas"
      exports: ["getOrderDetailBundle"]
      contains: "Promise.all"
    - path: "src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx"
      provides: "1 action en vez de 5; mismos setState"
      contains: "getOrderDetailBundle"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx"
      to: "src/app/actions/order-detail.ts"
      via: "await getOrderDetailBundle(orderId)"
      pattern: "getOrderDetailBundle"
    - from: "src/app/actions/products.ts (getActiveProducts)"
      to: "src/lib/cache/reference-data.ts (getCachedActiveProducts)"
      via: "delega al cache por workspace"
      pattern: "getCachedActiveProducts"
    - from: "src/app/actions/products.ts (mutaciones)"
      to: "revalidateTag('ref:products:'+ws)"
      via: "invalidacion de cache"
      pattern: "revalidateTag"
---

<objective>
Ola 1 (Capas 2+3) — colapsar el "ojito" de pedidos y cablear el Next Data Cache de datos de referencia.

**Capa 2 (D-06):** crear UNA Server Action `getOrderDetailBundle(orderId)` que reemplaza las 5 Server Actions que hoy `view-order-sheet.tsx` dispara desde el cliente y que Next.js SERIALIZA (la React Action queue procesa de a una, aun bajo Promise.all del lado cliente). La nueva action hace 1 solo `getRequestAuth()` + `Promise.all` REAL server-side (las 5 lecturas paralelizan de verdad dentro de un solo proceso Node).

**Capa 3 (D-07):** cablear `getActiveProducts` / `getTagsForScope` / `getPipelines` para que lean de los wrappers `unstable_cache` (creados en Plan 01), y agregar `revalidateTag` en cada mutacion de products/tags/pipelines para que el cache no quede stale.

Purpose: El ojito pasa de ~1-2s (5 auth + 5 queries en serie) a ~1 round-trip + paralelismo real + datos de referencia cacheados. Es el win mas visible del standalone.

Output: 1 action nueva + cache cableado + invalidacion + el sheet usando 1 action.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Example 3 (getOrderDetailBundle verbatim + edit del sheet), Code Example 4 (cache + revalidateTag), Pattern 2/3, Pitfall 5, Open Question 1 (ship el collapse plano primero, useQuery es opcional — el useQuery del ojito se difiere; este plan ship el collapse plano).
- `src/lib/cache/reference-data.ts` (Plan 01) — getCachedActiveProducts/getCachedTagsForScope/getCachedPipelines.
- `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` L110-156 — los 2 useEffect (4 actions en uno, getOrderNotes en otro).
</read_first>

<interfaces>
view-order-sheet.tsx HOY (L110-156):
```tsx
// useEffect A (L111-117): getOrderNotes(orderId).then(setOrderNotes)
// useEffect B (L120-156): Promise.all([getOrder, getPipelines, getActiveProducts, getTagsForScope('orders')])
//   luego: setOrder, setLocalTags(orderData.tags), setStages(pipeline.stages), setPipelines, setProducts, setAllTags
```

Firmas de las 5 actions que componen el bundle (ya migradas a getRequestAuth en Plan 02):
```typescript
getOrder(orderId: string): Promise<OrderWithDetails | null>          // orders.ts
getPipelines(): Promise<PipelineWithStages[]>                        // orders.ts
getActiveProducts(): Promise<Product[]>                              // products.ts
getTagsForScope(scope?: 'whatsapp'|'orders'): Promise<Tag[]>         // tags.ts
getOrderNotes(orderId: string): Promise<OrderNoteWithUser[]>         // order-notes.ts
```

Cache wrappers (Plan 01):
```typescript
getCachedActiveProducts(workspaceId): Promise<Product[]>
getCachedTagsForScope(workspaceId, scope?): Promise<Tag[]>
getCachedPipelines(workspaceId): Promise<PipelineWithStages[]>
```

Mutaciones que deben invalidar (verificado en codebase):
- products.ts: createProduct (L130), updateProduct (L189) + archive (~L263/294) — todas ya hacen revalidatePath('/crm/productos')
- tags.ts: createTag (L96), updateTag (L154), deleteTag (L211) — ya hacen revalidatePath
- pipelines.ts: createPipeline/updatePipeline/createStage/etc. (archivo src/app/actions/pipelines.ts)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cablear cache de referencia + invalidacion por tag (Capa 3)</name>
  <files>src/app/actions/products.ts, src/app/actions/tags.ts, src/app/actions/orders.ts, src/app/actions/pipelines.ts</files>
  <action>
**Cablear las lecturas (reemplazar el body de la query por el wrapper cacheado):**

- `products.ts` getActiveProducts: tras `const auth = await getRequestAuth(); if (!auth) return []`, hacer `return getCachedActiveProducts(auth.workspaceId)`. Importar de `@/lib/cache/reference-data`. (getProduct individual NO se cachea — es por-id, no datos de referencia.)
- `tags.ts` getTagsForScope: tras resolver auth, `return getCachedTagsForScope(auth.workspaceId, scope)`.
- `orders.ts` getPipelines: tras resolver auth, `return getCachedPipelines(auth.workspaceId)`.

**Agregar invalidacion (revalidateTag) en cada mutacion** — JUNTO al revalidatePath existente, no en vez de:

- products.ts createProduct/updateProduct/archive*: tras la mutacion (donde ya hay `revalidatePath('/crm/productos')`), agregar `revalidateTag('ref:products:' + workspaceId)`. El workspaceId ya esta disponible en cada mutacion (de getAuthContext/getRequestAuth). Importar `revalidateTag` de `next/cache`.
- tags.ts createTag/updateTag/deleteTag: agregar `revalidateTag('ref:tags:' + workspaceId)`.
- pipelines.ts: en TODA mutacion de pipeline/stage (create/update/delete pipeline + create/update/delete/reorder stage), agregar `revalidateTag('ref:pipelines:' + workspaceId)`. Leer el archivo primero para enumerar las mutaciones exactas.

VERIFICAR que el `workspaceId` este in-scope en cada punto de mutacion antes de referenciarlo (todas pasan por getAuthContext/getRequestAuth — confirmar).

Commit atomico: `perf(whatsapp-crm-read-latency): cablea Next Data Cache de referencia + revalidateTag en mutaciones (D-07)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "getCachedActiveProducts" src/app/actions/products.ts && grep -rc "revalidateTag" src/app/actions/products.ts src/app/actions/tags.ts src/app/actions/pipelines.ts</automated>
  </verify>
  <done>
    - getActiveProducts/getTagsForScope/getPipelines delegan a su wrapper cacheado
    - Cada mutacion de products/tags/pipelines hace revalidateTag del tag correcto
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "getCachedActiveProducts" src/app/actions/products.ts` >= 1
    - `grep -c "getCachedTagsForScope" src/app/actions/tags.ts` >= 1
    - `grep -c "getCachedPipelines" src/app/actions/orders.ts` >= 1
    - `grep -c "revalidateTag('ref:products" src/app/actions/products.ts` >= 1 (idem ref:tags en tags.ts, ref:pipelines en pipelines.ts)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Crear getOrderDetailBundle (Capa 2, D-06)</name>
  <files>src/app/actions/order-detail.ts</files>
  <action>
Crear `src/app/actions/order-detail.ts` segun RESEARCH Code Example 3 (verbatim):

```typescript
'use server'
import { getRequestAuth } from '@/lib/auth/request-auth'
import { getOrder, getPipelines } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { getOrderNotes } from '@/app/actions/order-notes'

/**
 * ONE Server Action replacing the 5 serialized client-invoked actions in
 * view-order-sheet.tsx. Real Promise.all server-side (single Node process →
 * independent reads truly parallelize). Single auth resolution via cache().
 */
export async function getOrderDetailBundle(orderId: string) {
  const auth = await getRequestAuth()
  if (!auth) return null

  const [order, pipelines, products, tags, notes] = await Promise.all([
    getOrder(orderId),
    getPipelines(),
    getActiveProducts(),
    getTagsForScope('orders'),
    getOrderNotes(orderId),
  ])
  return { order, pipelines, products, tags, notes }
}
```

Nota: como las 5 actions ya usan `getRequestAuth()` (cacheado por request) tras Plan 02, las 5 comparten la misma resolucion de auth dentro de este unico request — el costo de auth se paga 1 vez aunque cada action lo invoque. El `Promise.all` aqui SI paraleliza porque corre dentro de un solo proceso Node (no es la React Action queue del cliente).

Commit atomico: `perf(whatsapp-crm-read-latency): crea getOrderDetailBundle — colapsa el ojito 5→1 (D-06)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "Promise.all" src/app/actions/order-detail.ts</automated>
  </verify>
  <done>
    - getOrderDetailBundle exportado, hace 1 getRequestAuth + Promise.all de las 5 lecturas
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "getOrderDetailBundle" src/app/actions/order-detail.ts` >= 1
    - `grep -c "Promise.all" src/app/actions/order-detail.ts` == 1
    - `grep -c "getRequestAuth" src/app/actions/order-detail.ts` == 1
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Cablear view-order-sheet.tsx al bundle (5 actions → 1)</name>
  <files>src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx</files>
  <action>
Reemplazar los DOS useEffect (A: getOrderNotes en L111-117; B: Promise.all de 4 actions en L120-156) por UN solo useEffect que llama `getOrderDetailBundle(currentOrderId)` y distribuye el resultado a los mismos setState:

```tsx
import { getOrderDetailBundle } from '@/app/actions/order-detail'

React.useEffect(() => {
  if (!open || !orderId) { setOrderNotes([]); return }
  const currentOrderId = orderId
  async function loadData() {
    setIsLoading(true)
    setIsEditing(false)
    try {
      const data = await getOrderDetailBundle(currentOrderId)
      if (!data) { /* not-authed / cerrado: limpiar como antes */ setOrderNotes([]); return }
      const { order: orderData, pipelines: pipelinesData, products: productsData, tags: tagsData, notes } = data
      if (orderData) {
        setOrder(orderData)
        setLocalTags(orderData.tags || [])
        const pipeline = pipelinesData.find(p => p.id === orderData.pipeline_id)
        setStages(pipeline?.stages || [])
      }
      setPipelines(pipelinesData)
      setProducts(productsData)
      setAllTags(tagsData)
      setOrderNotes(notes)
    } catch (error) {
      console.error('Error loading order:', error)
      toast.error('Error al cargar el pedido')
    } finally {
      setIsLoading(false)
    }
  }
  loadData()
}, [open, orderId])
```

- Eliminar los imports ahora no usados directamente por el sheet si quedan huerfanos (getOrderNotes ya no se llama directo aqui; getOrder/getPipelines/getActiveProducts/getTagsForScope tampoco) — PERO verificar primero que no se usen en OTRA parte del componente (ej. handleEditSuccess L167 llama getOrder — ese se queda, mantener el import de getOrder). Solo eliminar imports que queden 100% sin uso. tsc/lint marcara imports no usados.
- NO cambiar la firma de props ni el resto del componente. Los setState destino son identicos a los actuales.

Commit atomico: `perf(whatsapp-crm-read-latency): view-order-sheet usa getOrderDetailBundle (1 round-trip en vez de 5)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "getOrderDetailBundle" src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx</automated>
  </verify>
  <done>
    - El sheet llama getOrderDetailBundle una vez; los 5 setState (order, pipelines, products, allTags, orderNotes) se pueblan del bundle
    - Ya no hay Promise.all de 4 actions ni useEffect separado de getOrderNotes
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "getOrderDetailBundle" src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` >= 1
    - `grep -c "getActiveProducts\|getTagsForScope" src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` == 0 (ya no se invocan directo en el load)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Hot-path completo migrado (Plans 02+03): auth local cacheado, ojito colapsado a 1 action, datos de referencia cacheados. Deploy a main (= Vercel prod, Regla 6 trabajo directo en main).
  </what-built>
  <how-to-verify>
    1. Push a main: `git push origin main` (deploy automatico a Vercel). Esperar el deploy.
    2. **Flujo B (ojito) — el win principal:** Abrir /whatsapp en prod, abrir una conversacion con pedidos, click en el ojito (Eye) de un pedido. Debe abrir el sheet con order + pipelines + products + tags + notas notablemente mas rapido (objetivo <300ms percibido). Revisar Network tab: debe haber 1 request de Server Action (getOrderDetailBundle), no 5.
    3. **Flujo A (inbox):** Cambiar entre conversaciones. El hilo de mensajes debe cargar mas rapido.
    4. **Timer honesto (D-10):** en los logs de Vercel, el warn `[perf] getConversationMessages` ahora mide auth+query. Confirmar magnitud real (deberia ser bajo ahora que auth es local).
    5. **Integridad de datos:** el sheet del ojito muestra exactamente los mismos datos que antes (mismo order, mismos productos, mismos tags, mismas notas). Editar un producto/tag/pipeline y reabrir el sheet → el cambio se refleja (revalidateTag funciona).
    6. **Regla 6 / agente:** el agente en prod sigue respondiendo normal (este cambio es solo lecturas de UI; no toca runtime del agente).
  </how-to-verify>
  <resume-signal>Escribe "approved" si la latencia bajo y los datos son correctos, o describe el problema (latencia aun alta / datos faltantes / cache stale / error).</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` verde
- Network: el ojito dispara 1 Server Action, no 5
- `grep -c "revalidateTag('ref:" src/app/actions/products.ts src/app/actions/tags.ts src/app/actions/pipelines.ts` — invalidacion presente en cada uno
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- Suite existente verde: `npx vitest run`
- Checkpoint humano: latencia medible bajo en prod (Flujo A + B)
</verification>

<success_criteria>
- view-order-sheet hace 1 round-trip (getOrderDetailBundle) en vez de 5 actions serializadas
- Datos de referencia leen de Next Data Cache por workspace; mutaciones invalidan por tag
- Latencia del ojito y del cambio de conversacion medibles y notablemente menores en prod
- Datos identicos; agente en prod sin afectacion (Regla 6)
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/03-SUMMARY.md`
</output>
