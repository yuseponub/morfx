---
phase: quick-038
plan: 038
type: summary
completed: 2026-04-09
commit: ed7ecad
duration: ~10min
subsystem: crm/whatsapp/utils
tags:
  - phone
  - normalization
  - libphonenumber-js
  - international
  - bugfix
requires:
  - .planning/debug/resolved/foreign-number-prefix.md
provides:
  - "normalizePhone internacional (libphonenumber-js auto-deteccion pais)"
  - "isValidPhone generica internacional"
  - "startNewConversation sin hardcode +57"
  - "PhoneInput UI acepta internacionales"
affects:
  - "Envio WhatsApp a clientes US/MX/etc"
  - "CSV import con numeros internacionales"
  - "CRM tool handlers (contact_create/update)"
tech-stack:
  added: []
  patterns:
    - "Phone normalization delegado a helper compartido (src/lib/utils/phone.ts)"
key-files:
  created: []
  modified:
    - src/lib/utils/phone.ts
    - src/app/actions/conversations.ts
    - src/components/contacts/phone-input.tsx
    - src/lib/csv/parser.ts
    - src/lib/tools/handlers/crm/index.ts
---

# Quick Task 038: Fix Normalizacion Telefonos Internacionales Summary

## One-liner

Reemplaza logica manual que hardcodeaba '+57' por parseo E.164 auto-detectado con libphonenumber-js, desbloqueando envio de WhatsApp a numeros internacionales (US, MX, etc.).

## Context

El fix ya fue aplicado al working tree por una sesion de debug previa (ver `.planning/debug/resolved/foreign-number-prefix.md`). Esta quick task cerro el loop: verifico congruencia del working tree vs debug session, re-corrio typecheck, y consolido el fix en 1 commit atomico.

## Verification Performed

### 1. Working tree vs debug session

Los 5 archivos modificados coinciden exactamente con el bloque `fix:` del debug session:

| Archivo | Cambio verificado |
|---|---|
| `src/lib/utils/phone.ts` | `normalizePhone` reescrita con `parsePhoneNumberFromString` (4 estrategias: +prefix, <=10 digitos CO fallback, 11+ con + prepended, CO last resort). Nueva `isValidPhone` generica. Se elimino el rechazo `phoneNumber.country !== 'CO'`. |
| `src/app/actions/conversations.ts` | `startNewConversation` ahora importa y llama `normalizePhone` del helper compartido. Las 3 ramas que prependian `+57` fueron eliminadas. |
| `src/components/contacts/phone-input.tsx` | `isValidColombianPhone` reemplazado por `isValidPhone`. Mensaje de error incluye ejemplo `+1 714 408 2081`. |
| `src/lib/csv/parser.ts` | Mensaje de error ya no dice "colombiano", menciona E.164 con ejemplos `+573001234567` y `+17144082081`. |
| `src/lib/tools/handlers/crm/index.ts` | Mensajes `PHONE_INVALID` en `contactCreate` y `contactUpdate` ya no dicen "colombiano", sugerencias incluyen `+17144082081` y `+525512345678`. |

### 2. TypeScript typecheck

`npx tsc --noEmit` ejecutado. Los errores reportados son **todos preexistentes** y **no relacionados** con los 5 archivos del fix:

- `contacts-table.tsx`, `contact-selector.tsx`, `kanban-board.tsx`, `quick-reply-autocomplete.tsx`: `Timeout` type (preexistente)
- `api/webhooks/twilio/status/route.ts`: `FormData.get` (preexistente)
- `src/lib/agents/somnio/__tests__/*`: modulo `vitest` no encontrado (preexistente)
- `src/lib/tools/rate-limiter.ts`: `unref` (preexistente)

Cero errores nuevos en los 5 archivos modificados. Concuerda con la verificacion original del debugger.

### 3. Commit atomico

```
ed7ecad fix(quick-038): normalizacion internacional de telefonos
 5 files changed, 80 insertions(+), 60 deletions(-)
```

Exactamente 5 archivos staged explicitamente por nombre (no `git add .`). Otros cambios en progreso del repo (fases 42, 42.1, standalone plans, package.json, scripts/voice-app/, etc.) preservados intactos.

## Casos Verificados (por el debug session original)

| Input | Output | Nota |
|---|---|---|
| `+1 714-408-2081` | `+17144082081` | US, antes rechazado |
| `17144082081` | `+17144082081` | US sin +, antes rechazado |
| `+52 55 1234 5678` | `+525512345678` | MX, antes rechazado |
| `3001234567` | `+573001234567` | CO fallback, backward compat |
| `+573001234567` | `+573001234567` | CO existente OK |
| `573001234567` | `+573001234567` | CO sin + OK |
| `7144082081` | `null` | 10 digitos ambiguo (US sin codigo pais indistinguible de CO). UI debe pedir codigo pais explicito. |

## Decisiones Hechas

### Fuera de scope (por diseno)

**`src/lib/agents/somnio/normalizers.ts` NO fue modificado.** Este archivo contiene normalizacion custom para los agentes Somnio/Godentist, los cuales solo atienden mercado colombiano por ahora. No hay caso de uso para clientes internacionales en esos agentes. Si en el futuro se expanden a otros mercados, crear quick task aparte.

**`isValidColombianPhone` NO fue eliminada.** Se mantuvo exportada para backward compat de otros callers (aunque `phone-input.tsx` ya no la usa). Eliminarla seria breaking change.

### Estrategia de normalizacion (4 fases)

1. Si empieza con `+` -> parse internacional, auto-detecta pais
2. Si `<=10` digitos sin `+` -> fallback CO (backward compat con data existente)
3. Si `11+` digitos sin `+` -> prepend `+` y auto-detecta (maneja `573001234567`, `17144082081`)
4. Last resort -> CO default

Esto mantiene compatibilidad 100% con data CO existente mientras desbloquea internacionales.

## Deviations from Plan

Ninguna. El plan se ejecuto exactamente como fue escrito: verificar -> typecheck -> commit atomico -> summary. El fix ya estaba aplicado al working tree por el debugger previo.

## Referencias

- **Debug session (root cause analysis):** `.planning/debug/resolved/foreign-number-prefix.md`
- **Commit:** `ed7ecad` en main (local, no pushed aun — usuario decide cuando)
- **Bug reportado:** MorfX antepone `+57` hardcoded a numeros extranjeros, impidiendo envio WhatsApp a clientes US/MX. Ahora resuelto.

## Next Steps (fuera de esta task)

- **Push a Vercel:** Usuario decide cuando. Sugerido probar primero en dev el modal "Nueva conversacion" con un numero US.
- **UI enhancement (futuro):** Considerar agregar selector de codigo de pais explicito en `phone-input.tsx` para desambiguar numeros de 10 digitos sin `+`.
- **Agentes Somnio/Godentist:** Si expanden a mercados internacionales, crear quick task para actualizar `normalizers.ts`.
