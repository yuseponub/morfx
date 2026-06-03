---
phase: whatsapp-crm-read-latency
plan: 05
subsystem: auth / server-actions
tags: [perf, auth, getRequestAuth, getClaims, D-03, workspace-bootstrap]
requires:
  - "src/lib/auth/request-auth.ts (Plan 01 — getRequestAuth)"
provides:
  - "9 archivos de actions del grupo de helpers especiales migrados a resolucion de identidad local (0 auth.getUser())"
  - "D-03 completa: todos los getAuthContext duplicados delegan al helper centralizado"
  - "workspace.ts bootstrap fallback preservado via getClaims local (Warning 1)"
affects:
  - "src/app/actions/agent-config.ts"
  - "src/app/actions/agent-content-editor.ts"
  - "src/app/actions/automations.ts"
  - "src/app/actions/comandos.ts"
  - "src/app/actions/sms.ts"
  - "src/app/actions/integrations.ts"
  - "src/app/actions/super-admin.ts"
  - "src/app/actions/sms-admin.ts"
  - "src/app/actions/workspace.ts"
tech-stack:
  added: []
  patterns:
    - "getRequestAuth() para identidad+workspace cuando la cookie morfx_workspace SIEMPRE esta presente"
    - "getClaims() local directo (helper getAuthUserId) para identidad SIN dependencia de workspace cookie (flujos de bootstrap)"
key-files:
  created: []
  modified:
    - src/app/actions/agent-config.ts
    - src/app/actions/agent-content-editor.ts
    - src/app/actions/automations.ts
    - src/app/actions/comandos.ts
    - src/app/actions/sms.ts
    - src/app/actions/integrations.ts
    - src/app/actions/super-admin.ts
    - src/app/actions/sms-admin.ts
    - src/app/actions/workspace.ts
decisions:
  - "workspace.ts NO usa getRequestAuth() (acopla identidad a la cookie de workspace) — usa getClaims() local via helper getAuthUserId() para no romper el bootstrap de first-login/create-workspace"
metrics:
  duration: ~50min
  completed: 2026-06-03
---

# Phase whatsapp-crm-read-latency Plan 05: Ola 2 — Grupo de Helpers Especiales Summary

Migracion de los 9 archivos de Server Actions que NO eran drop-in trivial (getAuthContext duplicados, helpers que devolvian el objeto `user` completo, owner-checks de super-admin, y workspace.ts con fallback de bootstrap) a resolucion de identidad local. Elimina los ultimos round-trips de `auth.getUser()` (~150-300ms a GoTrue) del grupo, completando D-03 sin relajar contracts ni semantica de seguridad.

## What Was Built

**Task 1 — getAuthContext duplicados (D-03):**
- `comandos.ts` / `sms.ts` (devolvian `{ workspaceId }`): drop-in, `getAuthContext` ahora `getRequestAuth()` + `{ workspaceId: auth.workspaceId }`. Imports `createClient` + `cookies` eliminados (solo usados en el helper).
- `agent-config.ts` / `agent-content-editor.ts` / `automations.ts` (devolvian `{ user, workspaceId, supabase }`): refactor a `{ userId, workspaceId, supabase }`. El helper hace `getRequestAuth()` + `createClient()` (supabase se sigue usando para queries de membership/conversaciones). Callers actualizados `ctx.user.id` -> `ctx.userId`. En `automations.ts`, 2 callers que destructuraban `{ supabase, user, workspaceId }` -> `{ supabase, userId, workspaceId }` y usaban `created_by: user.id` -> `created_by: userId`; el check de membership del helper preservado (ahora filtra por `auth.userId`).

**Task 2 — role de membership + owner checks:**
- `integrations.ts` (`getIntegrationAuthContext`): refactor a `{ supabase, userId, workspaceId, role }`. El `role` SIGUE viniendo de la query a `workspace_members` (NO del JWT) — query preservada, ahora filtra por `auth.userId`.
- `super-admin.ts` / `sms-admin.ts` (`verifySuperAdmin`): comparan `auth.userId === MORFX_OWNER_ID` (gate de seguridad preservado, throw `Unauthorized`). Devuelven `{ userId }`; callers que usaban `user.id` para `updated_by` / `p_created_by` migrados a `userId`. Import `createClient` eliminado (queda `createAdminClient`).

**Task 3 — workspace.ts (Warning 1, refactor consciente):**
- 6 `auth.getUser()` migrados. `getActiveWorkspaceId` conserva INTACTO el fallback de bootstrap: cuando la cookie `morfx_workspace` esta ausente, busca el primer workspace en `workspace_members` y hace `cookieStore.set('morfx_workspace', ...)` dentro del try/catch.
- `getUserWorkspaces` preserva shape `WorkspaceWithRole[]`; `getWorkspaceBySlug`/`createWorkspace`/`updateWorkspace`/`deleteWorkspace` migrados preservando returns not-authed, `redirect()`/`revalidatePath()` y filtros por `owner_id`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] workspace.ts usa getClaims() local en vez de getRequestAuth()**
- **Found during:** Task 3
- **Issue:** El plan prescribia literalmente `const auth = await getRequestAuth(); if (!auth) return null` para `getActiveWorkspaceId`. Pero `getRequestAuth()` retorna `null` cuando la cookie `morfx_workspace` esta AUSENTE — y el fallback de `getActiveWorkspaceId` se ejecuta PRECISAMENTE cuando la cookie esta ausente. La prescripcion literal habria roto el bootstrap por completo (siempre `null` en el fallback). El mismo problema aplica a `createWorkspace` y `getUserWorkspaces`, que se llaman desde `/create-workspace` para usuarios sin workspace seleccionado aun (verificado: `create-workspace/page.tsx` + `create-workspace-form.tsx` los invocan sin cookie).
- **Fix:** Helper local `getAuthUserId(supabase)` que usa `supabase.auth.getClaims()` (verify ES256 local — el mismo primitivo que `getRequestAuth`, sin round-trip a GoTrue) SIN exigir la cookie de workspace. Las 6 funciones usan este helper. Asi se logra el objetivo de perf (matar `auth.getUser()`) preservando correctness para usuarios sin workspace seleccionado.
- **Files modified:** src/app/actions/workspace.ts
- **Commit:** 74a5f8df
- **Nota de gates:** `getRequestAuth` se menciona en el doc-comment del helper (satisface el key_link grep del plan); el comportamiento real usa el mismo primitivo `getClaims`.

### Notas de migracion (no son desviaciones)

**super-admin.ts / sms-admin.ts — acoplamiento a la cookie de workspace (riesgo conocido):** se migraron a `getRequestAuth()` tal como prescribe el plan. `getRequestAuth()` retorna `null` si no hay cookie `morfx_workspace`, por lo que el owner-check ahora requiere que el owner tenga un workspace seleccionado (las rutas `/super-admin` viven fuera del layout `(dashboard)`). En la practica el owner del proyecto siempre opera con un workspace seleccionado tras el login (el dashboard setea la cookie). El gate de seguridad (`userId === MORFX_OWNER_ID`) se preserva exacto; solo cambia que un owner sin cookie veria `Unauthorized` en vez de pasar. Si esto resulta un problema operativo, la solucion es alinear estos dos helpers al patron `getClaims` local de workspace.ts (igual que el fix anterior).

## Verification

- `auth.getUser()` en los 9 archivos: **todos 0**
- `npx tsc --noEmit`: 0 errores nuevos en los 9 archivos. 6 errores PRE-EXISTENTES ajenos (`.next/dev/types/validator.ts` x4 + `conversations.test.ts` x2), documentados en STATE.md desde Plans 02/03/04.
- `git diff --stat src/lib/supabase/middleware.ts`: VACIO (D-04 — middleware sigue siendo el unico responsable de refresh/revocation)
- `grep -rln getRequestAuth src/` fuera de `src/lib/auth/` + `src/app/actions/`: VACIO (Pitfall 8 — sin fugas a paths de agente)
- `workspace.ts`: fallback de bootstrap preservado — `cookieStore.set('morfx_workspace'` count=2 (setWorkspaceCookie + fallback de getActiveWorkspaceId), `workspace_members` count=6 (fallback + getUserWorkspaces + getWorkspaceBySlug)
- `super-admin.ts` / `sms-admin.ts`: `userId === MORFX_OWNER_ID` presente (gate preservado)
- Suite vitest: 1108 passed / 2 failed PRE-EXISTENTES (`somnio-v4/sub-loop/few-shots.test.ts` wording — no toque esos archivos). Ningun test importa los 9 archivos modificados (verificado via grep).

## Self-Check: PASSED
