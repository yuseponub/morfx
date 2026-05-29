---
phase: somnio-v4-crm-subloop
plan: 03
subsystem: domain-contacts
tags: [domain, contacts, find-or-create, D-24, pitfall-2]
requires: []
provides:
  - "resolveOrCreateContact(ctx, params) en domain/contacts.ts"
  - "find-or-create idempotente por telefono exacto → contactId UUID para crm-mutation-tools.createOrder"
affects:
  - "Plan 05/06 (sub-loop) consumira este helper para resolver contactId antes de createOrder"
tech-stack:
  added: []
  patterns:
    - "Composicion domain-layer: resolveOrCreateContact compone searchContacts + createContact (no reimplementa el insert)"
    - "Match exacto por normalizePhone sobre resultado ILIKE (evita reusar contacto erroneo)"
    - "Mock S-4 del supabase admin client para test de composicion intra-modulo"
key-files:
  created:
    - "src/lib/domain/__tests__/resolve-or-create-contact.test.ts"
  modified:
    - "src/lib/domain/contacts.ts (aditivo: nueva funcion exportada + 2 interfaces)"
decisions:
  - "D-24: resolveOrCreateContact 100% domain-layer reemplaza OrderCreator.findOrCreateContact (eliminado por D-06)"
  - "Match EXACTO por telefono normalizado, NO parcial por nombre/email (T-cnt-01)"
metrics:
  duration: "~5min"
  completed: "2026-05-29"
  tasks: 1
  files: 2
---

# Phase somnio-v4-crm-subloop Plan 03: resolveOrCreateContact Summary

Helper domain `resolveOrCreateContact(ctx, params)` que compone `searchContacts(phone)` + `createContact` para dar un `contactId` UUID idempotente por telefono, cerrando el BLOCKER de Pitfall 2 / D-24 (crm-mutation-tools.createOrder requiere UUID pero el agente v4 maneja telefono string).

## What Was Built

- **`src/lib/domain/contacts.ts`** (aditivo): nueva funcion exportada `resolveOrCreateContact` + interfaces `ResolveOrCreateContactParams` / `ResolveOrCreateContactResult`. Logica:
  1. `normalizePhone(params.phone)` → si null, retorna `{ success:false, error:'Numero de telefono invalido' }` antes de tocar DB (T-cnt-03).
  2. `searchContacts(ctx, { query: normalizedPhone, limit: 10 })` → acepta SOLO un contacto cuyo `normalizePhone(c.phone) === normalizedPhone` (match EXACTO, evita reusar por nombre/email parcial — T-cnt-01) → retorna `{ contactId, created:false }`.
  3. Sin match → `createContact(...)` (mismo path Regla 3, name fallback al telefono) → `{ contactId, created:true }`. Propaga error si falla.
- **`src/lib/domain/__tests__/resolve-or-create-contact.test.ts`**: 4 tests (resolve-existing, create-new, invalid-phone, match-exacto-por-telefono) mockeando el supabase admin client (patron S-4).

## Regla 3 / Regla 6 Compliance

- **Regla 3:** `createAdminClient` NO se introduce en `resolveOrCreateContact`; vive solo dentro de `searchContacts` / `createContact` (funciones domain existentes que el helper compone). Workspace isolation via `ctx.workspaceId` heredado de ambas (T-cnt-02).
- **Regla 6 (aditivo):** cambio puramente aditivo. Verificado: `git diff ce33f0a1 -- src/lib/domain/contacts.ts | grep -E "^-" | grep createContact|searchContacts` retorna VACIO — cero modificaciones a funciones existentes. Blast radius nulo (ningun agente lo consume hasta Plan 05/06).

## Verification

- `npx vitest run src/lib/domain/__tests__/resolve-or-create-contact.test.ts` → 4/4 verdes.
- `npx vitest run src/lib/domain/` → 26/26 verdes (sin regresion en conversations + orders).
- `npx tsc --noEmit` → 0 errores en archivos tocados (solo persisten los pre-existentes documentados: conversations.test.ts + validator.ts).
- Greps de acceptance: export func (1 match), composicion (await searchContacts + await createContact), normalizePhone match exacto, additive-check VACIO.

## TDD Gate Compliance

- RED: `test(v4-crm-subloop): failing tests para resolveOrCreateContact` (`ce33f0a1`) — 4 tests fallan con `resolveOrCreateContact is not a function`.
- GREEN: `feat(v4-crm-subloop): resolveOrCreateContact domain helper (D-24)` (`e6796b91`) — 4/4 verdes.
- REFACTOR: no necesario (implementacion limpia).

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito.

Nota de interfaz: el plan describia `createContact` retornando `{ id, ... }`, pero el contrato real es `CreateContactResult = { contactId: string }`. El helper consume `created.data.contactId` (el valor correcto). Sin impacto funcional.

## Commits

- `ce33f0a1` test(v4-crm-subloop): failing tests para resolveOrCreateContact (D-24)
- `e6796b91` feat(v4-crm-subloop): resolveOrCreateContact domain helper (D-24) — find-or-create por telefono

## Self-Check: PASSED

- FOUND: src/lib/domain/contacts.ts
- FOUND: src/lib/domain/__tests__/resolve-or-create-contact.test.ts
- FOUND: .planning/standalone/somnio-v4-crm-subloop/03-SUMMARY.md
- FOUND commit: ce33f0a1 (RED)
- FOUND commit: e6796b91 (GREEN)
