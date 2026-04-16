# CRM — Verificar Combinación de Productos en Creación de Guías — Discussion Log

> **Audit trail only.** No es input para agentes downstream (research, plan, execute). Las decisiones canónicas viven en CONTEXT.md.

**Fecha:** 2026-04-16
**Phase:** standalone/crm-verificar-combinacion-productos
**Formato:** Q&A inline (no se usó AskUserQuestion — conversación orgánica con 4 rondas de clarificación).

---

## Ronda 0 — Scope inicial

**Usuario:** "En la hora de creación de guías/excel/robot coord necesito que se pueda verificar si hay combinación de productos para alertar al agente."

**Claude (resumen):** Propuso extender protección anti-error al flujo de generación de guías. Antes de clarificar, ejecutó investigación exhaustiva del codebase vía agente Explore para mapear todos los generadores.

**Resultado de la investigación:**
- 3 generadores en `src/app/actions/comandos.ts`: Inter (PDF, línea 709), Bogotá (PDF, línea 817), Envía (Excel, línea 925).
- 1 robot (Coordinadora) orquestado por Inngest en `robot-orchestrator.ts:92`.
- No hay selección masiva manual — todos los flujos operan sobre "todas las órdenes en la etapa configurada".
- Punto de intercepción identificado: después de `getOrdersForGuideGeneration()` y antes de `createRobotJob()`.

---

## Ronda 1 — Cobertura + comportamiento por flujo

**Claude:** ¿Cubrimos los 4 flujos o empezamos por un subset? ¿Bloqueante o advertencia? ¿Solo workspace Somnio o global?

**Usuario:** "Si, los 4 flujos. Nos toca discutir los que van conjuntos (digamos Coord bloquearía la guía con combinado, solo debe subir órdenes de Elixir por ahora), Excel Envía debe marcar el pedido highlighted para que no se nos vaya a pasar. Y el generador de guías de Bog e Inter debemos arreglar el UI de la guía creada para que no se nos vaya a pasar tampoco."

**Decisión capturada:**
- Los 4 flujos cubiertos.
- **3 comportamientos distintos:**
  - Coord: bloqueo server-side, solo Elixir sube.
  - Envía Excel: highlight (no bloqueo).
  - Inter/Bogotá PDF: marcador visual en el PDF generado.

---

## Ronda 2 — Detalles de cada comportamiento

**Claude:**
1. ¿Coord filter criteria — solo `types === ['melatonina']` pasan? ¿Qué pasa con solo-ash, solo-magnesio, sin clasificar?
2. ¿Envía highlight — color de fondo, columna extra, o ambos?
3. ¿Bogotá/Inter PDF — badge grande, dots de color, estampilla?
4. ¿Detección "mezcla" — `length >= 2` o también cuenta unclassified + tipo conocido?

**Usuario:**
1. "Avisan en mensaje que esas no van por Coord porque no hay mercancía de esos otros 2 productos en las bodegas."
2. "Se hace highlight amarillo y en una nueva columna se dice que productos son los que van ahí ahora. En esta nueva columna los otros pedidos estarían vacíos."
3. "Creamos un nuevo APARTADO EN LA GUIA entre el logo y la dirección, que muestre la combinación de productos que van."
4. "Por ahora todo lo que no sea Elixir o Melatonina+Magnesio se marcaría como flag."

**Decisiones capturadas:**
- Coord: bloqueo con mensaje explicando stock en bodega.
- Envía: highlight amarillo + columna nueva con productos (vacía para safe).
- PDF: apartado nuevo entre logo y dirección.
- Flag (v1): todo salvo Elixir o Elixir+Magnesio combo.

---

## Ronda 3 — Labels + alcance del apartado PDF + confirmación lógica flag

**Claude:**
1. ¿En columna Envía y apartado PDF se muestran tipos internos o nombres amigables?
2. ¿Apartado PDF aparece en TODAS las guías o solo cuando hay mezcla?
3. ¿Confirmar lógica flag: safe = `['melatonina']` O `['melatonina','magnesio_forte']`?

**Usuario:**
1. "Los 3 nombres son 'ELIXIR', 'ASHWAGANDHA' Y 'MAGNESIO FORTE' para fácil identificación."
2. "Solo cuando hay mezcla."
3. "Magnesio Forte sí tiene flag, el único que no tiene es Melatonina o Elixir."

**Decisiones capturadas:**
- Labels uppercase: ELIXIR, ASHWAGANDHA, MAGNESIO FORTE.
- PDF apartado condicional (solo flag).
- **Regla de flag revisada:** solo `['melatonina']` es safe. Todo lo demás (incluyendo combo mel+mag) es flag.

---

## Ronda 4 — Clarificación conceptual final

**Claude:** ¿Confirmo regla revisada: safe = `['melatonina']` únicamente, todo lo demás flag incluyendo combos?

**Usuario:** "Ah ok, es que creí que el producto se llamaba así Melatonina+Magnesio (este es el Elixir), el otro que es diff se llama Magnesio Forte."

**Clarificación crítica:**
- Elixir es **un producto único** cuya fórmula contiene melatonina+magnesio en una sola cápsula.
- En código Elixir está clasificado como type `'melatonina'` (single type, no combo).
- Magnesio Forte es un producto **diferente** (magnesio puro más fuerte).
- Por tanto `types === ['melatonina']` captura exactamente las órdenes puras de Elixir — que es lo safe.

**Regla final:**
- **Safe:** `types === ['melatonina']` (Elixir puro).
- **Flag:** todo lo demás.

---

## Ronda 5 — Aprobación

**Claude:** Resumió contexto capturado y pidió autorización para proceder con `/gsd-discuss-phase`.

**Usuario:** "ok"

---

## Claude's Discretion

Áreas donde el usuario delegó decisiones al planner:
- Formato exacto del apartado PDF (tamaño, borde, color, ícono).
- Formato exacto del mensaje de respuesta Coord en `/comandos`.
- Nombre exacto de la columna Envía ("COMBINACIÓN" vs "PRODUCTOS" vs "TIPO").
- Orden de labels en strings de mezcla (asumido: seguir `PRODUCT_TYPE_ORDER`).

## Deferred Ideas

- Modal interactivo de confirmación antes de enviar al robot Coord (por ahora filtro silencioso + mensaje).
- Persistir flag de mezcla en columna DB `orders.is_mixed`.
- UI de configuración por workspace para los safe combos.
- Alertas en dashboard/notificaciones cuando Shopify/WhatsApp crea órdenes flag.
- Extender lógica al export CSV de órdenes.

## Referenced during discussion

- `src/lib/orders/product-types.ts` — extender con helpers nuevos.
- Fase anterior `crm-color-tipo-producto` — locked decisions heredadas.
- `src/app/actions/comandos.ts` + `src/lib/pdf/*` — archivos a modificar.
- `src/inngest/functions/robot-orchestrator.ts:92` — referencia (NO modificar).
