---
phase: 043-recompra-solo-ventas-somnio-standard
plan: 043
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/orders.ts
  - src/app/actions/orders.ts
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
autonomous: true

must_haves:
  truths:
    - "El botón 'Recompra' solo permite crear pedidos en etapas del pipeline 'Ventas Somnio Standard'."
    - "El botón 'Recompra' se deshabilita si el workspace no tiene un pipeline con nombre exacto 'Ventas Somnio Standard'."
    - "El diálogo de recompra muestra un selector múltiple de productos (≥1 requerido) en lugar de copiar productos del pedido origen."
    - "El backend valida server-side que el targetStageId pertenece al pipeline 'Ventas Somnio Standard' antes de crear la recompra."
    - "El pedido creado por recompra contiene exactamente los productos seleccionados por el usuario (no los del pedido origen)."
  artifacts:
    - path: "src/lib/domain/orders.ts"
      provides: "recompraOrder con products[] + validación pipeline name; export RECOMPRA_PIPELINE_NAME"
      contains: "RECOMPRA_PIPELINE_NAME"
    - path: "src/app/actions/orders.ts"
      provides: "Server action recompraOrder acepta products[] y los propaga al domain"
    - path: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      provides: "Diálogo recompra con filtro de pipeline + ProductPicker + disable si no existe pipeline"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-table.tsx"
      provides: "Diálogo recompra con filtro de pipeline + ProductPicker + disable si no existe pipeline"
  key_links:
    - from: "contact-panel.tsx & orders-table.tsx"
      to: "recompraOrder server action"
      via: "llamada con { orderId, targetStageId, products[] }"
      pattern: "recompraOrder\\([^)]*products"
    - from: "src/app/actions/orders.ts recompraOrder"
      to: "src/lib/domain/orders.ts recompraOrder"
      via: "propagación de params.products al domain (Regla 3)"
      pattern: "domainRecompraOrder\\([^)]*products"
    - from: "src/lib/domain/orders.ts recompraOrder"
      to: "pipelines table"
      via: "query por name=RECOMPRA_PIPELINE_NAME + workspace_id, validación targetStageId ∈ pipeline"
      pattern: "RECOMPRA_PIPELINE_NAME"
---

<objective>
Restringir el botón "Recompra" para que solo cree pedidos en el pipeline "Ventas Somnio Standard" y permitir al usuario elegir manualmente los productos de la recompra (selector múltiple) en lugar de copiar automáticamente los productos del pedido origen.

Purpose: Evitar recompras erróneas en pipelines incorrectos y permitir ajustar el contenido del pedido nuevo (cliente puede querer productos distintos al pedido original).
Output:
- Constante `RECOMPRA_PIPELINE_NAME = 'Ventas Somnio Standard'` en `src/lib/domain/orders.ts`.
- `recompraOrder` (domain + action) acepta `products[]` y valida pipeline server-side.
- UI (contact-panel + orders-table) filtra pipelines, deshabilita botón si falta el pipeline, y usa `ProductPicker` existente para selección múltiple.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/domain/orders.ts
@src/app/actions/orders.ts
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
@src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
@src/app/(dashboard)/crm/pedidos/components/product-picker.tsx
@src/lib/orders/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — domain recompraOrder con products[] + validación pipeline</name>
  <files>src/lib/domain/orders.ts</files>
  <action>
1. Exportar constante al inicio del archivo (junto a otros constants o tras los imports):
   ```ts
   export const RECOMPRA_PIPELINE_NAME = 'Ventas Somnio Standard' as const
   ```
2. Modificar `RecompraOrderParams` (línea ~93) para aceptar productos seleccionados por el usuario:
   ```ts
   export interface RecompraOrderParams {
     sourceOrderId: string
     targetStageId?: string | null
     /** Productos seleccionados por el usuario para la recompra. Requerido: ≥1. */
     products: Array<{ product_id?: string | null; sku: string; title: string; unit_price: number; quantity: number }>
   }
   ```
3. Reescribir `recompraOrder` (línea ~915) con este flujo:
   - Validar `params.products.length >= 1` → si no, retornar `{ success: false, error: 'Debe seleccionar al menos un producto para la recompra' }`.
   - Buscar el pipeline destino por nombre exacto (case-sensitive):
     ```ts
     const { data: targetPipeline } = await supabase
       .from('pipelines')
       .select('id')
       .eq('workspace_id', ctx.workspaceId)
       .eq('name', RECOMPRA_PIPELINE_NAME)
       .maybeSingle()
     if (!targetPipeline) return { success: false, error: `No existe el pipeline '${RECOMPRA_PIPELINE_NAME}' en este workspace` }
     ```
   - Si `params.targetStageId` viene, validar que pertenece a `targetPipeline.id`:
     ```ts
     const { data: stage } = await supabase
       .from('pipeline_stages')
       .select('id')
       .eq('id', params.targetStageId)
       .eq('pipeline_id', targetPipeline.id)
       .maybeSingle()
     if (!stage) return { success: false, error: 'La etapa destino no pertenece al pipeline Ventas Somnio Standard' }
     ```
   - Llamar `duplicateOrder` con `targetPipelineId: targetPipeline.id`, `targetStageId`, `copyContact: true`, **`copyProducts: false`** (ya no copiamos), `copyValue: false` (total se recalcula desde products[]).
   - Tras duplicar, insertar los productos seleccionados en `order_products` (tabla ya usada por `duplicateOrder`; seguir ese mismo patrón de insert — revisar líneas ~800-830 de orders.ts para ver la estructura exacta de `order_products`). Campos: `order_id = dupResult.data.orderId`, `workspace_id = ctx.workspaceId`, `product_id`, `sku`, `title`, `unit_price`, `quantity`, `total_price = unit_price * quantity`.
   - Recalcular `total_value` del pedido nuevo = `sum(unit_price * quantity)` y actualizar en tabla `orders` en el mismo UPDATE donde se limpian tracking/carrier/guide/closing_date.
   - Mantener el clear de `tracking_number/carrier/carrier_guide_number/closing_date` existente.
4. NO tocar `duplicateOrder` (se mantiene backward-compatible con otros llamadores).
5. Preservar Regla 3: sigue usando `createAdminClient()` + filtro `workspace_id` en cada query.
  </action>
  <verify>
- `pnpm tsc --noEmit` pasa sin errores en `src/lib/domain/orders.ts`.
- Grep confirma: `grep -n "RECOMPRA_PIPELINE_NAME" src/lib/domain/orders.ts` muestra export + uso en recompraOrder.
- Leer la función completa y verificar: (a) valida products.length ≥ 1, (b) busca pipeline por nombre, (c) valida targetStageId ∈ pipeline, (d) inserta products del params (no del source), (e) recalcula total_value.
  </verify>
  <done>
Domain `recompraOrder` acepta `products[]`, valida server-side que el pipeline destino es 'Ventas Somnio Standard' y que la etapa pertenece a ese pipeline. Inserta los productos del usuario y recalcula total_value. Constante `RECOMPRA_PIPELINE_NAME` exportada.
  </done>
</task>

<task type="auto">
  <name>Task 2: Server action recompraOrder propaga products[]</name>
  <files>src/app/actions/orders.ts</files>
  <action>
1. Modificar la firma de `recompraOrder` (línea ~663):
   ```ts
   export async function recompraOrder(
     orderId: string,
     targetStageId: string,
     products: Array<{ product_id?: string | null; sku: string; title: string; unit_price: number; quantity: number }>
   ): Promise<ActionResult<{ orderId: string }>>
   ```
   - `targetStageId` ya no es opcional (UI siempre la provee tras filtrar).
   - Validar `products.length >= 1` al inicio → retornar `{ error: 'Debe seleccionar al menos un producto' }` si no.
2. Propagar al domain:
   ```ts
   const result = await domainRecompraOrder(ctx, {
     sourceOrderId: orderId,
     targetStageId,
     products,
   })
   ```
3. Revisar que no hay otros llamadores en el codebase con `grep -rn "recompraOrder(" src/` — si hay llamadas fuera de contact-panel y orders-table, actualizarlas también (son los únicos esperados según el scope).
  </action>
  <verify>
- `pnpm tsc --noEmit` pasa.
- `grep -rn "recompraOrder(" src/` muestra solo las llamadas esperadas (action definition + contact-panel + orders-table), todas con 3 args.
  </verify>
  <done>
Server action propaga `products[]` al domain. Validación de presencia de productos en capa action (defensa adicional al domain).
  </done>
</task>

<task type="auto">
  <name>Task 3: UI contact-panel.tsx — filtro pipeline + ProductPicker + disable button</name>
  <files>src/app/(dashboard)/whatsapp/components/contact-panel.tsx</files>
  <action>
1. Importar constante y componente:
   ```ts
   import { RECOMPRA_PIPELINE_NAME } from '@/lib/domain/orders'
   import { ProductPicker } from '@/app/(dashboard)/crm/pedidos/components/product-picker'
   import type { OrderProductFormData, Product } from '@/lib/orders/types'
   ```
2. Calcular el pipeline target (memoizado). Localizar donde `pipelines` (todas) están disponibles en el componente (~línea 400-640). Agregar:
   ```ts
   const recompraPipeline = useMemo(
     () => pipelines.find((p) => p.name === RECOMPRA_PIPELINE_NAME),
     [pipelines]
   )
   const recompraDisabled = !recompraPipeline
   ```
3. Agregar state para productos seleccionados:
   ```ts
   const [recompraProducts, setRecompraProducts] = useState<OrderProductFormData[]>([])
   ```
4. Modificar el botón "Recompra" (~línea 640-645): añadir `disabled={recompraDisabled}` y `title={recompraDisabled ? \`No existe el pipeline '${RECOMPRA_PIPELINE_NAME}' en este workspace\` : 'Recompra'}`.
5. Al abrir el diálogo (setRecompraOrderId), inicializar:
   - `setRecompraStageId(recompraPipeline?.stages[0]?.id || '')` (NO usar `orderPipeline` — siempre el recompra pipeline).
   - `setRecompraProducts([])` (usuario debe agregar manualmente).
6. En el `<Select>` de etapas (~línea 750): iterar `recompraPipeline?.stages ?? []` en vez de todos los pipelines/etapas. Si el diálogo se abrió pero recompraPipeline es null (edge case), mostrar mensaje de error y no renderizar Select.
7. Agregar debajo del Select de etapa, dentro del diálogo, el `<ProductPicker>`:
   - Necesita `products: Product[]` del workspace. Verificar si el componente ya tiene acceso a la lista de productos (buscar `products` como prop/state/fetch). Si no existe, cargarla via el mismo hook/query que use `OrderForm` (buscar en `order-form.tsx` cómo obtiene `products`). Cargar on-demand al abrir el diálogo si es necesario (useEffect + supabase query filtrada por workspace_id, o reutilizar hook existente).
   ```tsx
   <ProductPicker
     products={productsList}
     value={recompraProducts}
     onChange={setRecompraProducts}
   />
   ```
8. Modificar `handleRecompra` (~línea 528):
   - Validar `recompraStageId && recompraProducts.length >= 1`.
   - Llamar `recompraOrder(recompraOrderId, recompraStageId, recompraProducts.map(p => ({ product_id: p.product_id, sku: p.sku, title: p.title, unit_price: p.unit_price, quantity: p.quantity })))`.
   - Limpiar `setRecompraProducts([])` al cerrar.
9. Cambiar el `disabled` del botón `<AlertDialogAction>` (~línea 770): `disabled={!recompraStageId || recompraProducts.length === 0}`.
10. NO tocar comportamiento del agente de producción (Regla 6): esto es UI manual.
  </action>
  <verify>
- `pnpm tsc --noEmit` pasa.
- Build dev: `pnpm dev` compila sin errores en contact-panel.tsx.
- Verificación visual manual NO requerida en este plan (el usuario probará tras push). Grep confirma: (a) `RECOMPRA_PIPELINE_NAME` importado y usado, (b) `ProductPicker` renderizado en el diálogo, (c) botón tiene `disabled={recompraDisabled}`, (d) Select itera `recompraPipeline?.stages`.
  </verify>
  <done>
En WhatsApp > ContactPanel: botón Recompra deshabilitado si falta pipeline; diálogo muestra solo etapas de 'Ventas Somnio Standard' y `ProductPicker` para elegir productos. Llamada al action propaga products[].
  </done>
</task>

<task type="auto">
  <name>Task 4: UI orders-table.tsx — filtro pipeline + ProductPicker + disable button</name>
  <files>src/app/(dashboard)/crm/pedidos/components/orders-table.tsx</files>
  <action>
Aplicar los MISMOS cambios del Task 3 adaptados a este archivo (mismo patrón de state + dialog, líneas 35/65-67/117-122/142-154/340-374):
1. Imports: `RECOMPRA_PIPELINE_NAME`, `ProductPicker`, types.
2. `recompraPipeline = useMemo(() => pipelines.find(p => p.name === RECOMPRA_PIPELINE_NAME), [pipelines])`.
3. State `recompraProducts: OrderProductFormData[]`.
4. Botón Recompra (revisar `columns.tsx` si el botón se define ahí — la acción llega vía `onRecompra` prop): añadir `disabled` derivado de `recompraDisabled` y propagar al column action si aplica. Si `onRecompra` ya se invoca desde columns.tsx sin check, añadir el check al abrir el diálogo (si recompraDisabled, mostrar toast de error y no abrir). Preferir gate en el handler `onRecompra` dentro de orders-table.tsx.
5. Al abrir diálogo: `setRecompraStageId(recompraPipeline?.stages[0]?.id || '')`, `setRecompraProducts([])`.
6. Select itera `recompraPipeline?.stages ?? []`.
7. Agregar `<ProductPicker>` en el diálogo (mismo patrón Task 3). Reutilizar la lista de productos del workspace (buscar cómo `OrderForm` / `order-sheet.tsx` la obtiene; probablemente hay un prop o hook compartido en `orders-view.tsx` que se pueda pasar down).
8. `handleRecompra` llama `recompraOrder(orderId, stageId, products.map(...))`.
9. `AlertDialogAction` disabled cuando `!recompraStageId || recompraProducts.length === 0`.
  </action>
  <verify>
- `pnpm tsc --noEmit` pasa (sin errores en orders-table.tsx).
- Grep confirma mismos 4 puntos que en Task 3 aplicados a orders-table.tsx.
- `pnpm build` completa sin errores de TypeScript/ESLint.
  </verify>
  <done>
En CRM > Pedidos tabla: botón Recompra deshabilitado si falta pipeline; diálogo filtra etapas a 'Ventas Somnio Standard' y usa `ProductPicker`. UI consistente con contact-panel.
  </done>
</task>

<task type="auto">
  <name>Task 5: Commit + push a Vercel</name>
  <files>(git)</files>
  <action>
Siguiendo Regla 1 (push a Vercel) y Regla 4 (docs actualizados):
1. Actualizar `docs/analysis/04-estado-actual-plataforma.md` sección de CRM/Pedidos: agregar nota "Botón Recompra restringido a pipeline 'Ventas Somnio Standard' con selector múltiple de productos (2026-04-15)".
2. Crear commits atómicos (uno por cada Task 1-4) o un commit agrupado con mensaje claro en español:
   ```
   feat(recompra): restringir a pipeline Ventas Somnio Standard + selector productos

   - Constante RECOMPRA_PIPELINE_NAME en domain/orders.ts
   - Domain valida pipeline por nombre y stage ∈ pipeline (defensa Regla 3)
   - UI filtra etapas del pipeline único y deshabilita botón si no existe
   - ProductPicker reemplaza copy automático de productos del pedido origen
   - Server action acepta products[] y los propaga al domain

   Co-authored-by: Claude <noreply@anthropic.com>
   ```
3. `git push origin main` y confirmar que Vercel inicia deploy.
4. Avisar al usuario para probar en producción (CRM > Pedidos + WhatsApp > ContactPanel).
  </action>
  <verify>
- `git log -1` muestra el commit.
- `git push` exitoso (Vercel deploy iniciado).
- Docs actualizados en `docs/analysis/04-estado-actual-plataforma.md`.
  </verify>
  <done>
Código en producción. Usuario notificado para probar el flujo de recompra desde ambas UIs.
  </done>
</task>

</tasks>

<verification>
1. **TypeScript:** `pnpm tsc --noEmit` pasa en todo el proyecto.
2. **Build:** `pnpm build` completa sin errores.
3. **Regla 3 (Domain Layer):** Toda mutación sigue pasando por `src/lib/domain/orders.ts`. Server action no escribe directo a Supabase.
4. **Regla 6 (Proteger agente):** Ningún cambio afecta el agente de producción — es UI manual.
5. **Defense-in-depth:** Frontend filtra pipeline + Backend revalida por nombre + valida stage pertenece al pipeline.
6. **Reuse:** `ProductPicker` existente (`crm/pedidos/components/product-picker.tsx`) usado en ambas UIs.
</verification>

<success_criteria>
- [ ] `RECOMPRA_PIPELINE_NAME` exportado y referenciado en domain, contact-panel, orders-table.
- [ ] Botón "Recompra" deshabilitado cuando el workspace no tiene pipeline 'Ventas Somnio Standard'.
- [ ] Diálogo de recompra muestra SOLO etapas del pipeline 'Ventas Somnio Standard'.
- [ ] `ProductPicker` renderizado en el diálogo; botón "Crear recompra" deshabilitado con 0 productos.
- [ ] Server-side: domain valida pipeline por nombre + stage pertenece al pipeline (return error si no).
- [ ] Pedido creado contiene los productos seleccionados por el usuario (NO los del pedido origen); `total_value` recalculado.
- [ ] Commits pusheados a Vercel; docs actualizados.
</success_criteria>

<output>
After completion, create `.planning/quick/043-recompra-solo-ventas-somnio-standard/043-SUMMARY.md` documentando:
- Archivos modificados y LOC.
- Decisión de reutilizar `ProductPicker` existente.
- Cómo se obtiene la lista de productos en cada UI (pattern encontrado).
- Edge cases manejados (workspace sin pipeline, stage de otro pipeline, 0 productos).
- Cualquier deuda técnica creada (ej: falta i18n del mensaje de error, falta test E2E).
</output>
