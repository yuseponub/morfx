---
status: resolved
trigger: "MorfX antepone hardcoded +57 (Colombia) a números extranjeros al enviar mensajes de WhatsApp"
created: 2026-04-09T12:10:48-05:00
updated: 2026-04-09T12:25:00-05:00
---

## Current Focus

hypothesis: CONFIRMED - src/app/actions/conversations.ts tiene lógica custom que hardcodea '+57' + src/lib/utils/phone.ts rechaza números no-CO
test: Aplicar fix usando libphonenumber-js con parseo internacional
expecting: Números US como +1 714-408-2081 o 7144082081 se normalizan correctamente a E.164
next_action: Refactor normalizePhone + startNewConversation para usar libphonenumber-js internacional

## Symptoms

expected: Enviar mensaje al número US `714082081768` debería normalizarse como `+1 714082081768` (E.164)
actual: MorfX antepone `+57` → queda `+57 714082081768`, mensaje no llega al destino US
errors: Ninguno visible; sistema acepta envío con prefijo equivocado
reproduction: Enviar mensaje desde MorfX a número no colombiano (ej: US 714082081768)
started: Desconocido, posiblemente desde el inicio del sistema (asumió Colombia como único mercado)

## Eliminated

## Evidence

- timestamp: 2026-04-09T12:13:00-05:00
  checked: src/lib/utils/phone.ts normalizePhone()
  found: Línea 53-55 rechaza explícitamente cualquier número que no sea country 'CO'. Esto bloquea todos los números internacionales al crear/editar contactos, CSV import, y tool handlers CRM.
  implication: Cualquier intake de contacto pasa por este filtro y rechaza US/MX/etc.

- timestamp: 2026-04-09T12:13:30-05:00
  checked: src/lib/utils/phone.ts normalizePhoneRaw()
  found: Hardcodea prefijo '57' al inicio si el número tiene 10 dígitos empezando por '3'. Usado por agentes Somnio/Godentist para captura de datos.
  implication: Cualquier número de 10 dígitos no colombiano no es manejado.

- timestamp: 2026-04-09T12:14:00-05:00
  checked: src/app/actions/conversations.ts startNewConversation() líneas 569-594
  found: CULPABLE PRINCIPAL. Normalización custom que (a) strip todos los '+' en línea 571, (b) tiene cascada de if/else-if que asume CO para casi todos los casos, (c) en el else final línea 588 hace literalmente `normalizedPhone = '+57' + normalizedPhone`. Casos que fallan (agregan +57 incorrectamente): cualquier número de 9 dígitos, número de 10 dígitos que no empieza con 3, número de 5-6 dígitos. Casos que fallan diferente: número de 12 dígitos que no empieza con 57 (agrega solo '+' - tampoco correcto para US que debe empezar con +1).
  implication: Este es el flujo que usa el modal "Nueva conversación" de WhatsApp. Raíz del bug reportado.

- timestamp: 2026-04-09T12:14:30-05:00
  checked: src/components/contacts/phone-input.tsx
  found: Usa isValidColombianPhone que verifica específicamente country === 'CO' y rechaza internacionales. Marca como inválido el input del usuario si es número extranjero.
  implication: UI de contactos bloquea capturar contactos internacionales.

- timestamp: 2026-04-09T12:14:45-05:00
  checked: src/lib/whatsapp/webhook-handler.ts línea 162
  found: Para mensajes inbound: `normalizePhone(msg.from) ?? \`+${msg.from.replace(/[^\d]/g, '')}\`` - el fallback PREPENDE '+' crudo. Como msg.from de WhatsApp ya viene en E.164 sin '+', esto funciona para internacionales (fallback se activa cuando normalizePhone rechaza el US). PERO esto significa que contactos inbound US se guardan correctamente, mientras que outbound/manual fallan. Inconsistencia.
  implication: Inbound está OK por accidente, outbound y creación manual rompen.

## Resolution

root_cause: Múltiples puntos asumen Colombia como único mercado. El más crítico es `src/app/actions/conversations.ts:569-594` en `startNewConversation` que tiene lógica manual que (a) strip el '+' inicial del input, (b) en el else final prepende literalmente '+57'. Adicionalmente `src/lib/utils/phone.ts:53-55` rechaza explícitamente cualquier número parseado que no sea country 'CO', bloqueando creación de contactos internacionales vía UI, CSV, y tool handlers.

fix: |
  1. `src/lib/utils/phone.ts`:
     - Reescrito `normalizePhone` para auto-detectar país desde prefijo internacional usando libphonenumber-js.
     - Estrategia: (a) si empieza con '+', parsear como internacional auto-detectado; (b) si <= 10 dígitos sin '+', fallback a CO; (c) si > 10 dígitos sin '+', intentar parsear prepending '+' (auto-detecta país); (d) último recurso CO.
     - Eliminada la verificación `phoneNumber.country !== 'CO'` que rechazaba todos los números internacionales.
     - Añadida función `isValidPhone(input)` genérica internacional.
  2. `src/app/actions/conversations.ts`:
     - `startNewConversation` ahora usa `normalizePhone` del util compartido en lugar de lógica custom que hardcodeaba '+57' en el else final.
     - Eliminadas las 3 líneas `'+57' + normalizedPhone`.
  3. `src/components/contacts/phone-input.tsx`:
     - Cambiado `isValidColombianPhone` → `isValidPhone` (acepta internacionales).
     - Mensaje de error actualizado con ejemplo US.
  4. `src/lib/csv/parser.ts`:
     - Mensaje de error actualizado: ya no dice "debe ser colombiano".
  5. `src/lib/tools/handlers/crm/index.ts`:
     - Mensajes de error en PHONE_INVALID ya no dicen "colombiano", sugerencias incluyen +1 y +52.

verification: |
  1. TypeScript typecheck clean (pre-existing test errors no relacionados).
  2. Script de prueba con libphonenumber-js confirma:
     - `+1 714-408-2081` → `+17144082081` (US, antes rechazado)
     - `17144082081` → `+17144082081` (US sin +, antes rechazado)
     - `+52 55 1234 5678` → `+525512345678` (MX, antes rechazado)
     - `3001234567` → `+573001234567` (CO fallback, backward compat OK)
     - `+573001234567` → `+573001234567` (CO existente, sigue OK)
     - `573001234567` → `+573001234567` (CO sin +, sigue OK)
     - `7144082081` → null (10 dígitos US sin código país, correctamente rechazado - imposible distinguir de CO). UI pide código de país explícito.
  3. Webhook inbound sigue funcionando: msg.from viene como "573001234567" o "17144082081" → Strategy 3 prepende '+' y libphonenumber detecta país.
  4. `isValidColombianPhone` se mantiene para backward compat de otros callers (aunque ya no se usa en phone-input.tsx).

files_changed:
  - src/lib/utils/phone.ts
  - src/app/actions/conversations.ts
  - src/components/contacts/phone-input.tsx
  - src/lib/csv/parser.ts
  - src/lib/tools/handlers/crm/index.ts
