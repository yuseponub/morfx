---
quick-task: 043
title: Recompra restringida a pipeline 'Ventas Somnio Standard' + selector manual de productos
completed: 2026-04-15
commits:
  - 28c911f  # Task 1: domain
  - dc30c00  # Task 2: server action
  - a33fe19  # Task 3: contact-panel
  - a307ff6  # Task 4: orders-table + orders-view + view-order-sheet
  - (final)  # Task 5: docs + summary
tags: [recompra, pipeline, crm, whatsapp, domain-layer, ui]
one-liner: "Recompra ahora solo crea pedidos en el pipeline 'Ventas Somnio Standard' con productos elegidos manualmente via ProductPicker (4 UIs), validado server-side en el domain."
---

# Quick Task 043 — Recompra solo en Ventas Somnio Standard

## Objetivo

Evitar recompras en pipelines incorrectos y permitir al usuario elegir manualmente los productos del nuevo pedido (en lugar de copiar automaticamente los del pedido origen).

## Archivos modificados (5)

| Archivo | LOC aprox. | Cambio |
|---|---|---|
| `src/lib/domain/orders.ts` | +151 / -16 | Constante `RECOMPRA_PIPELINE_NAME`, `RecompraOrderParams.products[]` requerido, reescritura de `recompraOrder` con validacion pipeline + stage + insercion de productos del usuario + recalculo de `total_value` |
| `src/app/actions/orders.ts` | +31 / -3 | Firma nueva `recompraOrder(orderId, targetStageId, products[])`, validacion `products.length >= 1`, propagacion al domain |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | +63 / -23 | Carga `getActiveProducts()` en Promise.all, `recompraPipeline` memo, state `recompraProducts`, boton Recompra deshabilitado con tooltip, dialogo filtra etapas + integra `ProductPicker` |
| `src/app/(dashboard)/crm/pedidos/components/orders-table.tsx` | +65 / -26 | Misma integracion: `recompraPipeline` memo, `recompraProducts` state, dialogo con `ProductPicker`, handler `onRecompra` gateado con `toast.error` si no hay pipeline |
| `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` | +89 / -40 | Misma integracion en data-table y en kanban (`KanbanBoard.onRecompra` tambien gateado), imports extendidos con `OrderProductFormData` |
| `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` | +97 / -23 | Misma integracion, `ProductPicker` reusa `products` state (ya existia por `getActiveProducts()` en el load initial), boton Recompra deshabilitado con tooltip |
| `docs/analysis/04-estado-actual-plataforma.md` | +1 | Entry nuevo en seccion Pedidos/Ordenes documentando quick-043 |

**Total:** 7 archivos, +497 / -131 LOC, 5 commits atomicos.

## Decisiones clave

### 1. Reutilizacion de `ProductPicker` (componente existente)

`src/app/(dashboard)/crm/pedidos/components/product-picker.tsx` ya implementaba:
- Busqueda de catalogo con debounced search (Command + CommandInput)
- Entrada manual de producto (SKU + titulo + precio)
- Control de cantidad (+/- + input)
- Edicion inline de precio por fila
- Formato COP con `formatCurrency`
- Total calculado en tiempo real

**Decision:** usar tal cual sin modificar, pasarlo al dialogo de recompra de las 4 UIs (orders-table, orders-view, contact-panel, view-order-sheet). Beneficio: zero divergencia de UX entre crear pedido y crear recompra.

### 2. Fuente de `products: Product[]` por UI

| UI | Patron encontrado | Accion |
|---|---|---|
| `contact-panel.tsx` | No tenia productos cargados | Agregado `getActiveProducts()` al `Promise.all` inicial que ya cargaba orders + tags + pipelines |
| `orders-table.tsx` | `products: Product[]` ya llega como prop desde el caller (orders page) | Reutilizado tal cual |
| `orders-view.tsx` | `products: Product[]` ya llega como prop | Reutilizado tal cual |
| `view-order-sheet.tsx` | `products: Product[]` state via `getActiveProducts()` en `loadData()` | Reutilizado tal cual |

**Principio:** preferir `getActiveProducts()` (filtra `is_active=true`) sobre `getProducts()` porque el usuario no deberia poder agregar productos inactivos a un pedido nuevo.

### 3. Defense-in-depth

- **Frontend:** boton Recompra deshabilitado cuando `!recompraPipeline`, con tooltip en espanol que nombra el pipeline esperado.
- **Handler:** si usuario llega al handler con pipeline ausente (edge case race), `toast.error` y no abre el dialogo.
- **Dialogo:** `AlertDialogAction` deshabilitado hasta que haya `recompraStageId && recompraProducts.length >= 1 && recompraPipeline`.
- **Server Action:** valida `products.length >= 1` antes de llamar al domain.
- **Domain:** re-valida products, busca pipeline por nombre + workspace_id (rechaza si no existe), si `targetStageId` viene valida que pertenezca al pipeline destino.

### 4. Campos limpiados en el nuevo pedido

Mantuve la semantica previa: al crear la recompra se limpian `tracking_number`, `carrier`, `carrier_guide_number`, `closing_date`. Consolide la limpieza y el recalculo de `total_value` en un UNICO UPDATE (antes era duplicate → clear, ahora es duplicate → insert products → update total+clear).

### 5. Rollback en error de insert products

Si falla `order_products.insert`, se borra la orden recien duplicada (`supabase.from('orders').delete().eq('id', newOrderId)`) para evitar quedar con un pedido sin productos con `total_value=0`.

## Edge cases manejados

| Edge case | Comportamiento |
|---|---|
| Workspace sin pipeline `Ventas Somnio Standard` | Boton Recompra deshabilitado (tooltip explica). Server action tambien retorna error explicito. |
| `targetStageId` de otro pipeline (manipulacion cliente) | Domain valida `.eq('pipeline_id', targetPipeline.id)` y rechaza con `'La etapa destino no pertenece al pipeline Ventas Somnio Standard'` |
| `products[]` vacio | Action + domain ambos retornan `'Debe seleccionar al menos un producto...'`. UI tiene `disabled` en el AlertDialogAction. |
| Pipeline existe pero sin etapas | `recompraPipeline.stages[0]?.id || ''` → Select vacio → user no puede confirmar (stage vacio). No es caso realista pero no crashea. |
| Producto manual sin product_id (catalog miss) | `ProductPicker` ya soporta `product_id: null` con SKU + titulo + precio custom. Domain acepta `product_id?: string | null` y lo propaga a `order_products`. |
| Multiples usuarios ejecutando recompra concurrente | Cada recompra es una transaccion independiente (duplicate → insert products → update total). Supabase maneja concurrencia via PK. |
| Pipeline renombrado mientras dialogo abierto | Server action re-valida nombre en cada request (no cache). Usuario recibe error "No existe el pipeline..." al confirmar. |

## Verificacion (Task 5 pendiente push)

- `npx tsc --noEmit`: clean para los 5 archivos modificados. Unicos errores son pre-existentes en `src/lib/agents/somnio/__tests__/*.test.ts` por missing `vitest` type declarations (out of scope, mismo estado que todos los quicks anteriores).
- `grep "RECOMPRA_PIPELINE_NAME"`: 5 referencias (1 export + 4 imports en UIs) + 2 usos en domain.
- `grep -rn "recompraOrder("` src/: 7 matches — definicion action (1) + definicion domain (1) + 5 llamadas (contact-panel, orders-table, orders-view, view-order-sheet, action interna que llama al domain). **Todas con 3 args** post-refactor.
- `grep "ProductPicker"` en las 4 UIs: presente y renderizado dentro del dialogo.
- Build Vercel: iniciara post-push.

## Regla 3 (Domain Layer)

Preservada. Toda mutacion sigue pasando por `domainRecompraOrder(ctx, params)`. El server action:
1. Hace auth check.
2. Valida `products.length >= 1` (defensa UX).
3. Delega 100% de la logica de DB al domain (validacion pipeline, validacion stage, duplicate, insert products, recalc total, clear tracking/carrier).
4. Revalida path `/crm/pedidos`.

El domain usa `createAdminClient()` + filtra `workspace_id` en cada query (pipelines, pipeline_stages, orders, order_products).

## Regla 6 (Proteger agente en produccion)

Preservada. El agente Somnio de produccion NO llama a `recompraOrder` — este es 100% UI manual (boton en CRM y WhatsApp inbox). El cambio de firma del server action y del domain NO afecta a ningun tool handler de agentes.

**Verificado:** `grep -rn "recompraOrder" src/lib/agents/` → 0 matches. `grep -rn "recompraOrder" src/lib/ai-sdk/tools/` → 0 matches. Zero callers en paths de agentes.

## Deuda tecnica creada

1. **Constante de pipeline hardcodeada en espanol.** Si algun dia el usuario quiere renombrar el pipeline o soportar multi-idioma, `RECOMPRA_PIPELINE_NAME = 'Ventas Somnio Standard'` deberia moverse a `workspace_settings` (columna `recompra_pipeline_id` FK a `pipelines.id`). No urgente — hoy hay 1 workspace Somnio que usa recompra.
2. **Sin test E2E.** No se agregaron tests (stack no tiene Playwright/Cypress activos para CRM). El usuario verificara manualmente post-push en `/crm/pedidos` + `/whatsapp` en los 4 callers.
3. **i18n pendiente.** Mensajes de error en espanol duros (`"Debe seleccionar al menos un producto"`, `"No existe el pipeline 'Ventas Somnio Standard'..."`). Consistente con el resto del codebase — el modulo CRM nunca ha sido internacionalizado. Aceptable para este quick task.
4. **Domain `duplicateOrder` sigue expuesto con defaults `copyProducts=true`/`copyValue=true`.** Los callers legacy (p.ej. alguna automatizacion que duplique ordenes al cerrar) no fueron tocados — solo `recompraOrder` cambia su invocacion interna a `copyProducts: false, copyValue: false`. Sin regresion.
5. **`contact-panel.tsx` hace 4 fetch paralelos al montar.** Agregue `getActiveProducts()` al Promise.all. Si en el futuro hay muchos productos (>200) podria moverse a fetch lazy al abrir el dialogo, pero hoy los workspaces Somnio tienen <20 productos — premature optimization.

## Siguiente accion (usuario)

Post-push a Vercel:
1. Probar en `/crm/pedidos` tabla: click icono recompra en una fila → verificar dialogo muestra solo etapas de `Ventas Somnio Standard` + `ProductPicker`.
2. Probar en `/crm/pedidos` kanban: mismo flujo via menu contextual de card.
3. Probar en `/whatsapp`: abrir conversacion → click `RefreshCw` en un pedido del contact-panel → verificar dialogo.
4. Probar en `/whatsapp` → click Eye de un pedido → `ViewOrderSheet` → click `Recompra` → verificar dialogo.
5. Probar workspace sin el pipeline: verificar boton aparece deshabilitado con tooltip en espanol.
6. Crear una recompra real: verificar el pedido aterriza en `Ventas Somnio Standard`, tiene SOLO los productos seleccionados, `total_value` matchea la suma, y tracking/carrier/closing_date estan limpios.
