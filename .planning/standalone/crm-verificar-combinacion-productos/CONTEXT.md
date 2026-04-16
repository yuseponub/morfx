# CRM — Verificar Combinación de Productos en Creación de Guías — CONTEXT

**Fecha:** 2026-04-16
**Tipo:** Standalone task (protección anti-error en despacho)
**Workspace objetivo:** Somnio (4 flujos de creación de guías)
**Estado:** Ready for planning

## Goal

Antes de que un agente genere guías (4 flujos distintos: robot Coordinadora, Excel Envía, PDF Inter, PDF Bogotá), detectar si cada orden tiene una combinación de productos que NO sea Elixir puro, y aplicar un comportamiento específico por flujo para evitar despachar mercancía equivocada.

## Background

Fase de continuación del trabajo visual en cards (ver `crm-color-tipo-producto`). Los dots de colores evitaron errores de despacho al revisar el Kanban, pero la generación de guías sigue siendo ciega a la combinación: el agente puede generar una guía Coordinadora de una orden con Ashwagandha que no hay en la bodega de Coord.

**Los 3 productos de Somnio:**
- **Elixir** — fórmula interna contiene melatonina + magnesio en una sola cápsula. Type `'melatonina'` en `src/lib/orders/product-types.ts`. SKUs `001-003, 010-011, SOMNIO-90-CAPS*`.
- **Magnesio Forte** — producto distinto a Elixir, magnesio más fuerte. Type `'magnesio_forte'`. SKU `008`.
- **Ashwagandha** — type `'ash'`. SKU `007`.

**Restricción operacional clave:** La bodega que despacha por Coordinadora solo tiene stock de Elixir. Órdenes con Ashwagandha o Magnesio Forte deben ir por Envía, Inter o Bogotá. Hoy no hay bloqueo — el agente puede generar la guía Coord incorrecta sin darse cuenta.

**4 flujos de generación (todos en `src/app/actions/comandos.ts`):**
1. Robot Coordinadora — orquestado vía Inngest (`src/inngest/functions/robot-orchestrator.ts:92`).
2. Excel Envía — `executeGenerarExcelEnvia()` línea 925.
3. PDF Inter — `executeGenerarGuiasInter()` línea 709.
4. PDF Bogotá — `executeGenerarGuiasBogota()` línea 817.

Los 3 flujos PDF/Excel se disparan desde el chat `/comandos` por comando de texto. El robot Coord se dispara por otro comando (a confirmar por planner).

## Decisions

### 1. Regla de flag (qué cuenta como "mezcla problemática")

**Safe (sin flag):** `detectOrderProductTypes(order.products) === ['melatonina']`
— orden contiene únicamente productos Elixir.

**Flag (todas las demás):**
- Solo Magnesio Forte
- Solo Ashwagandha
- Elixir + Magnesio Forte (combo)
- Elixir + Ashwagandha
- Cualquier combinación con Ashwagandha
- Órdenes sin productos clasificados (`types === []`) — tratadas como flag por precaución

**Aclaración del usuario:** "Elixir" es un producto único (fórmula mel+mag en una cápsula), NO una combinación de types. En código está clasificado como type `'melatonina'`. Por eso `types === ['melatonina']` captura exactamente órdenes puras de Elixir.

### 2. Labels de display (mayúsculas, user-friendly)

Para toda UI visible (columna Excel, apartado PDF, mensaje Coord):
- Type `'melatonina'` → **ELIXIR**
- Type `'ash'` → **ASHWAGANDHA**
- Type `'magnesio_forte'` → **MAGNESIO FORTE**

Agregar al mapa en `src/lib/orders/product-types.ts` (reutilizar `PRODUCT_TYPE_COLORS[type].label` o extender con `displayLabel` uppercase).

### 3. Comportamiento por flujo (diferente para cada uno)

#### 3a. Robot Coordinadora — bloqueo server-side + mensaje informativo
- **Filtrar** las órdenes flag antes de crear el robot job. Solo órdenes safe (Elixir puro) llegan al robot.
- **Mensaje de respuesta en `/comandos`** al agente:
  - Lista las órdenes NO procesadas con razón específica
  - Formato propuesto: "N órdenes NO se enviaron a Coordinadora porque contienen [ASHWAGANDHA/MAGNESIO FORTE/etc.] y no hay stock de esos productos en la bodega de Coord. Usa Envía/Inter/Bogotá para estas."
- El robot Coord (Railway) NO se toca — el filtro es del lado Next.js en el entry point del comando.

#### 3b. Excel Envía — highlight amarillo + columna extra
- **TODAS** las órdenes siguen yendo al Excel (no se filtran).
- **Highlight amarillo** de fondo en la fila completa cuando la orden es flag.
- **Nueva columna** (propuesta: "COMBINACIÓN" o "PRODUCTOS") que contiene los labels uppercase separados por " + ":
  - Ejemplo flag: `ELIXIR + ASHWAGANDHA`, `MAGNESIO FORTE`, `ASHWAGANDHA + MAGNESIO FORTE`
  - Ejemplo safe: celda vacía
  - Orden sin clasificar: `SIN CLASIFICAR` o vacío (planner decide)
- El agente ve el Excel y decide manualmente si procesa/separa esas órdenes.

#### 3c. Guías PDF Inter + Bogotá — apartado visual solo si flag
- Los 2 generadores comparten `src/lib/pdf/generate-guide-pdf.ts`.
- Agregar un **nuevo apartado entre el logo y la dirección del destinatario** que muestre la combinación de productos que lleva la guía.
- **Aparece SOLO si la orden es flag.** Órdenes safe (Elixir puro) NO muestran el apartado — sin regresión visual para la mayoría de guías.
- Contenido: caja destacada con los labels uppercase de los tipos presentes. Formato exacto (tamaño, borde, color, ícono) lo define el planner buscando consistencia con el layout actual del PDF.
- Propuesta inicial: caja con borde naranja/rojo de ancho completo, texto "COMBINACIÓN: ELIXIR + ASHWAGANDHA" en bold grande.

### 4. Helper central de detección

Extender `src/lib/orders/product-types.ts`:

```ts
export function isSafeForCoord(types: ProductType[]): boolean
// true solo si types.length === 1 && types[0] === 'melatonina'

export function isMixedOrder(types: ProductType[]): boolean
// !isSafeForCoord(types) — incluye [] como mixed

export function formatProductLabels(types: ProductType[]): string
// Labels uppercase separados por " + ", siguiendo PRODUCT_TYPE_ORDER.
// [] → "SIN CLASIFICAR"
// ['melatonina'] → "ELIXIR"
// ['melatonina','ash'] → "ELIXIR + ASHWAGANDHA"
```

Reutilizado por los 4 flujos — single source of truth.

### 5. Scope de workspace

- `detectOrderProductTypes` ya está hardcoded para productos Somnio.
- **Aplicar globalmente, sin filtro explícito por workspace.** Otros workspaces no tienen esos SKUs/títulos → `detectOrderProductTypes` retorna `[]` → `isSafeForCoord([])` es `false` → serían tratadas como flag.
- **Mitigación:** los flujos de creación de guías están por-workspace vía `ctx.workspaceId` + configuración de `carrier_configs`. Solo el workspace Somnio dispara estos comandos en la práctica.
- Si en el futuro otro workspace activa Coord/Envía/Inter/Bogotá, se revisa (posible fase separada para config por workspace).

### 6. Orden de ejecución sugerido (waves)

Recomendación al planner:
- **Wave 1 (helper):** extender `product-types.ts` con `isSafeForCoord`, `isMixedOrder`, `formatProductLabels`, y labels uppercase. Unit-testeable.
- **Wave 2 (paralelo, 2 plans independientes):**
  - Plan 2a: Robot Coordinadora — filtro + mensaje.
  - Plan 2b: Excel Envía — highlight amarillo + columna.
- **Wave 3 (último):** PDFs Inter + Bogotá juntos — comparten `generate-guide-pdf.ts`.

## Technical Scope

### Archivos a modificar
- `src/lib/orders/product-types.ts` — helpers nuevos + labels uppercase.
- `src/app/actions/comandos.ts` — filtro en flujo Coord, paso de info a Envía/Inter/Bogotá.
- `src/lib/pdf/generate-envia-excel.ts` — highlight amarillo + columna.
- `src/lib/pdf/generate-guide-pdf.ts` — apartado condicional entre logo y dirección.
- `src/lib/pdf/normalize-order-data.ts` — propagar `productTypes` y flag `isMixed` a los datos normalizados.

### Archivos nuevos
- Ninguno — todo son extensiones.

### Archivos de referencia (NO modificar)
- `src/inngest/functions/robot-orchestrator.ts:92` — orchestrator Coord (el filtro va antes de que llegue aquí).
- `src/lib/domain/robot-jobs.ts:212` — `createRobotJob` sin cambios.
- `src/lib/domain/orders.ts:1388` — `getOrdersForGuideGeneration` sin cambios.
- `/robot-coordinadora/src/api/server.ts` — el robot Railway NO se toca.

### Tests / verificación

Sin tests automatizados activos para los generadores PDF/Excel en el stack actual.

**Unit tests opcionales (planner decide):**
- `isSafeForCoord` y `formatProductLabels` son funciones puras — fácil de testear.

**Verificación manual post-deploy:**

Por flujo:
1. **Coord:** ejecutar comando con una órden pura Elixir + una orden con Ashwagandha → solo sube la Elixir al robot, mensaje de respuesta lista la de Ashwagandha con razón.
2. **Envía:** generar Excel con 3 órdenes (1 Elixir, 1 solo-Magnesio, 1 Elixir+Ashwagandha) → las 3 en el archivo, pero las 2 flag tienen fila amarilla y columna COMBINACIÓN llena.
3. **Inter:** generar PDF con orden flag → apartado visible entre logo y dirección.
4. **Bogotá:** idem Inter.
5. **Safe path:** orden pura Elixir en los 4 flujos → sin alertas, comportamiento idéntico al actual (cero regresión).
6. **Edge case:** orden sin productos clasificados (caso extremo) → tratada como flag en los 4 flujos.

### Reglas aplicables del proyecto
- **REGLA 3 (Domain layer):** aplica parcialmente. El filtro en Coord se hace antes de `createRobotJob`, es filtro de input — no necesita nuevo dominio. Si en el futuro se persiste el flag en DB, ahí sí va por domain.
- **REGLA 5 (Migración antes de deploy):** no aplica — sin cambios de schema.
- **REGLA 6 (Proteger agente en producción):** no aplica — no toca agentes ni runners Inngest del agente Somnio.
- **REGLA 1 (Push a Vercel):** aplica al final de cada wave.
- **REGLA 4 (Documentación actualizada):** al cerrar, actualizar `docs/analysis/04-estado-actual-plataforma.md` (sección logística/guías) y dejar LEARNINGS en el standalone dir.

## Open questions (para planning)

1. **Nombre del comando Coord** — ¿"generar pedidos coord", "crear pedidos coordinadora", u otro? El planner debe encontrar el entry point exacto en `comandos-layout.tsx` + `comandos.ts` buscando el disparador del robot orchestrator. (El scout confirmó que el robot existe pero no mapeó el comando del chat.)

2. **Formato exacto del apartado PDF** — tamaño de caja, color de borde, tipografía, si incluye ícono de alerta. Propuesta: caja de ancho completo con borde naranja (consistente con el color de Ashwagandha en los dots), texto "COMBINACIÓN:" + labels en bold grande. El planner o el usuario definen en plan-phase.

3. **Formato del mensaje Coord** — ¿listar orden-por-orden (ID + cliente + productos)? ¿O conteo + IDs compactos? Propuesta: listar con formato legible para agente humano, porque son pocas órdenes por batch.

4. **Orden de labels en mezclas** — cuando la orden tiene 2+ tipos, ¿el orden en "ELIXIR + ASHWAGANDHA" sigue `PRODUCT_TYPE_ORDER` (`melatonina → ash → magnesio_forte`)? Propuesta: sí, consistente con los dots del Kanban de la fase anterior.

5. **Columna Envía — nombre exacto** — "COMBINACIÓN", "PRODUCTOS", "TIPO", "MIX". Planner decide según convención del Excel Envía actual.

## Out of Scope

- Persistir el flag de mezcla en DB (columna en tabla `orders`). Por ahora es derivado en cada generación.
- UI de configuración por workspace para los safe combos. Hardcoded para Somnio.
- Modificar comportamiento del agente AI (sandbox/builder) durante creación de órdenes. Esta fase es en creación de GUÍAS, no de órdenes.
- Tocar el robot Coordinadora (Railway). Todo el filtro es del lado Next.js.
- Modal interactivo de confirmación en `/comandos` antes de enviar al robot. Por ahora el filtro es silencioso + mensaje informativo después.
- Aplicar la misma lógica a export CSV de órdenes (`exportOrdersToCSV`) — es otro flujo.
- Cambios visuales en el Kanban o tabla CRM — ya cubiertos en `crm-color-tipo-producto`.
- Alertas en dashboard/notificaciones cuando una orden flag es creada por Shopify/WhatsApp. Fuera de scope.

## Canonical References

### Fase anterior (locked decisions)
- `.planning/standalone/crm-color-tipo-producto/CONTEXT.md` — definió `ProductType`, `SKU_TO_PRODUCT_TYPE`, `detectOrderProductTypes`, `PRODUCT_TYPE_COLORS`. Esta fase extiende lo mismo.

### Código relevante
- `src/lib/orders/product-types.ts` — donde van los helpers nuevos.
- `src/app/actions/comandos.ts:709` — `executeGenerarGuiasInter`.
- `src/app/actions/comandos.ts:817` — `executeGenerarGuiasBogota`.
- `src/app/actions/comandos.ts:925` — `executeGenerarExcelEnvia`.
- `src/inngest/functions/robot-orchestrator.ts:92` — orchestrator Coord (referencia).
- `src/lib/pdf/generate-guide-pdf.ts:53` — generador PDF Inter/Bogotá.
- `src/lib/pdf/generate-envia-excel.ts:20` — generador Excel Envía.
- `src/lib/pdf/normalize-order-data.ts` — normalización compartida.

### Reglas del proyecto
- `CLAUDE.md` — REGLAS 1, 3, 4, 6.
- `.claude/rules/code-changes.md` — flujo GSD obligatorio.

---

*Phase: standalone/crm-verificar-combinacion-productos*
*Context gathered: 2026-04-16*
