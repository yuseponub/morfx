---
phase: whatsapp-crm-read-latency
plan: 06
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - src/app/actions/activity.ts
  - src/app/actions/agent-metrics.ts
  - src/app/actions/assignment.ts
  - src/app/actions/client-activation.ts
  - src/app/actions/contacts.ts
  - src/app/actions/custom-fields.ts
  - src/app/actions/godentist.ts
  - src/app/actions/invitations.ts
  - src/app/actions/logistics-config.ts
  - src/app/actions/messages.ts
  - src/app/actions/meta-onboarding.ts
  - src/app/actions/metricas-conversaciones-settings.ts
  - src/app/actions/metricas-conversaciones.ts
  - src/app/actions/notes.ts
  - src/app/actions/order-states.ts
  - src/app/actions/order-tracking.ts
  - src/app/actions/pipelines.ts
  - src/app/actions/quick-replies.ts
  - src/app/actions/search.ts
  - src/app/actions/shopify-oauth.ts
  - src/app/actions/shopify.ts
  - src/app/actions/task-activity.ts
  - src/app/actions/task-notes.ts
  - src/app/actions/tasks.ts
  - src/app/actions/teams.ts
  - src/app/actions/templates.ts
  - src/app/actions/usage.ts
  - src/app/actions/whatsapp.ts
  - src/app/actions/workspace.ts
autonomous: false
requirements: [L1]
must_haves:
  truths:
    - "Los 28 archivos restantes de src/app/actions/** resuelven auth via getRequestAuth() — 0 auth.getUser() en todo el directorio"
    - "notes.ts y task-notes.ts preservan el fallback user.email → auth.email (display name)"
    - "pipelines.ts migra su auth sin perder el revalidateTag('ref:pipelines:...') agregado en Plan 03"
    - "Toda mutacion sigue pasando por domain layer (Regla 3) — solo cambia el bloque de auth"
    - "El comportamiento not-authed se preserva en cada call site; ningun path de agente/webhook se migra por error (Pitfall 8)"
  artifacts:
    - path: "src/app/actions/contacts.ts"
      provides: "0 auth.getUser()"
      contains: "getRequestAuth"
    - path: "src/app/actions/notes.ts"
      provides: "0 auth.getUser(); user.email → auth.email"
      contains: "getRequestAuth"
  key_links:
    - from: "src/app/actions/* (28 files)"
      to: "src/lib/auth/request-auth.ts"
      via: "import getRequestAuth"
      pattern: "getRequestAuth"
---

<objective>
Ola 2 (barrido final — drop-in en masa) — migrar los 28 archivos restantes de `src/app/actions/**` que aun llaman `auth.getUser()`, usando el patron drop-in establecido en Plan 02. Tras este plan, `grep -rc "auth.getUser()" src/app/actions/` debe ser 0 en TODO el directorio (el middleware NO esta bajo src/app/actions — sigue intacto, D-04).

Estos son drop-in directos (no devuelven el user completo ni tienen logica de owner — esos fueron Plan 05). Detalles a vigilar:
- **notes.ts / task-notes.ts:** usan `user.email` para fallback de display name (igual que order-notes en Plan 02) → `auth.email`.
- **pipelines.ts:** ya recibio `revalidateTag('ref:pipelines:...')` en Plan 03; aqui se migra su auth SIN borrar/mover ese revalidateTag (lineas distintas). Por eso este plan depende de Plan 03.
- **whatsapp.ts / messages.ts / godentist.ts / client-activation.ts:** Regla 6 + Pitfall 8 — pueden tener funciones invocadas desde paths de agente/webhook (no UI). Migrar SOLO las Server Actions de UI; NO migrar funciones que un path de agente use con semantica de auth distinta. Verificar el caller de cada funcion antes de migrar.

Purpose: cerrar la deuda estructural completa — el patron auth-por-action redundante eliminado en los 41 archivos. TypeScript es la red de seguridad (D-09); commits atomicos con typecheck en cada uno.

Output: 28 archivos migrados, 0 auth.getUser() en todo src/app/actions/**.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Example 2 (patron drop-in), Migration Strategy Wave 2+, Pitfall 1/2/8.
- `src/lib/auth/request-auth.ts` (Plan 01).
- `.planning/standalone/whatsapp-crm-read-latency/02-SUMMARY.md` si existe (mismo patron aplicado al hot-path — replicar).
- `CLAUDE.md` Regla 3 (mutaciones via domain — solo migrar auth), Regla 6 (godentist.ts/whatsapp.ts/messages.ts/client-activation.ts tocan paths sensibles — NO cambiar logica, solo el bloque de auth de las Server Actions de UI).
</read_first>

<interfaces>
Patron drop-in (idem Plan 02 Code Example 2):
```typescript
// ANTES
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return <not-authed>
const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) return <not-authed>

// DESPUES
const auth = await getRequestAuth()
if (!auth) return <not-authed>   // preservar el return exacto
const supabase = await createClient()
// usar auth.userId / auth.workspaceId / auth.email
```

Casos con user.email (preservar fallback):
- notes.ts:131  → { id: auth.userId, email: auth.email || 'Usuario' }
- task-notes.ts:131 → idem

pipelines.ts: NO borrar ni mover el `revalidateTag('ref:pipelines:' + workspaceId)` agregado en Plan 03; solo cambiar el bloque getUser→getRequestAuth.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drop-in grupo A — CRM/contactos/tareas/notas (10 archivos)</name>
  <files>src/app/actions/contacts.ts, src/app/actions/custom-fields.ts, src/app/actions/notes.ts, src/app/actions/tasks.ts, src/app/actions/task-notes.ts, src/app/actions/task-activity.ts, src/app/actions/activity.ts, src/app/actions/quick-replies.ts, src/app/actions/order-states.ts, src/app/actions/order-tracking.ts</files>
  <action>
Migrar cada archivo al patron drop-in (ver <interfaces>). Commit atomico por archivo (o por 2-3 archivos pequeños relacionados), typecheck en cada commit.

- notes.ts / task-notes.ts: preservar el fallback `user.email` → `auth.email`.
- Resto: drop-in directo. Donde se leia la cookie morfx_workspace, usar `auth.workspaceId`.
- Mutaciones: solo migrar auth; domain layer + revalidatePath intactos (Regla 3).

Verificar el return not-authed exacto de cada call site y preservarlo.
Commits: `perf(whatsapp-crm-read-latency): migra <archivo>.ts a getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in contacts custom-fields notes tasks task-notes task-activity activity quick-replies order-states order-tracking; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - 0 auth.getUser() en los 10 archivos
    - notes.ts/task-notes.ts usan auth.email en el fallback
    - tsc verde
  </done>
  <acceptance_criteria>
    - Los 10 archivos: `grep -c "auth.getUser()"` == 0 cada uno
    - `grep -c "auth.email" src/app/actions/notes.ts` >= 1 y en task-notes.ts >= 1
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Drop-in grupo B — pipelines/whatsapp/messages/templates/teams (9 archivos, vigilar Pitfall 8)</name>
  <files>src/app/actions/pipelines.ts, src/app/actions/whatsapp.ts, src/app/actions/messages.ts, src/app/actions/templates.ts, src/app/actions/search.ts, src/app/actions/assignment.ts, src/app/actions/teams.ts, src/app/actions/invitations.ts, src/app/actions/workspace.ts</files>
  <action>
Migrar al patron drop-in. Commit atomico por archivo, typecheck en cada uno.

- pipelines.ts: migrar getUser→getRequestAuth en todas las funciones SIN tocar el `revalidateTag('ref:pipelines:'+workspaceId)` de Plan 03 (lineas distintas). Confirmar con git diff que el revalidateTag sigue presente.
- whatsapp.ts / messages.ts: Regla 6 + Pitfall 8 — SOLO migrar el bloque de auth de las Server Actions de UI; NO cambiar logica de envio/inbound ni migrar funciones invocadas desde paths de agente/webhook. Verificar el caller de cada funcion antes de migrar.
- workspace.ts: contiene getUserWorkspaces/getActiveWorkspaceId (consumidos por el layout). Drop-in con cuidado — preservar el contract exacto.
- Resto (templates, search, assignment, teams, invitations): drop-in directo.

Commits: `perf(whatsapp-crm-read-latency): migra <archivo>.ts a getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in pipelines whatsapp messages templates search assignment teams invitations workspace; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done && echo -n "pipelines revalidateTag: " && grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts</automated>
  </verify>
  <done>
    - 0 auth.getUser() en los 9 archivos
    - pipelines.ts conserva su revalidateTag('ref:pipelines:...')
    - whatsapp/messages: solo Server Actions de UI migradas; paths de agente intactos
    - tsc verde
  </done>
  <acceptance_criteria>
    - Los 9 archivos: `grep -c "auth.getUser()"` == 0 cada uno
    - `grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts` >= 1 (no se perdio el de Plan 03)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Drop-in grupo C — metricas/integraciones/onboarding/misc (9 archivos)</name>
  <files>src/app/actions/agent-metrics.ts, src/app/actions/client-activation.ts, src/app/actions/godentist.ts, src/app/actions/logistics-config.ts, src/app/actions/meta-onboarding.ts, src/app/actions/metricas-conversaciones-settings.ts, src/app/actions/metricas-conversaciones.ts, src/app/actions/shopify-oauth.ts, src/app/actions/shopify.ts, src/app/actions/usage.ts</files>
  <action>
Migrar al patron drop-in. Commit atomico por archivo o subgrupo, typecheck en cada uno.

- godentist.ts / client-activation.ts: Regla 6 + Pitfall 8 — pueden tener funciones tocadas por paths de agente/robot. SOLO migrar Server Actions de UI; verificar el caller de cada funcion antes de migrar. Si una funcion es de agente/webhook con auth distinta, NO migrarla.
- shopify.ts / shopify-oauth.ts: drop-in, pero NO tocar logica OAuth ni credenciales (solo el bloque de auth de la Server Action).
- Resto (agent-metrics, logistics-config, meta-onboarding, metricas-*, usage): drop-in directo.

Commits: `perf(whatsapp-crm-read-latency): migra <archivo>.ts a getRequestAuth`.

Nota: este grupo lista 10 archivos en <files> (agent-metrics, client-activation, godentist, logistics-config, meta-onboarding, metricas-conversaciones-settings, metricas-conversaciones, shopify-oauth, shopify, usage) — completar todos. Tras este task, `grep -rc "auth.getUser()" src/app/actions/` debe ser 0 global.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -rc "auth.getUser()" src/app/actions/ | grep -v ":0" || echo "GLOBAL 0 — todos migrados"</automated>
  </verify>
  <done>
    - 0 auth.getUser() en los archivos del grupo C
    - 0 auth.getUser() GLOBAL en src/app/actions/**
    - paths de agente/robot intactos (Regla 6, Pitfall 8)
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -rc "auth.getUser()" src/app/actions/ | grep -v ":0"` retorna VACIO (0 global)
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Barrido completo: los 41 archivos de src/app/actions/** migrados a getRequestAuth. 0 auth.getUser() global en el directorio. Deploy a main (Vercel prod).
  </what-built>
  <how-to-verify>
    1. Push a main + esperar deploy.
    2. **Smoke amplio en prod:** navegar el dashboard tocando varias secciones que usan estas actions — CRM (contactos, pedidos, tareas, notas), WhatsApp (inbox, templates), automatizaciones, metricas, configuracion de agentes, integraciones (shopify/meta), godentist. Todo debe cargar normal (y mas rapido en general).
    3. **Admin/owner:** si tienes acceso owner, confirmar que super-admin/sms-admin siguen gateados (no se relajo el check).
    4. **Agente en prod (Regla 6):** confirmar que los agentes (somnio, godentist, etc.) siguen respondiendo normal — este barrido NO debe haber tocado runtime de agente (solo Server Actions de UI).
    5. **Sin errores de auth:** ningun "No autenticado" inesperado ni pantallas vacias donde antes habia datos.
  </how-to-verify>
  <resume-signal>Escribe "approved" si todo el dashboard funciona y el agente en prod sigue normal, o describe el problema (seccion rota / error de auth / agente afectado).</resume-signal>
</task>

</tasks>

<verification>
- `grep -rc "auth.getUser()" src/app/actions/ | grep -v ":0"` → VACIO (0 global)
- `npx tsc --noEmit` verde (red de seguridad D-09)
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- `grep -rln "getRequestAuth" src/` → solo bajo src/lib/auth/ + src/app/actions/** (Pitfall 8 — nunca paths de agente/webhook)
- Suite existente verde: `npx vitest run`
- Checkpoint humano: dashboard completo OK + agente en prod sin afectacion
</verification>

<success_criteria>
- 0 auth.getUser() en TODO src/app/actions/** (deuda estructural cerrada)
- pipelines.ts conserva su invalidacion de cache (Plan 03)
- Paths de agente/robot/webhook intactos (Regla 6, Pitfall 8)
- Dashboard sin regresiones; agente en prod normal
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/06-SUMMARY.md`
</output>
