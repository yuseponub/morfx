# Shopify Contact Resolution — CONTEXT

## Goal
Reemplazar el fuzzy matching actual (que vincula contactos por nombre sin validar teléfono) con una lógica inteligente que:
1. Siempre use el teléfono de Shopify como fuente de verdad
2. Detecte teléfonos "cercanos" (posible error de digitación) y pida aprobación al host
3. Nunca vincule a un contacto con teléfono completamente diferente solo por nombre similar

## Background / Problema
5 órdenes fueron vinculadas al contacto equivocado por fuzzy matching de nombre:
- #19773: Template entregado a persona equivocada (CRITICO)
- #19818, #19810: Templates fallaron (número incorrecto)
- #19835, #19751: Sin templates enviados

La integración Shopify está en `auto_sync_orders: false` (trigger-only mode).
El flujo actual: webhook → `shopify.order_created` trigger → automatización "ultima shopi" → `create_order` action → `resolveOrCreateContact` → templates.

## Decisions

### 1. Resolución de contacto — Prioridad al teléfono
- **Match exacto por teléfono** → usar ese contacto (sin cambios)
- **Sin match de teléfono** → buscar "teléfono cercano" antes de crear contacto nuevo
- **Teléfono cercano encontrado** → BLOQUEAR templates, notificar host, esperar decisión
- **Sin match de ningún tipo** → crear contacto nuevo con tel de Shopify

### 2. Definición de "teléfono cercano"
- **Umbral**: 1-2 dígitos de diferencia (Levenshtein distance ≤ 2 sobre los últimos 10 dígitos)
- **Condición adicional**: El nombre debe ser similar (fuzzy score > 70% con Fuse.js)
- **Ambas condiciones** deben cumplirse para considerar "cercano"
- **Alcance**: Buscar en TODOS los contactos del workspace

### 3. Notificación al host
- **Canal dual**: Tag `REVISAR-CONTACTO` en la orden + WhatsApp al host
- **Template WhatsApp**: Usar `informacion_general` existente (aprobado, 2 variables)
  - Variable 1: Nombre del host (o "Admin")
  - Variable 2: Texto con info del caso: nombre cliente, tel Shopify, tel existente, link MERGE, link IGNORAR
- **Número del host**: +573137549286 (fijo, configurado)
- **Info en la orden**: Agregar a la descripción: "POSIBLE DUPLICADO: [nombre existente] tel: [tel existente]. Tel Shopify: [tel nuevo]"

### 4. Links de acción (MERGE / IGNORAR)
- **Endpoint API**: `POST /api/contact-review/:token` con action=merge|ignore
- **Token**: UUID único generado al crear la revisión, almacenado en DB (tabla `contact_reviews` o similar)
- **Token expira**: No (sin timeout — siempre esperar decisión del host)
- **Link MERGE**: Al hacer click:
  1. Actualiza el teléfono del contacto existente al teléfono de Shopify
  2. Vincula la orden al contacto existente (ya está vinculada)
  3. Envía los templates al nuevo teléfono
  4. Remueve tag `REVISAR-CONTACTO`
  5. Muestra página de confirmación simple
- **Link IGNORAR**: Al hacer click:
  1. Mantiene el contacto nuevo (ya creado con tel de Shopify)
  2. Envía los templates al teléfono de Shopify
  3. Remueve tag `REVISAR-CONTACTO`
  4. Muestra página de confirmación simple

### 5. Comportamiento mientras espera aprobación
- **Templates**: BLOQUEADOS hasta que el host haga click en MERGE o IGNORAR
- **Orden**: SÍ se crea inmediatamente (con contacto nuevo usando tel de Shopify)
- **Tag**: `REVISAR-CONTACTO` asignado a la orden
- **Sin timeout**: Los templates no se envían automáticamente si el host no actúa
- **La orden es visible** en el pipeline con el tag para que el host la identifique

### 6. Flujo completo
```
Shopify webhook llega con tel +573XXXXXXXXX
  ↓
¿Existe contacto con ese teléfono exacto?
  → SÍ: Usar ese contacto. Flujo normal (crear orden + enviar templates)
  → NO: Buscar "teléfono cercano" (Levenshtein ≤ 2 + nombre fuzzy > 70%)
      → CERCANO ENCONTRADO:
          1. Crear contacto nuevo con tel de Shopify
          2. Crear orden vinculada al contacto nuevo
          3. Crear registro en contact_reviews con token
          4. Asignar tag REVISAR-CONTACTO a la orden
          5. Agregar info del duplicado en descripción de la orden
          6. Enviar WhatsApp al host con links MERGE/IGNORAR
          7. NO enviar templates de la orden (bloqueados)
      → NO HAY CERCANO:
          1. Crear contacto nuevo con tel de Shopify
          2. Flujo normal (crear orden + enviar templates)
```

## Technical Scope

### Archivos a modificar
- `src/lib/automations/action-executor.ts` — `resolveOrCreateContact` → agregar lógica de teléfono cercano
- `src/lib/shopify/contact-matcher.ts` — posible refactor del fuzzy matching

### Archivos a crear
- `src/app/api/contact-review/[token]/route.ts` — Endpoint para MERGE/IGNORAR
- `src/app/contact-review/[token]/page.tsx` — Página de confirmación (simple)
- Migración DB para tabla `contact_reviews`

### Tablas DB involucradas
- `contacts` — Lectura para búsqueda, update de teléfono en merge
- `orders` — Update de descripción
- `order_tags` / `tags` — Crear/remover tag REVISAR-CONTACTO
- `contact_reviews` (NUEVA) — token, contact_new_id, contact_existing_id, order_id, shopify_phone, status (pending/merged/ignored), created_at

## Out of Scope
- Merge completo de contactos (fusionar conversaciones, órdenes, tags) — eso es otra fase
- UI para gestión de duplicados en el dashboard
- Cambios al fuzzy matching del webhook handler (auto_sync mode) — actualmente no se usa
- Notificaciones push/email al host
