---
phase: whatsapp-crm-read-latency
plan: 07
subsystem: crm-read-latency
tags: [performance, server-actions, auth, getRequestAuth, pitfall-8, regla-6]
status: at-checkpoint
requires:
  - "01-SUMMARY (getRequestAuth helper — verify ES256 local, sin round-trip a GoTrue)"
  - "03-SUMMARY (revalidateTag/updateTag 'ref:pipelines:'+ws agregado a pipelines.ts — double-touch a preservar)"
  - "06-SUMMARY (mismo patron drop-in del barrido seguro)"
provides:
  - "Los 5 archivos sensibles (pipelines/whatsapp/messages/godentist/client-activation) con 0 auth.getUser()"
  - "Barrido GLOBAL cerrado: grep -rc 'auth.getUser()' src/app/actions/ == 0 (42 archivos)"
affects:
  - "Todas las Server Actions de UI de los 5 archivos — auth local en vez de round-trip GoTrue"
tech-stack:
  added: []
  patterns:
    - "Pitfall 8 caller-trace: las funciones de envio/scraping/trigger que comparten nombre con paths de agente son del DOMAIN LAYER, no las Server Actions de UI; los 5 modulos 'use server' se importan SOLO desde UI"
    - "pipelines.ts double-touch: auth migrado en lineas distintas al updateTag('ref:pipelines:') del Plan 03 — ambos coexisten"
key-files:
  created:
    - ".planning/standalone/whatsapp-crm-read-latency/07-SUMMARY.md"
  modified:
    - "src/app/actions/pipelines.ts"
    - "src/app/actions/whatsapp.ts"
    - "src/app/actions/messages.ts"
    - "src/app/actions/godentist.ts"
    - "src/app/actions/client-activation.ts"
decisions:
  - "Las 12+ funciones de los 5 archivos resultaron TODAS de UI (caller-trace Pitfall 8) → todas migradas; CERO funciones quedaron sin migrar"
  - "pipelines.ts: auth.workspaceId reemplaza la lectura manual de cookie morfx_workspace en los updateTag, conservando los 8 ref:pipelines del Plan 03"
  - "client-activation.updateClientActivation: auth.userId reemplaza user.id en el gate de rol admin/owner"
metrics:
  tasks_completed: 3
  tasks_total: 4
  files_created: 1
  files_modified: 5
  commits: 5
  duration: "~20 min"
  completed_date: "2026-06-03"
---

# Standalone whatsapp-crm-read-latency Plan 07: Ola 2 (grupo SENSIBLE — cierre del barrido global) Summary

Cierra la deuda estructural del barrido de auth: los 5 archivos sensibles de `src/app/actions/**` (pipelines, whatsapp, messages, godentist, client-activation) migran sus Server Actions de UI de `auth.getUser()` (round-trip a GoTrue ~150-300ms) a `getRequestAuth()` (verify JWT local ES256 cacheado por-request del Plan 01). Tras este plan, `grep -rc "auth.getUser()" src/app/actions/` es **0 GLOBAL** (42 archivos: Plan 02=5 + Plan 05=9 + Plan 06=23 + Plan 07=5). Las 3 tareas auto estan COMPLETAS y commiteadas en `main`; el plan esta detenido en el checkpoint `human-verify` (blocking).

## The Crux — Analisis de Caller por Funcion (Pitfall 8 + Regla 6)

La instruccion central del plan: para cada `auth.getUser()` en los 5 archivos, **trazar el caller** y migrar SOLO si la funcion es una Server Action de UI invocada desde el dashboard (con la cookie `morfx_workspace` + contexto request-auth). Funciones invocadas desde agente/webhook/robot/inngest NO deben migrarse (usan auth distinta sin la cookie de UI).

**Metodo de verificacion:** en vez de trazar funcion-por-funcion de forma aislada, se verifico el caller a nivel de modulo de import:

```
grep -rn "from '@/app/actions/{pipelines,whatsapp,messages,godentist,client-activation}'" src/ \
  | grep -vE "src/app/\(dashboard\)|src/components|src/hooks"
```

Resultado: **0 matches no-UI** para los 5 modulos. Cada uno se importa EXCLUSIVAMENTE desde componentes/hooks/pages del dashboard.

**El falso positivo que Pitfall 8 advierte:** al hacer `grep -rn "sendMessage" src/`, aparecen matches en `src/lib/agents/somnio/message-sequencer.ts`, `src/inngest/functions/agent-timers-v4.ts`, `src/inngest/functions/godentist-reminders.ts`, etc. **PERO** esos matches son:
- Metodos de clase homonimos (`message-sequencer.ts` tiene su propio `async sendMessage(...)`), o
- La funcion del **DOMAIN LAYER** (`sendTextMessage`/`sendMediaMessage`/`sendTemplateMessage` de `@/lib/domain/messages`, o `sendMediaMessage` de `@/lib/whatsapp/api`).

Los agentes, inngest y el robot usan el **domain layer directo**, NUNCA los modulos `'use server'` de `src/app/actions/**`. Esa es exactamente la separacion que la Regla 3 (mutaciones via domain) impone, y por eso ninguna Server Action de UI es compartida con un path de agente.

**Conclusion:** las 12+ funciones con `auth.getUser()` en los 5 archivos resultaron TODAS ser Server Actions de UI. **Todas migradas; CERO funciones quedaron intencionalmente sin migrar.** No hubo ninguna funcion de agente/webhook/robot que requiriera dejarse con su `auth.getUser()`.

### Tabla de caller-trace por archivo

| Archivo | getUser antes | Funciones | Caller verificado | Migradas |
| --- | --- | --- | --- | --- |
| pipelines.ts | 11 | getPipelines, getPipeline, getOrCreateDefaultPipeline, createPipeline, updatePipeline, deletePipeline, updatePipelineOrder, createStage, updateStage, updateStageOrder, deleteStage | UI (CRM config pipelines, kanban) — import solo en dashboard/actions | 11/11 |
| whatsapp.ts | 3 | getRecentOrders, getContactOrders, getOrdersForContacts | UI (contact-panel.tsx, use-conversations.ts) | 3/3 |
| messages.ts | 5 | getMessages, sendMessage, sendMediaMessage, markMessageAsRead, sendTemplateMessage | UI (message-input.tsx, template-send-modal.tsx, builder-chat.tsx, chat-pane.tsx) — envio real delega al domain | 5/5 |
| godentist.ts | 10 | scrapeAppointments, sendConfirmations, getScrapeHistory, getAppointmentForContact, confirmAppointment, scheduleReminders, getScheduledReminders, getScheduledRemindersGroupedByScrape, cancelScheduledReminder, getFollowupPreview | UI (confirmaciones-panel.tsx, chat-header.tsx) — robot Railway + Inngest son DOWNSTREAM de acciones de operador | 10/10 |
| client-activation.ts | 2 | getClientActivationSettings, updateClientActivation | UI (settings/activacion-cliente, whatsapp/page.tsx) — el trigger is_client vive en domain + Postgres trigger, no en estas actions | 2/2 |

## What Was Built

### Task 1 — pipelines.ts (commit `3dc3e3ab`)
- Import `getRequestAuth`, elimina import `cookies` (ya no se usa).
- 11 `auth.getUser()` → `getRequestAuth()` (patron drop-in: `const auth = await getRequestAuth(); if (!auth) return ...; const workspaceId = auth.workspaceId; const supabase = await createClient()`).
- **Double-touch Plan 03 preservado:** los 8 `updateTag('ref:pipelines:'+ws)` siguen presentes; donde Plan 03 leia la cookie (`const ws = (await cookies()).get('morfx_workspace')?.value; if (ws) updateTag(...)`) ahora usa `updateTag('ref:pipelines:' + auth.workspaceId)` directo (auth.workspaceId garantizado no-null cuando auth existe). `revalidatePath` intacto. Verificado: `grep -c "ref:pipelines" pipelines.ts` == 8.

### Task 2 — whatsapp.ts + messages.ts (commits `c4431746`, `61c6292a`)
- **whatsapp.ts:** 3 funciones migradas. `getActiveContactOrders` NO tenia getUser (solo lee cookie para reglas de cierre via getClosureTagRules) — conserva su `cookies()` import y lectura. La logica de orders/tags/stage sin cambios.
- **messages.ts:** 5 funciones migradas; import `cookies` eliminado. La ventana de 24h, el upload de media a Supabase Storage (`createAdminClient` adapter concern), y la delegacion al domain layer (`domainSendTextMessage`/`domainSendMediaMessage`/`domainSendTemplateMessage`) sin cambios. Regla 6: el envio real (que el agente tambien usa via domain) NO cambia de comportamiento.

### Task 3 — godentist.ts + client-activation.ts (commits `997126c6`, `986e5729`)
- **godentist.ts:** 10 Server Actions migradas; import `cookies` eliminado, `createClient` conservado (lo usa `sendConfirmations` para `workspaces.settings`; el resto usa solo `createAdminClient`). El fetch al robot Railway (`ROBOT_URL`), los eventos Inngest (`godentist/scrape.inconsistent`, `godentist/followup.check`, `godentist/reminder.send`, `godentist/tag.remove_scheduled`), el canary D-08 cross-sede, el dedupe D-12, y el helper `findOrCreateContact` (domain layer) SIN cambios. Regla 6: el runtime del agente godentist vive en `src/lib/agents/godentist`, no toca este archivo.
- **client-activation.ts:** 2 funciones migradas; import `cookies` eliminado, `createClient` conservado (lo usa `updateClientActivation` para el gate de rol). `updateClientActivation` usa `auth.userId` (antes `user.id`) en el `.eq('user_id', ...)` del check admin/owner. El backfill (`backfillIsClient` domain) y el trigger Postgres `mark_client_on_stage_change` SIN cambios.

## Deviations from Plan

None — plan executed exactly as written. Todas las funciones resultaron de UI (caller-trace Pitfall 8), por lo que no hubo necesidad de dejar ninguna `auth.getUser()` ni de usar el patron getClaims-sin-cookie (a diferencia de Plan 05/06 con workspace.ts/invitations.ts, aqui todos los callers son UI con cookie de workspace ya seleccionada).

## Verification

- **GLOBAL:** `grep -rc "auth.getUser()" src/app/actions/ | grep -v ":0"` → VACIO. **0 auth.getUser() en los 42 archivos.** Barrido cerrado.
- Per-file getUser: pipelines=0, whatsapp=0, messages=0, godentist=0, client-activation=0.
- pipelines.ts: `grep -c "ref:pipelines" ` == 8 (Plan 03 double-touch preservado).
- **Pitfall 8 leakage:** `grep -rln "getRequestAuth" src/ | grep -vE "src/lib/auth/|src/app/actions/"` → VACIO (el helper de UI NO se filtro a `src/lib/agents/**`, `src/inngest/**`, ni `src/app/api/**`).
- **D-04:** `git diff --stat src/lib/supabase/middleware.ts` → VACIO (middleware byte-identico, refresh+revocation siguen siendo su trabajo).
- `npx tsc --noEmit`: 0 errores nuevos. 2 errores PRE-EXISTENTES ajenos (confirmados en planes previos): `.next/dev/types/validator.ts` (cache stale del dev, x4 nombres) + `src/lib/domain/__tests__/conversations.test.ts` (eqMock implicit any, x2).
- Suite vitest: ningun test importa los 5 modulos migrados (`@/app/actions/{pipelines,whatsapp,messages,godentist,client-activation}` no aparece en ningun `*.test.ts/tsx`) → sin regresion posible de suite por estos cambios. Ademas estos son modulos `'use server'` que importan `next/headers` (no cargable en vitest).

## Checkpoint Status: AT CHECKPOINT (Task 4 — human-verify, blocking)

Las 3 tareas auto estan COMPLETAS y commiteadas en `main` (NO pusheado). El plan esta detenido en el checkpoint `human-verify`. Pendiente del usuario:

1. **Push a main** + esperar deploy Vercel.
2. **Bootstrap first-login (Warning 1, critico):** probar primer login / usuario sin cookie `morfx_workspace` (incognito) — el dashboard DEBE resolver el workspace via el fallback de `getActiveWorkspaceId` (Plan 05) y NO quedar en "No autenticado". (Nota: ninguno de los 5 archivos de este plan corre antes de seleccionar workspace; el fallback de bootstrap vive en workspace.ts, sin tocar aqui.)
3. **Smoke amplio del dashboard:** CRM (contactos/pedidos/tareas/notas), WhatsApp (inbox/templates/ojito), pipelines (kanban + config), godentist (confirmaciones/recordatorios), client-activation (settings), integraciones — todo carga normal y mas rapido (cambio de conversacion hot-path mas agil).
4. **Gate admin/owner:** confirmar que client-activation sigue gateado (solo admin/owner puede cambiar config) y super-admin/sms-admin intactos (no se relajaron en este plan).
5. **Regla 6 — agente/robot en prod:** somnio + godentist + robot Railway godentist siguen respondiendo/operando identico (este barrido toco SOLO Server Actions de UI; runtime de agente/domain intacto).
6. **Sin errores de auth:** ningun "No autenticado" inesperado ni pantallas vacias.

Resume-signal: el usuario escribe "approved" si todo OK, o describe el problema.

## Self-Check: PASSED
- `src/app/actions/pipelines.ts` — FOUND (modified)
- `src/app/actions/whatsapp.ts` — FOUND (modified)
- `src/app/actions/messages.ts` — FOUND (modified)
- `src/app/actions/godentist.ts` — FOUND (modified)
- `src/app/actions/client-activation.ts` — FOUND (modified)
- commit `3dc3e3ab` (pipelines) — FOUND
- commit `c4431746` (whatsapp) — FOUND
- commit `61c6292a` (messages) — FOUND
- commit `997126c6` (godentist) — FOUND
- commit `986e5729` (client-activation) — FOUND
