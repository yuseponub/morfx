---
phase: 042-correo-crear-pedido-whatsapp
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
files_modified:
  - supabase/migrations/20260415000000_orders_add_email.sql
  - src/lib/orders/types.ts
  - src/lib/domain/orders.ts
  - src/lib/domain/contacts.ts  # NO — solo se invoca, no se modifica (ya expone updateContact con email)
  - src/app/actions/orders.ts
  - src/app/actions/contacts.ts  # NO — solo se invoca getContact (ya retorna email)
  - src/app/(dashboard)/crm/pedidos/components/order-form.tsx

must_haves:
  truths:
    - "Al abrir el modal 'Nuevo pedido' desde WhatsApp con un contacto que tiene email, el campo 'Correo' aparece prellenado con ese email en la seccion Envio."
    - "Al abrir el modal con un contacto sin email, el campo 'Correo' aparece vacio en la seccion Envio."
    - "Al crear un pedido con un correo ingresado, el correo queda guardado en orders.email."
    - "Al crear un pedido con correo ingresado y el contacto no tenia email previo, contacts.email se actualiza con ese valor."
    - "Si el contacto ya tenia email, no se sobreescribe (aunque el usuario edite el campo en el modal, solo se guarda en orders.email, no en contacts)."
    - "En modo edicion, OrderForm carga order.email si existe y no rompe comportamiento previo."
  artifacts:
    - path: "supabase/migrations/20260415000000_orders_add_email.sql"
      provides: "Columna orders.email (TEXT nullable) + indice opcional"
      contains: "ALTER TABLE orders ADD COLUMN email"
    - path: "src/app/(dashboard)/crm/pedidos/components/order-form.tsx"
      provides: "Campo <Input email> en seccion Envio + prefill desde contacto"
      contains: "form.register('email')"
    - path: "src/lib/domain/orders.ts"
      provides: "CreateOrderParams.email + insert en orders.email + logica de actualizar contacts.email si estaba vacio"
      contains: "email"
    - path: "src/app/actions/orders.ts"
      provides: "orderSchema con email opcional + mapeo a domain"
      contains: "email: z.string().email"
  key_links:
    - from: "order-form.tsx (seccion Envio)"
      to: "contacts.email del contacto seleccionado"
      via: "useEffect que consulta getContact(contactId) y hace form.setValue('email', contact.email) cuando cambia contact_id"
      pattern: "getContact.*email"
    - from: "order-form.tsx handleSubmit"
      to: "createOrder server action"
      via: "OrderFormData.email"
      pattern: "email:\\s*data\\.email"
    - from: "domain/orders.ts createOrder"
      to: "contacts.email (update si estaba null)"
      via: "Si params.email && contacto existente sin email -> updateContact({ email })"
      pattern: "updateContact.*email"
    - from: "domain/orders.ts createOrder"
      to: "orders.email"
      via: "INSERT into orders con campo email"
      pattern: "email:\\s*params\\.email"
---

<objective>
Agregar un campo de correo electronico en el modal "Nuevo pedido" del modulo WhatsApp (seccion Envio, parte inferior del modal). El correo debe:
1. Prellenarse con contacts.email si el contacto seleccionado ya tiene uno.
2. Persistirse en orders.email al crear el pedido.
3. Si el contacto NO tenia email, tambien guardar el correo ingresado en contacts.email (update).

Purpose: Los pedidos creados desde WhatsApp actualmente no capturan email del cliente, lo que bloquea facturacion electronica y comunicaciones por correo. Este cambio cierra ese gap sin romper la UX del flujo actual.

Output:
- Migracion DB: orders.email agregado.
- Domain layer: createOrder acepta email, lo persiste en orders, y actualiza contacts.email si estaba vacio.
- UI: OrderForm (usado por CreateOrderSheet del modulo WhatsApp) muestra campo email en seccion Envio, prellenado desde el contacto.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.claude/rules/code-changes.md

# Schema actual de orders (sin email)
@supabase/migrations/20260129000003_orders_foundation.sql

# Modal y formulario a modificar
@src/app/(dashboard)/whatsapp/components/create-order-sheet.tsx
@src/app/(dashboard)/crm/pedidos/components/order-form.tsx
@src/app/(dashboard)/crm/pedidos/components/contact-selector.tsx

# Domain layer (Regla 3)
@src/lib/domain/orders.ts
@src/lib/domain/contacts.ts
@src/app/actions/orders.ts
@src/app/actions/contacts.ts

# Tipos
@src/lib/orders/types.ts
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Crear migracion y APLICARLA EN PRODUCCION (Regla 5)</name>
  <what-built>
    Archivo de migracion: `supabase/migrations/20260415000000_orders_add_email.sql`

    Contenido:
    ```sql
    -- Phase 042: Add email to orders for WhatsApp-created orders
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS email TEXT;

    COMMENT ON COLUMN orders.email IS 'Correo electronico del destinatario del pedido. Capturado al crear pedido desde WhatsApp. Opcional.';
    ```

    Nota: NO se agrega indice por ahora (no hay query que filtre por orders.email). Si en el futuro se necesita, agregar `CREATE INDEX idx_orders_email ON orders(workspace_id, email) WHERE email IS NOT NULL;` en migracion posterior.
  </what-built>
  <how-to-verify>
    Regla 5 del proyecto: TODA migracion DB debe aplicarse en produccion ANTES de pushear codigo que la usa.

    Pasos del usuario:
    1. Revisar archivo `supabase/migrations/20260415000000_orders_add_email.sql`.
    2. Aplicar la migracion en produccion (Supabase Dashboard > SQL Editor o `supabase db push` segun workflow del proyecto).
    3. Confirmar que la columna existe corriendo:
       ```sql
       SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'orders' AND column_name = 'email';
       ```
       Debe retornar: `email | text | YES`.
    4. Responder "aplicada" para continuar con Task 2.
  </how-to-verify>
  <resume-signal>Responder "aplicada" una vez la migracion este ejecutada en produccion. Si falla, describir el error.</resume-signal>
  <done>Archivo de migracion creado en repo Y columna orders.email existe en la base de datos de produccion.</done>
</task>

<task type="auto">
  <name>Task 2: Actualizar tipos, domain layer y server action para persistir email</name>
  <files>
    src/lib/orders/types.ts
    src/lib/domain/orders.ts
    src/app/actions/orders.ts
  </files>
  <action>
    Cambios en orden:

    **A) `src/lib/orders/types.ts`**
    - En `interface Order` (linea ~140-163 donde estan los campos base): agregar `email?: string | null`.
    - Buscar si hay `OrderInsert`/`OrderUpdate` types y agregar `email` tambien.

    **B) `src/lib/domain/orders.ts`**
    1. En `interface CreateOrderParams` (~linea 28): agregar `email?: string | null`.
    2. En `interface UpdateOrderParams` (~linea 50): agregar `email?: string | null`.
    3. En `createOrder` (linea 161), dentro del `supabase.from('orders').insert({...})` (linea ~201), agregar:
       ```
       email: params.email || null,
       ```
    4. En `createOrder`, DESPUES del insert exitoso del pedido pero ANTES del `emitOrderCreated` (aprox linea 285), agregar logica de actualizar contacts.email si estaba vacio:
       ```typescript
       // Si se proporciono email y el contacto existe sin email, actualizarlo
       if (params.email && params.contactId) {
         const { data: contactEmailRow } = await supabase
           .from('contacts')
           .select('email')
           .eq('id', params.contactId)
           .eq('workspace_id', ctx.workspaceId)
           .single()

         if (contactEmailRow && !contactEmailRow.email) {
           await supabase
             .from('contacts')
             .update({ email: params.email })
             .eq('id', params.contactId)
             .eq('workspace_id', ctx.workspaceId)
           // No emitimos trigger field.changed aqui porque es una capturar-por-primera-vez,
           // no un cambio intencional del usuario en el perfil del contacto.
         }
       }
       ```
       IMPORTANTE: Usar `supabase` (admin client ya creado en la funcion), filtrar SIEMPRE por `workspace_id` (Regla 3). NO sobreescribir si ya tenia email.

    5. En `updateOrder` (linea 328):
       - En el SELECT de `previousOrder` (linea 339), agregar `email` a la lista de campos: `'..., email'`.
       - En el bloque `if (params.X !== undefined)` (linea ~351-361), agregar:
         ```
         if (params.email !== undefined) updates.email = params.email || null
         ```
       - En la lista de trigger fields para emitir `field.changed` (buscar `paramKey.*dbColumn` ~linea 448), agregar:
         ```
         { paramKey: 'email', dbColumn: 'email' },
         ```

    **C) `src/app/actions/orders.ts`**
    1. En `orderSchema` (linea 40), agregar:
       ```
       email: z.string().email('Correo invalido').optional().nullable().or(z.literal('')),
       ```
    2. En el lugar donde se mapea `OrderFormData` -> `CreateOrderParams`/`UpdateOrderParams` al llamar a domain (buscar el call a `domainCreateOrder` y `domainUpdateOrder`), agregar `email: data.email || null` al payload.

    Razon de cada cambio: orders.email es la fuente de verdad de "a que correo se enviaron/facturaron este pedido"; puede diferir del email del contacto en el tiempo (snapshot). Contacts.email se actualiza solo si estaba vacio para no pisar datos que el usuario edito manualmente en el CRM.

    NO tocar: contacts.ts domain (ya tiene updateContact con email, pero optamos por UPDATE directo en el admin client para evitar disparar trigger field.changed que enviaria notificaciones de "se cambio el email del contacto" cuando en realidad es primera captura).
  </action>
  <verify>
    - `pnpm typecheck` pasa sin errores.
    - Grep en src/lib/domain/orders.ts debe mostrar `email: params.email` en el insert y `email` en el SELECT de previousOrder.
    - Grep en src/app/actions/orders.ts debe mostrar `email:` en orderSchema y en la llamada a domain.
  </verify>
  <done>
    - Order type tiene campo email.
    - CreateOrderParams y UpdateOrderParams tienen email.
    - createOrder domain inserta email en orders.
    - createOrder domain actualiza contacts.email solo si estaba null.
    - updateOrder domain permite actualizar orders.email.
    - orderSchema valida email como string opcional.
    - Server action createOrder/updateOrder pasa email a domain.
    - Typecheck limpio.
  </done>
</task>

<task type="auto">
  <name>Task 3: Agregar campo email en OrderForm (seccion Envio) con prefill desde contacto</name>
  <files>
    src/app/(dashboard)/crm/pedidos/components/order-form.tsx
  </files>
  <action>
    Modificaciones a `order-form.tsx`:

    1. **Agregar email al tipo FormData** (linea 32-51):
       ```typescript
       interface FormData {
         // ... campos existentes ...
         email: string | null
         // ... resto ...
       }
       ```

    2. **Agregar email a defaultValues** (linea 88-129):
       - En modo edit: `email: order.email ?? null`.
       - En modo create: `email: null` (se prellena por useEffect, ver paso 4).

    3. **Importar getContact** (si no esta ya; linea ~27):
       ```typescript
       import { getContact } from '@/app/actions/contacts'
       ```

    4. **Agregar useEffect para prefill desde contacto** (despues del useEffect existente en linea ~143):
       ```typescript
       // Prefill email desde el contacto seleccionado (solo en modo create, solo si el campo email esta vacio)
       const watchContactId = form.watch('contact_id')
       React.useEffect(() => {
         if (mode !== 'create') return
         if (!watchContactId) return
         // No pisar si el usuario ya escribio algo
         const currentEmail = form.getValues('email')
         if (currentEmail) return

         let cancelled = false
         getContact(watchContactId).then((contact) => {
           if (cancelled) return
           if (contact?.email) {
             form.setValue('email', contact.email, { shouldDirty: false })
           }
         })
         return () => { cancelled = true }
       }, [watchContactId, mode, form])
       ```
       Nota: `getContact` retorna `ContactWithTags | null` con `email` incluido (verificado en src/app/actions/contacts.ts linea 267-284).

    5. **Agregar el Input en la seccion Envio** (linea 366-421, bloque `{/* Shipping Section */}`).
       Ubicarlo como PRIMER campo de la seccion, ANTES de "Direccion de envio":
       ```tsx
       {/* Shipping Section */}
       <div className="space-y-3">
         <Label className="text-base font-semibold">Envio</Label>

         {/* Email (nuevo) */}
         <div className="space-y-2">
           <Label htmlFor="email">Correo electronico</Label>
           <Input
             {...form.register('email')}
             id="email"
             type="email"
             placeholder="cliente@ejemplo.com"
             disabled={isPending}
           />
           {form.formState.errors.email && (
             <p className="text-sm text-destructive">
               {form.formState.errors.email.message}
             </p>
           )}
         </div>

         {/* Shipping Address (existente) */}
         ...
       ```

    6. **Pasar email en handleSubmit** (linea 153-194):
       En el objeto `formData: OrderFormData` (linea 158), agregar:
       ```typescript
       email: data.email ?? null,
       ```

    RESTRICCIONES:
    - NO mover el campo email a la seccion Contacto (parte superior). Requisito explicito del usuario: debe estar en la seccion Envio (parte inferior).
    - NO tocar contact-selector.tsx. El prefill se hace desde OrderForm via useEffect que observa contact_id.
    - NO auto-llenar el email si el usuario YA escribio algo en el campo (la condicion `if (currentEmail) return` protege contra overwrites al cambiar de contacto despues de editar).
    - En modo edit, NO ejecutar el useEffect de prefill (se respeta order.email tal como esta en DB).
  </action>
  <verify>
    - `pnpm typecheck` pasa.
    - `pnpm dev` (puerto 3020), abrir WhatsApp, seleccionar conversacion, click "Crear pedido". Verificar:
      1. Modal abre.
      2. El campo "Correo electronico" aparece en la seccion "Envio" (parte inferior), NO en "Contacto".
      3. Seleccionar un contacto que tenga email (verificar en DB previamente con `SELECT email FROM contacts WHERE id = '...'`). El campo email se prellena.
      4. Seleccionar un contacto sin email. El campo aparece vacio.
      5. Escribir un email manualmente, crear el pedido. Verificar en DB: `SELECT email FROM orders WHERE id = '...'` retorna el valor. Si el contacto no tenia email, verificar `SELECT email FROM contacts WHERE id = '...'` ahora lo tiene.
      6. Si el contacto SI tenia email y se ingresa uno distinto en el modal, verificar que orders.email tiene el nuevo valor pero contacts.email NO cambio.
    - `pnpm lint` sin errores.
  </verify>
  <done>
    - Campo "Correo electronico" visible en seccion Envio del modal.
    - Prefill funciona cuando el contacto tiene email.
    - Campo vacio cuando el contacto no tiene email.
    - Crear pedido persiste email en orders.email.
    - Crear pedido con email ingresado actualiza contacts.email solo si estaba vacio.
    - Modo edit de OrderForm no se rompe.
    - Typecheck y lint limpios.
  </done>
</task>

</tasks>

<verification>
Checklist completo fin-a-fin:

1. **Schema DB**: `orders.email` existe en produccion (columna TEXT nullable).
2. **Domain layer**:
   - `createOrder` acepta email, lo inserta en orders, y actualiza contacts.email si estaba NULL.
   - `updateOrder` acepta email y dispara trigger field.changed cuando cambia.
3. **Server action**: `createOrder`/`updateOrder` validan email con Zod y lo pasan a domain.
4. **UI**:
   - Campo en seccion Envio (NO Contacto).
   - Prefill automatico desde contacts.email al seleccionar contacto.
   - No sobreescribe si usuario ya tipeo.
5. **Regla 1**: Despues de verificar, push a Vercel.
6. **Regla 3**: Toda mutacion pasa por domain layer (createAdminClient + workspace_id filter).
7. **Regla 5**: Migracion aplicada en produccion ANTES del push de codigo.
8. **Regla 6**: No afecta agentes en produccion (es UI + schema additive nullable, no cambia comportamiento de agentes existentes que no leen orders.email).

Edge cases a revisar manualmente:
- Crear pedido SIN contacto seleccionado + con email: debe guardarse en orders.email, no intentar update de contacts (params.contactId es null). Ya cubierto por el `if (params.email && params.contactId)` en domain.
- Crear pedido con email vacio: orders.email queda null, contacts.email no se toca.
- Email invalido ("abc"): Zod rechaza antes de llegar al domain.
- Email con solo espacios: `.trim()` no esta en el schema, pero `z.string().email()` rechaza. Opcional mejorar con transform.
</verification>

<success_criteria>
- [ ] Migracion `20260415000000_orders_add_email.sql` aplicada en produccion.
- [ ] `pnpm typecheck` y `pnpm lint` limpios.
- [ ] Modal "Nuevo pedido" desde WhatsApp muestra campo "Correo electronico" en seccion Envio.
- [ ] Campo prellena email del contacto cuando existe.
- [ ] Crear pedido guarda email en orders.email.
- [ ] Crear pedido con contacto sin email actualiza contacts.email.
- [ ] No se rompe modo edicion de pedidos existentes.
- [ ] Push a Vercel ejecutado.
- [ ] Actualizar `docs/analysis/04-estado-actual-plataforma.md` seccion Pedidos con este cambio (Regla 4).
</success_criteria>

<output>
Al completar, crear `.planning/quick/042-correo-crear-pedido-whatsapp/042-SUMMARY.md` con:
- Archivos modificados
- Migracion SQL aplicada
- Comportamiento verificado end-to-end (screenshots opcional)
- Cualquier bug encontrado durante la ejecucion
</output>
