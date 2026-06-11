---
phase: agent-varixcenter
plan: 03
subsystem: domain/varix-clinic
tags: [domain, supabase, cross-project, constants, varix-clinic]
requires:
  - "00-WAVE0-AUDIT.md (UUIDs reales de los 2 doctores)"
provides:
  - "getVarixClinicClient() — singleton cliente Supabase de varix-clinic (único createClient cross-project)"
  - "DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID, DOCTOR_UUIDS"
  - "SLOT_MINUTES (20), APPOINTMENT_DURATION_MINUTES (20)"
  - "HORARIOS (weekday manana+tarde, saturday solo manana)"
  - "VALORACION_MOTIVO"
affects:
  - "availability.ts + booking.ts (Wave 2) — consumirán este cliente y constantes"
tech-stack:
  added: []
  patterns:
    - "Cliente Supabase cross-project aislado en un solo módulo (análogo a platform-config.ts)"
    - "Desviación domain documentada: sin DomainContext / workspace_id (mono-cliente)"
    - "Fail-fast en el cliente → fail-open en el caller (Pitfall 8)"
key-files:
  created:
    - "src/lib/domain/varix-clinic/client.ts"
    - "src/lib/domain/varix-clinic/constants.ts"
  modified: []
decisions:
  - "service_role key porque la RLS de varix-clinic exige usuario authenticated rol staff y el bot no tiene sesión"
  - "Singleton cachea _client (igual patrón que createAdminClient pero cross-project)"
  - "UUIDs concretos de 00-WAVE0-AUDIT (Ciro fa3e2e8d…, Carolina aee08e40…) — exactamente 2 doctores, sin ambigüedad"
metrics:
  duration: "~5 min"
  tasks-completed: 2
  files-created: 2
  completed: 2026-06-11
---

# Phase agent-varixcenter Plan 03: Domain module varix-clinic base — Summary

Creada la fundación del domain module `varix-clinic`: el cliente Supabase del proyecto hermano (único `createClient` cross-project, con fail-fast) y las constantes de negocio (UUIDs reales de los 2 doctores, horarios hábiles del diseño §8, slot 20min). availability.ts y booking.ts (Wave 2) construirán sobre esto.

## What Was Built

### Task 1 — `src/lib/domain/varix-clinic/client.ts` (commit `415ca99d`)
- `getVarixClinicClient(): SupabaseClient` — singleton que cachea `_client`.
- Lee `VARIX_CLINIC_SUPABASE_URL` + `VARIX_CLINIC_SERVICE_ROLE_KEY` de `process.env`; **throw** si falta cualquiera (fail-fast).
- `createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })`.
- Header documenta: (1) único punto que instancia el Supabase de varix-clinic; (2) desviación del patrón domain — sin `DomainContext`/`workspace_id` porque varix-clinic es mono-cliente; (3) uso de `service_role` (RLS exige staff, bot sin sesión); (4) fail-fast → caller hace fail-open (handoff, Pitfall 8).

### Task 2 — `src/lib/domain/varix-clinic/constants.ts` (commit `37bb87cb`)
- `DOCTOR_CIRO_UUID = 'fa3e2e8d-faf4-40b0-a3cb-a8d50780988d'` (Dr. Ciro Mario Romero).
- `DOCTOR_CAROLINA_UUID = 'aee08e40-5c60-481e-966f-51af351351e8'` (Dra. María Carolina Romero).
- `DOCTOR_UUIDS = [CIRO, CAROLINA] as const`.
- `SLOT_MINUTES = 20` + `APPOINTMENT_DURATION_MINUTES = 20` (D-03).
- `HORARIOS`: `weekday { manana: [480, 690], tarde: [870, 930] }`, `saturday { manana: [480, 720], tarde: null }` (minutos desde medianoche — L-V 8:00–11:30 + 14:30–15:30, sáb 8:00–12:00 sin tarde).
- `VALORACION_MOTIVO = 'Valoración (agendada por bot WhatsApp)'`.

## Verification

| Check | Resultado |
| ----- | --------- |
| `grep -c getVarixClinicClient client.ts` | 1 ✅ |
| `grep -c VARIX_CLINIC_SUPABASE_URL client.ts` | 3 ✅ |
| `grep -c "DOCTOR_CIRO_UUID" constants.ts` | 2 ✅ |
| `grep -c "SLOT_MINUTES = 20" constants.ts` | 1 ✅ |
| `grep -cE UUID-regex constants.ts` | 2 (≥2 requerido) ✅ |
| `tsc --noEmit` sobre los 2 archivos | 0 errores ✅ |
| `createClient` en src/lib/domain/varix-clinic/ | solo client.ts (único) ✅ |

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. Los UUIDs usados son los reales de 00-WAVE0-AUDIT.md (no placeholders); exactamente 2 doctores, sin la ambigüedad A3 del research.

## Known Stubs

None. Ambos archivos están completos y wired para que los consumidores de Wave 2 (availability.ts, booking.ts) los importen.

## Self-Check: PASSED

- FOUND: src/lib/domain/varix-clinic/client.ts
- FOUND: src/lib/domain/varix-clinic/constants.ts
- FOUND: commit 415ca99d (client.ts)
- FOUND: commit 37bb87cb (constants.ts)
