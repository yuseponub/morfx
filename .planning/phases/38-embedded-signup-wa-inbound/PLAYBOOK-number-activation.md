# PLAYBOOK — Activación de número en Cloud API tras Embedded Signup

> **Por qué existe esto:** Phase 38 conecta números a MorfX vía Embedded Signup. El
> Embedded Signup **agrega** el número a nuestra WABA y verifica ownership, pero **NO lo
> activa** en Cloud API. El número queda `status: PENDING` / `platform_type: NOT_APPLICABLE`
> y Meta **no entrega inbound real** hasta que se llama `register`. El `register` falla en
> cadena por varios pre-requisitos. Este es el orden real, descubierto en vivo el 2026-06-03
> con el número de prueba `+57 310 5197782` (phone_number_id `1134593926408063`, WABA
> `1330686782492287`).

## La cadena de pre-requisitos del `register` (en orden)

`POST /v22.0/{phone_number_id}/register { messaging_product:"whatsapp", pin:"<6 dígitos NUEVO>" }`

Falla, uno por uno, hasta cumplir TODOS:

### 1. Two-step verification (2SV) heredada → error `2388001`
- **Síntoma:** `code 100, subcode 2388001, "Cannot Create Certificate — Please ensure two-factor authentication is disabled."`
- **Causa:** el número traía 2SV de un BSP previo (en nuestro caso 360dialog). El `register`
  intenta crear el certificado y un PIN nuevo, pero choca con el 2SV existente.
- **NO se puede arreglar por API.** La API no tiene endpoint para apagar 2SV de un número no
  registrado (set-pin → `133010 account not registered`; deregister → `not linked`).
  Es huevo-y-gallina si lo intentas por API.
- **FIX (UI, NO requiere conocer el PIN viejo):**
  `business.facebook.com` → **WhatsApp Manager** (`/wa/manage`, NO Business Settings) →
  **Account tools → Phone numbers** → click el número → **Two-step verification** →
  **Turn off** → **confirmar por email del admin**. El turn-off se autentica por el email
  del administrador, no por el PIN. Lo puede hacer el Portfolio dueño de la WABA **o** el
  BSP origen.
- ⚠️ El toggle vive en **WhatsApp Manager**, NO en Business Settings → WhatsApp accounts
  (ahí solo está el menú "..." con Assign/Payment/abrir WhatsApp Manager).

### 2. Ownership del número → normalmente YA resuelto
- Embedded Signup verifica el ownership en el popup → `code_verification_status: VERIFIED`.
- Por eso **NO** hace falta `request_code`/`verify_code` en el flujo Embedded Signup
  (sí harían falta en una migración 100% manual por API).

### 3. Método de pago en la WABA → error "Cannot Migrate Phone Number ... no payment method"
- **Síntoma:** `code 100, "Cannot Migrate Phone Number: Your WhatsApp Business Account
  doesn't have a payment method set up."`
- **Causa:** Cloud API exige una tarjeta en archivo sobre la WABA antes de registrar/migrar
  un número (aunque haya tier gratis de conversaciones de servicio).
- **FIX:** Business Settings → WhatsApp accounts → seleccionar la WABA → menú "..." →
  **Payment settings** → agregar tarjeta. (O WhatsApp Manager → la WABA → Payment.)

### 4. register OK
- Con 1-3 cumplidos, `register` devuelve `{ "success": true }` y el número pasa de
  `PENDING/NOT_APPLICABLE` a activo en Cloud API. Recién ahí Meta entrega inbound real.
- El `pin` que mandamos en register es un **2SV NUEVO que nosotros fijamos** (no el viejo).
  Hay que **guardarlo** (idealmente encriptado en `workspace_meta_accounts`) porque se
  necesita para futuras operaciones del número.

## Implicación de PRODUCCIÓN (todo cliente que migre choca con esto)

El onboarding (`src/app/actions/meta-onboarding.ts`) hoy hace
`exchange → encrypt → upsertMetaAccount → subscribeWaba` y **NUNCA llama `register`**
(el helper `registerPhoneNumber` existe en `embedded-signup.ts` pero está sin usar).
El flujo de producción debe:

1. Tras `subscribeWaba`, llamar `registerPhoneNumber(bisuat, phoneNumberId, pinNuevo)` con un
   PIN de 6 dígitos generado por nosotros, **guardado encriptado**.
2. **Capturar cada error de la cadena** y devolver instrucción accionable al cliente:
   - `2388001` → "Tu número tiene verificación en dos pasos de un proveedor anterior.
     Desactívala en WhatsApp Manager (Two-step verification → Turn off, confirmas por email)
     y reintenta. Si no tienes acceso, pídele a tu proveedor anterior que la desactive."
   - "no payment method" → "Tu cuenta de WhatsApp necesita un método de pago. Agrégalo en
     WhatsApp Manager → Payment settings y reintenta."
3. Persistir un `status` en `workspace_meta_accounts` (`pending` / `needs_2sv` /
   `needs_payment` / `connected`) y mostrar el estado real en la UI de integraciones, con un
   botón **"Reintentar registro"**. Esto cierra a la vez el gap de la vista "conectado".
4. Idempotencia: si Meta responde `already_registered`, tratar como éxito.
5. Opcional: tras conectar, leer `GET /{phone_number_id}?fields=status,platform_type` para
   reflejar el estado verdadero (no asumir).

Todo esto es código nuevo → entra por flujo GSD (plan-phase). Tracked también en
`deferred-items.md`.

## Comando de diagnóstico/registro manual (smoke)

`scripts/_meta-register-number.ts` (one-off): desencripta el BISUAT guardado, imprime
`status BEFORE`, llama `register`, imprime la respuesta y `status AFTER`. Útil para depurar
la cadena sin tocar el app code. Correr:
`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_meta-register-number.ts`

## Fuentes (investigación 2026-06-03)
- Desactivar 2SV vía WhatsApp Manager (email, sin PIN): bolddesk KB 17950, chatondesk, chakrahq.
- Migración BSP→Cloud API (2SV debe estar OFF, no se puede por API): respond.io, interakt, Vonage.
- register requiere payment method: descubierto en vivo (error "Cannot Migrate Phone Number").
