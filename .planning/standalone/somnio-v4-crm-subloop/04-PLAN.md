---
phase: somnio-v4-crm-subloop
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/shared/crm-mutation-tools/orders.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts
requirements: [D-25]
autonomous: true
must_haves:
  truths:
    - "crm-mutation-tools.updateOrder acepta items[] OPCIONAL en su inputSchema"
    - "Cuando items se provee, se mapea a domain.updateOrder.products (que ya soporta reemplazo)"
    - "Cuando items se OMITE, updateOrder se comporta EXACTAMENTE como hoy (sin tocar productos)"
    - "El comentario header de grep-gate refleja que items[] ahora es soportado (V1.1 ya no deferred)"
  artifacts:
    - path: "src/lib/agents/shared/crm-mutation-tools/orders.ts"
      provides: "updateOrder.inputSchema con items[] opcional + passthrough a domain products"
      contains: "items"
    - path: "src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts"
      provides: "tests updateOrder con items + updateOrder sin items (no regresion)"
      contains: "updateOrder"
  key_links:
    - from: "crm-mutation-tools updateOrder"
      to: "domain.updateOrder products"
      via: "items mapped to products replacement"
      pattern: "products"
---

<objective>
D-25 (SUP-1) — extender `crm-mutation-tools.updateOrder` con `items[]` OPCIONAL. Es la feature
V1.1-deferred que el rediseño del lifecycle necesita: el cascarón nace SIN producto (datos+nopack,
D-15) y luego, cuando el cliente elige pack (D-17), se ENRIQUECE el cascarón via updateOrder con el
pack. Hoy `updateOrder` excluye `products` por diseño (header `crm-mutation-tools/orders.ts:7-9`
"V1.1 deferred"), bloqueando el paso 2 del lifecycle.

Hecho clave verificado en plan-time: `domain.updateOrder` (UpdateOrderParams:99-113) **YA acepta
`products`** y reemplaza todos los productos cuando se provee (orders.ts:462-487). El UNICO bloqueo
es el inputSchema de la TOOL. Por tanto el cambio es minimo: agregar `items[]` opcional al schema +
mapearlo a `products` en la llamada a `domainUpdateOrder`.

Regla 6 — TOQUE A MODULO COMPARTIDO, justificado y aprobado por el usuario (D-25):
- `crm-mutation-tools` tiene **0 consumidores en prod** (CLAUDE.md: "Sin consumidores en prod al ship").
  El blast radius real es nulo.
- El cambio es **aditivo/opcional**: `items` es `.optional()`. Llamadas existentes que NO pasan items
  se comportan EXACTAMENTE igual (no se tocan productos). Esto es lo que hace el cambio Regla-6-safe
  por opcionalidad (mismo razonamiento que el campo opcional del standalone #1).
- crm-writer (coexiste, D-01) NO se toca — es otro modulo.

Purpose: habilitar el enriquecimiento del cascarón con el pack tardío (D-17) sin recrear el pedido
(que generaria basura CRM + violaria idempotencia clase Doralba). Output: updateOrder con items[].

NO se toca createOrder (ya acepta items, orders.ts:86-96). NO se toca domain. NO se toca crm-writer.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md

<interfaces>
<!-- Contratos verbatim. NO explorar. -->

updateOrder tool actual (crm-mutation-tools/orders.ts:222-275):
- inputSchema (z.object) actual: { orderId(uuid), contactId(uuid nullable optional), closingDate,
  description, name, shippingAddress, shippingCity, shippingDepartment } — SIN items/products.
- execute llama `domainUpdateOrder(domainCtx, { orderId, contactId, closingDate, description, name,
  shippingAddress, shippingCity, shippingDepartment })` (:266-275) — NO pasa products hoy.
- Pre-check via getOrderById -> resource_not_found short-circuit (:250-263).

createOrder tool items schema (orders.ts:86-96) — REUSAR la MISMA forma exacta para consistencia:
```
items: z.array(z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().min(1),
  title: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
})).optional()
```

domain.updateOrder (orders.ts:413+): UpdateOrderParams ya tiene `products?: Array<{...}>` (:113);
cuando `params.products !== undefined` REEMPLAZA todos los productos (delete + insert, :462-487) y
recalcula total_value. Cuando undefined -> NO toca productos. Mapear items->products con la misma
forma { sku, title, unitPrice, quantity, productId? } que createOrder usa al llamar domain.

Header grep-gate a actualizar (orders.ts:7-9): hoy dice "NO products field in updateOrder.inputSchema
(V1.1 deferred...)". Debe reflejar que items[] ya es soportado (standalone somnio-v4-crm-subloop D-25).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: updateOrder.inputSchema += items[] opcional + passthrough a domain + header</name>
  <files>src/lib/agents/shared/crm-mutation-tools/orders.ts, src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts</files>
  <read_first>
    src/lib/agents/shared/crm-mutation-tools/orders.ts (updateOrder :222-275, createOrder items schema :86-96, header :1-29)
    src/lib/domain/orders.ts (updateOrder :413+, UpdateOrderParams :99-113, products replacement :462-487)
    RESEARCH.md §S2 BLOCKER + §SUP-1 (D-25)
  </read_first>
  <behavior>
    - Test "updateOrder con items reemplaza productos": llamar updateOrder({ orderId, items:[{sku,title,unitPrice,quantity}] }) -> domain.updateOrder recibe products con la misma forma -> status 'executed' + OrderDetail re-hidratado con el nuevo total_value.
    - Test "updateOrder SIN items no toca productos (no regresion)": llamar updateOrder({ orderId, shippingCity:'Bogota' }) -> domain.updateOrder recibe products undefined (NO se pasa la key) -> el comportamiento es identico al actual.
    - Test "items vacio []": updateOrder({ orderId, items:[] }) -> domain recibe products:[] -> reemplaza por 0 productos (cascaron vaciado) — comportamiento explicito (no es lo mismo que omitir).
  </behavior>
  <action>
    En `src/lib/agents/shared/crm-mutation-tools/orders.ts`:
    1. Header (:7-9): cambiar el bullet "NO products field in updateOrder.inputSchema (V1.1 deferred...)"
       por: `// items[] field in updateOrder.inputSchema SUPPORTED (standalone somnio-v4-crm-subloop D-25 — V1.1 unblocked). Maps to domain.updateOrder.products (replace-all). Optional: omitir items NO toca productos.`
    2. updateOrder.inputSchema (:228-237): AGREGAR `items` con la MISMA forma exacta que createOrder
       (:86-96) — copiar verbatim el `items: z.array(z.object({ productId: z.string().uuid().optional(),
       sku: z.string().min(1), title: z.string().min(1), unitPrice: z.number().nonnegative(), quantity:
       z.number().int().positive() })).optional()`.
    3. updateOrder.description (:223-227): actualizar el texto que dice "NO incluye items (V1.1
       deferred...)" -> describir que items[] ahora reemplaza los productos del pedido (replace-all),
       opcional.
    4. En el execute (:266-275): mapear items->products SOLO si items esta presente. Usar:
       `products: input.items ? input.items.map((it) => ({ productId: it.productId, sku: it.sku, title:
       it.title, unitPrice: it.unitPrice, quantity: it.quantity })) : undefined`. Pasar `products` al
       objeto que se entrega a `domainUpdateOrder`. CRITICO: cuando input.items es undefined, `products`
       DEBE quedar `undefined` (NO `[]`) para preservar el comportamiento actual (domain solo reemplaza
       cuando products !== undefined).
    Comentar D-25 + que es aditivo/opcional. NO tocar createOrder. NO tocar otras tools.

    En `src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` AGREGAR los 3 tests del
    behavior (espejar el patron de mocks de domain ya usado en ese archivo para createOrder/updateOrder).
  </action>
  <acceptance_criteria>
    - `grep -A12 "updateOrder: tool" src/lib/agents/shared/crm-mutation-tools/orders.ts | grep "items:"` retorna match (items en el schema de updateOrder).
    - `grep -n "input.items ?" src/lib/agents/shared/crm-mutation-tools/orders.ts` retorna match (passthrough condicional a products).
    - `grep -n "NO products field in updateOrder" src/lib/agents/shared/crm-mutation-tools/orders.ts` retorna VACIO (header actualizado).
    - `grep -n "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/orders.ts` retorna VACIO (Regla 3 intacta).
    - `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` verde (incl. los 3 nuevos + los existentes sin regresion).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts 2>&1 | tail -25</automated>
  </verify>
  <done>updateOrder acepta items[] opcional; mapea a domain products solo si presente; omitir items = comportamiento actual; header actualizado; Regla 3 intacta; suite verde sin regresion.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| LLM tool args (items) → domain products | input no confiable; Zod valida shape antes de domain write |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-upd-01 | Tampering (precio/cantidad invalida) | updateOrder.items | mitigate | z.number().nonnegative() + z.number().int().positive() en el schema (verbatim de createOrder) |
| T-upd-02 | Regresion modulo compartido | crm-mutation-tools | mitigate | items opcional; test "sin items no regresion"; 0 consumidores prod (D-08) |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts` verde.
- `npx vitest run src/lib/agents/shared/crm-mutation-tools/` (suite completa del modulo) verde — no regresion en createOrder/moveOrderToStage/etc.
- Greps de acceptance pasan.
</verification>

<success_criteria>
updateOrder soporta items[] opcional mapeado a domain products (replace-all); omitir items preserva
comportamiento actual; header refleja D-25; Regla 3 intacta; aditivo/opcional Regla-6-safe; suite verde.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/04-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): crm-mutation-tools.updateOrder += items[] opcional (D-25) — enriquecer cascaron con pack`
</output>
