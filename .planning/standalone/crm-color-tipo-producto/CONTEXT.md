# CRM — Color por Tipo de Producto en Cards de Órdenes — CONTEXT

**Fecha:** 2026-04-16
**Tipo:** Standalone task (fix urgente de producción)
**Workspace objetivo:** Somnio (pipeline "Ventas Somnio Standard")
**Estado:** Ready for planning

## Goal

Mostrar visualmente en las cards de órdenes del CRM (Kanban y tabla) qué tipo(s) de producto contiene cada orden, usando un color por tipo, para evitar errores al despachar pedidos equivocados.

**Tipos y colores:**
- **Melatonina** → verde
- **Ash** → naranja
- **Magnesio Forte** → morado (poco vendido hasta ahora, pero debe estar soportado)

## Background / Problema

En producción se están despachando pedidos equivocados porque las cards del CRM solo muestran el título del primer producto (`kanban-card.tsx:133-141`) sin distinguir visualmente el tipo. Cuando el operador revisa el Kanban rápido, no puede diferenciar a simple vista qué producto lleva cada orden, y menos cuando una orden tiene más de un tipo.

Las órdenes llegan desde 2 flujos:
1. **Página web (Shopify)** → webhook `orders/create` → `src/lib/shopify/webhook-handler.ts:146` mapea `line_items` a `products[]` con `sku + title`.
2. **WhatsApp** → action `create_order` en `src/lib/automations/action-executor.ts:493` `executeCreateOrder()` → recibe productos del agente/trigger context con `sku + title + unitPrice + quantity`.

Ambos flujos insertan en la misma tabla `order_products` (`sku`, `title`, `unit_price`, `quantity`, `product_id`).

## Decisions

### 1. Detección del tipo de producto — híbrida SKU + texto en título

**Prioridad de detección (en este orden):**
1. **SKU exacto** — si el `order_products.sku` coincide con alguna entrada del mapeo `SKU → tipo`, usar ese tipo. Aplica sobre todo a órdenes de Shopify (SKUs reales del inventario Shopify) y a productos del catálogo interno CRM (ya tienen SKU asignado en la tabla `products`).
2. **Fallback: contiene texto en el título** (case-insensitive) — si el SKU no matchea o está vacío:
   - `title` contiene `"melatonina"` → **melatonina**
   - `title` contiene `"ash"` (palabra completa, para no capturar "dash", "crash", etc.) → **ash**
   - `title` contiene `"magnesio"` → **magnesio forte**
3. **Sin match** → sin color (no se muestra nada para ese producto).

**Nota:** El workspace Somnio solo vende estos 3 productos, así que en la práctica todos los productos deberían matchear por SKU o por título. El caso "sin match" queda como safety net.

### 2. Ubicación del mapeo SKU → tipo

- **Archivo nuevo:** `src/lib/orders/product-types.ts`
- Exporta:
  - `type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'`
  - `PRODUCT_TYPE_COLORS: Record<ProductType, { label, dot, textClass, bgClass }>` — definición visual.
  - `SKU_TO_PRODUCT_TYPE: Record<string, ProductType>` — mapeo explícito SKU → tipo.
  - `detectProductType(product: { sku?: string | null; title?: string | null }): ProductType | null` — función pura, recibe un OrderProduct y retorna el tipo o null.
  - `detectOrderProductTypes(products: Array<...>): ProductType[]` — recibe el array de `order.products`, retorna array único (dedupe) de tipos presentes en la orden, ordenado de forma estable.

**SKUs reales a llenar durante planning/execution:** el usuario deberá confirmar los SKUs exactos de Shopify + los SKUs del catálogo interno. Se puede hacer query a la tabla `products` del workspace Somnio para obtenerlos, o el usuario los provee en el siguiente paso.

### 3. Storage — derivado en render, sin migración de DB

- **No** se agrega columna `product_type` en `order_products`.
- **No** se modifica el schema.
- **No** hay backfill de órdenes existentes.
- La detección es pura y se ejecuta en tiempo de render (muy barato — máximo N productos por card, usualmente 1-3).

**Razón:** fix urgente, cambios mínimos, menor riesgo. Si mañana cambian los SKUs o agregan un 4º producto, solo se actualiza el archivo `product-types.ts`. No requiere migración ni coordinación DB↔deploy (respeta REGLA 5).

### 4. Mostrar MÚLTIPLES tipos en la misma card

- Si una orden tiene más de un tipo, **mostrar un dot/pill por cada tipo detectado** (ej: verde + naranja si lleva melatonina + ash).
- Orden estable de los dots: melatonina → ash → magnesio_forte (orden alfabético/definido en constante).
- Sin badge "MIXTO" adicional — los múltiples dots son suficientemente visibles.
- Sin colapsar ni priorizar un color sobre otro — todos los tipos presentes se muestran.

### 5. Formato visual (card)

- **Componente:** dots de color (círculo pequeño ~8-10px) en la zona del summary de productos de la card Kanban.
- **Ubicación exacta:** justo antes del texto del primer producto en `kanban-card.tsx:133-141`, o como prefijo visual del bloque de productos.
- **Con tooltip** (opcional/estretch): al hacer hover sobre el dot muestra el label del tipo ("Melatonina", "Ash", "Magnesio Forte").
- **Colores de Tailwind exactos a usar** (definir en `PRODUCT_TYPE_COLORS`):
  - Melatonina → `bg-green-500` (o `bg-emerald-500`)
  - Ash → `bg-orange-500`
  - Magnesio Forte → `bg-purple-500`
- Fondo de la card sin cambios (evita sobrecargar visualmente y no interfiere con otros colores existentes como tags).

### 6. Alcance de la UI — dónde aplicar

- **In-scope:** Kanban cards en `/crm/pedidos` (`src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`).
- **In-scope:** Tabla de órdenes en `/crm/pedidos` (`src/app/(dashboard)/crm/pedidos/components/orders-table.tsx`) — agregar los dots en la columna de productos si aplica.
- **Out-of-scope:** Widget card (vista de detalle expandida / sheets) — el usuario lo descartó explícitamente.
- **Out-of-scope:** Vista de la conversación de WhatsApp (`contact-panel.tsx`, `view-order-sheet.tsx`).

### 7. Productos "otros" (no son los 3)

- El usuario confirmó que el workspace Somnio solo vende melatonina, ash y magnesio forte.
- Si la función `detectProductType` retorna `null` para TODOS los productos de una orden (no debería pasar en producción normal), la card se renderiza **sin dots** (comportamiento actual).
- No se muestra un dot gris/badge "Otro" — se mantiene simple.

## Technical Scope

### Archivos a crear
- `src/lib/orders/product-types.ts` — mapeo SKU → tipo, constantes de color, funciones puras de detección.

### Archivos a modificar
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` — agregar dots de color derivados de `detectOrderProductTypes(order.products)`.
- `src/app/(dashboard)/crm/pedidos/components/orders-table.tsx` — misma lógica en columna de productos (si es visualmente consistente).

### Archivos de referencia (NO modificar)
- `src/lib/shopify/webhook-handler.ts:146` — mapeo de line_items desde Shopify.
- `src/lib/automations/action-executor.ts:493` — creación de órdenes desde WhatsApp.
- `supabase/migrations/20260129000003_orders_foundation.sql:66-113` — schema `order_products`.

### Tests / verificación
- Sin tests automatizados (stack no tiene Playwright/Cypress activos en CRM).
- Verificación manual post-deploy:
  - Card Kanban con orden melatonina sola → dot verde.
  - Card Kanban con orden ash sola → dot naranja.
  - Card Kanban con orden magnesio forte sola → dot morado.
  - Card Kanban con orden melatonina + ash → dot verde + dot naranja.
  - Card Kanban con orden de Shopify (SKU real) → detecta por SKU.
  - Card Kanban con orden de WhatsApp con título libre → detecta por título (fallback).
  - Orden sin productos o con producto sin match → sin dots (no crashea).

### Reglas aplicables del proyecto

- **REGLA 3 (Domain layer):** no aplica — este fix es 100% UI derivada, sin mutaciones. No se toca `src/lib/domain/`.
- **REGLA 5 (Migración antes de deploy):** no aplica — sin cambios de schema.
- **REGLA 6 (Proteger agente en producción):** no aplica — este fix NO toca comportamiento de agentes ni ningún path que ejecute el agente Somnio en producción.
- **REGLA 1 (Push a Vercel):** aplica al final — commit atómico + push antes de pedir verificación.
- **REGLA 4 (Documentación actualizada):** al cerrar, actualizar `docs/analysis/04-estado-actual-plataforma.md` sección Pedidos/Órdenes si aplica, y dejar LEARNINGS en el standalone dir.

## Open questions (para planning)

1. **SKUs exactos** — el planner o el usuario deberá llenar el mapeo `SKU_TO_PRODUCT_TYPE` con los SKUs reales:
   - SKUs de Shopify (3 productos) — query a la API Shopify o revisar últimas órdenes de Shopify en DB.
   - SKUs del catálogo interno CRM (tabla `products`, filtrar por workspace Somnio).

## Out of Scope

- Modificar el schema de DB para agregar columna `product_type`.
- Backfill de órdenes históricas.
- Widget card / vista de detalle de orden.
- Vistas de WhatsApp (contact-panel, view-order-sheet).
- Configuración dinámica de tipos/colores desde UI (los 3 tipos están hardcoded por ahora — si mañana se amplía, se mueve a workspace_settings).
- Aplicar colores a tags, filtros o reportes — solo cards.
- Agregar icono por tipo además del color.
- Modificar los flujos de creación de órdenes (Shopify webhook o WhatsApp action) — la detección es derivada, NO se guarda en DB.
