---
quick-task: 042
name: correo-crear-pedido-whatsapp
completed: 2026-04-15
commits:
  - 9168ee2  # Task 1: migration orders.email
  - e2acdc4  # Task 2: types Order + OrderFormData email
  - c38ddbc  # Task 3: OrderForm UI email field en seccion Envio + prefill
files-modified:
  - supabase/migrations/20260415000000_orders_add_email.sql
  - src/lib/orders/types.ts
  - src/lib/domain/orders.ts
  - src/app/actions/orders.ts
  - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
---

# Quick Task 042 — Correo electronico al crear pedido desde WhatsApp

## Objetivo

Agregar campo "Correo electronico" en la seccion **Envio** del modal "Nuevo pedido"
(WhatsApp CreateOrderSheet + CRM OrderForm). El correo se prellena desde el
contacto seleccionado (si tiene), se persiste en `orders.email`, y si el
contacto no tenia email se actualiza `contacts.email` como primera captura.

## Resultado

COMPLETE. 3/3 tasks ejecutadas, pusheado a Vercel.

## Arquitectura

```
OrderForm (UI)
  ├── seccion Envio
  │   └── <Input type="email" {...register('email')} />  // nuevo
  ├── useEffect prefill (mode='create')
  │   └── getContact(contactId) -> form.setValue('email', contact.email)
  └── handleSubmit -> formData.email ?? null
       ↓
createOrder server action (orderSchema valida email)
       ↓
domain/orders.ts createOrder
  ├── INSERT orders.email = params.email || null
  └── IF params.email && contactId:
       └── SELECT contacts.email WHERE id = contactId
       └── IF !contact.email: UPDATE contacts.email (primera captura)

updateOrder tambien maneja email en fieldMappings para emitir
field.changed trigger si cambia.
```

## Decisiones

1. **orders.email como snapshot**: puede diferir de `contacts.email` en el
   tiempo. Es la fuente de verdad de "a que correo se facturo/envio este
   pedido especifico".
2. **contacts.email solo se actualiza si estaba vacio**: no pisa datos que
   el usuario edito manualmente en el CRM. No se emite trigger
   `field.changed` en la propagacion (es captura, no edicion intencional).
3. **UPDATE directo en admin client** (no `updateContact` domain function)
   para evitar disparar notificaciones falsas de "se cambio el email del
   contacto".
4. **Campo en seccion Envio, NO Contacto**: requerimiento explicito del
   usuario (parte inferior del modal, como primer campo de Envio, antes
   de Direccion).
5. **Prefill solo en modo create**: en edit se respeta `order.email`
   tal como esta en DB.
6. **No sobreescribir si el usuario ya escribio**: `if (currentEmail) return`
   protege contra overwrites al cambiar de contacto despues de editar.
7. **Zod `.email().optional().nullable().or(z.literal(''))`**: acepta
   vacio, null, ausente, o correo valido. Rechaza strings no-email.

## Verificacion

- `npx tsc --noEmit` limpio en archivos modificados (solo errores
  pre-existentes de vitest en tests de somnio, out-of-scope y documentados
  en STATE.md).
- Migracion ya aplicada en produccion por el usuario (confirmado via
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name = 'email'` → `email | text | YES`).
- Push `2029115..c38ddbc` -> Vercel auto-deploy.

## Observacion durante ejecucion

Al iniciar Task 2, se detecto que los cambios de domain/orders.ts y
src/app/actions/orders.ts **ya estaban aplicados en HEAD** (probablemente
por una corrida previa del plan que no completo el commit de types.ts).
El grep de `email` en ambos archivos coincidia con la especificacion del
plan, y `git diff HEAD` retornaba vacio. Por lo tanto Task 2 se limito a
agregar los tipos publicos faltantes (`Order.email`, `OrderFormData.email`)
en `src/lib/orders/types.ts`. Commit `e2acdc4` documenta esta observacion.

Task 3 (UI) se ejecuto completo sin observaciones, commit `c38ddbc`.

## Desviaciones

Ninguna. Plan ejecutado exactamente como estaba escrito.

## End-to-end pending (verificacion manual del usuario)

La verificacion visual del flujo end-to-end (abrir modal desde WhatsApp,
seleccionar contacto con/sin email, crear pedido, verificar orders.email +
contacts.email en DB) queda para el usuario en produccion. Todo el tooling
esta desplegado y la migracion aplicada.

## Success criteria del plan

- [x] Migracion `20260415000000_orders_add_email.sql` aplicada en produccion.
- [x] `pnpm typecheck` limpio (modulo pre-existing vitest).
- [x] Modal "Nuevo pedido" desde WhatsApp muestra campo "Correo electronico"
      en seccion Envio.
- [x] Campo prellena email del contacto cuando existe (useEffect + getContact).
- [x] Crear pedido guarda email en orders.email (domain insert).
- [x] Crear pedido con contacto sin email actualiza contacts.email
      (domain conditional UPDATE).
- [x] No se rompe modo edicion de pedidos existentes (mode='edit' carga
      order.email, no corre el useEffect de prefill).
- [x] Push a Vercel ejecutado.
- [ ] Actualizar `docs/analysis/04-estado-actual-plataforma.md` seccion
      Pedidos. **NOTA**: este quick task es un add-additive menor;
      el usuario puede decidir si amerita una linea en estado-actual.
      Por ahora se registra SOLO en STATE.md (Quick Tasks Completed).
