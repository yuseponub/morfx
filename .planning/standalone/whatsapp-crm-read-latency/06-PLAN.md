---
phase: whatsapp-crm-read-latency
plan: 06
type: execute
wave: 3
depends_on: [01]
files_modified:
  - src/app/actions/activity.ts
  - src/app/actions/agent-metrics.ts
  - src/app/actions/assignment.ts
  - src/app/actions/contacts.ts
  - src/app/actions/custom-fields.ts
  - src/app/actions/invitations.ts
  - src/app/actions/logistics-config.ts
  - src/app/actions/meta-onboarding.ts
  - src/app/actions/metricas-conversaciones-settings.ts
  - src/app/actions/metricas-conversaciones.ts
  - src/app/actions/notes.ts
  - src/app/actions/order-states.ts
  - src/app/actions/order-tracking.ts
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
autonomous: true
requirements: [L1]
must_haves:
  truths:
    - "Los 23 archivos drop-in SEGUROS de src/app/actions/** resuelven auth via getRequestAuth() — 0 auth.getUser() en cada uno"
    - "notes.ts y task-notes.ts preservan el fallback user.email → auth.email (display name)"
    - "Toda mutacion sigue pasando por domain layer (Regla 3) — solo cambia el bloque de auth"
    - "El comportamiento not-authed se preserva en cada call site"
    - "Este plan NO toca los 4 archivos sensibles (whatsapp/messages/godentist/client-activation) ni pipelines — esos van en Plan 07 (verificacion de caller por Pitfall 8 + double-touch con Plan 03)"
  artifacts:
    - path: "src/app/actions/contacts.ts"
      provides: "0 auth.getUser()"
      contains: "getRequestAuth"
    - path: "src/app/actions/notes.ts"
      provides: "0 auth.getUser(); user.email → auth.email"
      contains: "getRequestAuth"
  key_links:
    - from: "src/app/actions/* (23 files drop-in)"
      to: "src/lib/auth/request-auth.ts"
      via: "import getRequestAuth"
      pattern: "getRequestAuth"
---

<objective>
Ola 2 (barrido — grupo DROP-IN SEGURO) — migrar los 23 archivos de `src/app/actions/**` que son drop-in directo (no devuelven el user completo, no tienen logica de owner, no tienen fallback de bootstrap, no son invocados desde paths de agente/webhook), usando el patron establecido en Plan 02.

Este plan se separo del barrido masivo original (Warning 3 del checker) para NO mezclar drop-ins triviales con archivos sensibles. El grupo sensible (whatsapp/messages/godentist/client-activation + pipelines double-touch) se migra en Plan 07 con verificacion de caller explicita. workspace.ts salio a Plan 05 (refactor consciente — Warning 1).

Reconciliacion de conteo (42 archivos totales con auth.getUser en src/app/actions/):
- Plan 02 (hot-path): 5 (conversations, orders, products, tags, order-notes)
- Plan 05 (helpers especiales + workspace): 9 (agent-config, agent-content-editor, automations, comandos, sms, integrations, super-admin, sms-admin, workspace)
- Plan 06 (este — drop-in seguro): 23
- Plan 07 (sensible + pipelines): 5 (whatsapp, messages, godentist, client-activation, pipelines)
- Total: 5 + 9 + 23 + 5 = 42 ✓ (pipelines es double-touch: Plan 03 le agrega revalidateTag, Plan 07 le migra el auth)

Detalles a vigilar en este grupo:
- **notes.ts / task-notes.ts:** usan `user.email` para fallback de display name (igual que order-notes en Plan 02) → `auth.email`.

Purpose: cerrar la mayor parte de la deuda estructural con swaps de bajo riesgo. TypeScript es la red de seguridad (D-09); commits atomicos con typecheck en cada uno.

Output: 23 archivos migrados, 0 auth.getUser() en cada uno (el barrido GLOBAL a 0 se cierra en Plan 07).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Example 2 (patron drop-in), Migration Strategy Wave 2+, Pitfall 1/2.
- `src/lib/auth/request-auth.ts` (Plan 01).
- `.planning/standalone/whatsapp-crm-read-latency/02-SUMMARY.md` si existe (mismo patron aplicado al hot-path — replicar).
- `CLAUDE.md` Regla 3 (mutaciones via domain — solo migrar auth).
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
  <name>Task 2: Drop-in grupo B — templates/search/teams/invitations/assignment (5 archivos)</name>
  <files>src/app/actions/templates.ts, src/app/actions/search.ts, src/app/actions/assignment.ts, src/app/actions/teams.ts, src/app/actions/invitations.ts</files>
  <action>
Migrar al patron drop-in. Commit atomico por archivo, typecheck en cada uno.

- Todos drop-in directo (no devuelven user completo, no son paths de agente). Donde se leia la cookie morfx_workspace, usar `auth.workspaceId`.
- teams.ts / invitations.ts: pueden tener mutaciones (crear equipo, invitar) — solo migrar auth; domain + revalidatePath intactos (Regla 3). Si alguno compara role de membership, preservar esa query (no viene del JWT).

Verificar el return not-authed exacto de cada call site y preservarlo.
Commits: `perf(whatsapp-crm-read-latency): migra <archivo>.ts a getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in templates search assignment teams invitations; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - 0 auth.getUser() en los 5 archivos
    - role de membership (si aplica) preservado de la query, no del JWT
    - tsc verde
  </done>
  <acceptance_criteria>
    - Los 5 archivos: `grep -c "auth.getUser()"` == 0 cada uno
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Drop-in grupo C — metricas/onboarding/shopify/misc (8 archivos)</name>
  <files>src/app/actions/agent-metrics.ts, src/app/actions/logistics-config.ts, src/app/actions/meta-onboarding.ts, src/app/actions/metricas-conversaciones-settings.ts, src/app/actions/metricas-conversaciones.ts, src/app/actions/shopify-oauth.ts, src/app/actions/shopify.ts, src/app/actions/usage.ts</files>
  <action>
Migrar al patron drop-in. Commit atomico por archivo o subgrupo, typecheck en cada uno.

- shopify.ts / shopify-oauth.ts: drop-in, pero NO tocar logica OAuth ni credenciales (solo el bloque de auth de la Server Action). Estos son Server Actions de UI (el dashboard de configuracion) — NO los webhooks de Shopify (que viven fuera de src/app/actions). Verificar que ninguna funcion aqui sea invocada desde un webhook handler; si lo fuera, NO migrarla (dejarla para Plan 07). El audit indica que son acciones de UI.
- Resto (agent-metrics, logistics-config, meta-onboarding, metricas-*, usage): drop-in directo.
- Mutaciones: solo auth; domain/revalidatePath intactos (Regla 3).

Verificar el return not-authed exacto de cada call site y preservarlo.
Commits: `perf(whatsapp-crm-read-latency): migra <archivo>.ts a getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in agent-metrics logistics-config meta-onboarding metricas-conversaciones-settings metricas-conversaciones shopify-oauth shopify usage; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - 0 auth.getUser() en los 8 archivos del grupo C
    - logica OAuth / credenciales shopify intacta (solo auth migrado)
    - tsc verde
  </done>
  <acceptance_criteria>
    - Los 8 archivos: `grep -c "auth.getUser()"` == 0 cada uno
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `for f in contacts custom-fields notes tasks task-notes task-activity activity quick-replies order-states order-tracking templates search assignment teams invitations agent-metrics logistics-config meta-onboarding metricas-conversaciones-settings metricas-conversaciones shopify-oauth shopify usage; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos 0
- `npx tsc --noEmit` verde (red de seguridad D-09)
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- `grep -rln "getRequestAuth" src/` → solo bajo src/lib/auth/ + src/app/actions/** (Pitfall 8)
- Suite existente verde: `npx vitest run`
- NOTA: el barrido GLOBAL (0 auth.getUser() en TODO src/app/actions/) se confirma en Plan 07, que cierra los 5 archivos sensibles restantes.
</verification>

<success_criteria>
- 23 archivos drop-in seguros migrados, 0 auth.getUser() cada uno
- notes.ts/task-notes.ts conservan el fallback de display name (auth.email)
- Mutaciones via domain layer sin cambios
- NO se tocaron whatsapp/messages/godentist/client-activation/pipelines (Plan 07)
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/06-SUMMARY.md`
</output>
</output>
