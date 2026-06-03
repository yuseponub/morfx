---
phase: whatsapp-crm-read-latency
plan: 05
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - src/app/actions/agent-config.ts
  - src/app/actions/agent-content-editor.ts
  - src/app/actions/automations.ts
  - src/app/actions/comandos.ts
  - src/app/actions/sms.ts
  - src/app/actions/integrations.ts
  - src/app/actions/super-admin.ts
  - src/app/actions/sms-admin.ts
autonomous: true
requirements: [L1]
must_haves:
  truths:
    - "Los 5 getAuthContext duplicados restantes (agent-config, agent-content-editor, automations, comandos, sms) delegan a getRequestAuth() centralizado (D-03)"
    - "Los helpers que devolvian el objeto user completo se refactorizan para exponer userId (no naive-swap)"
    - "super-admin/sms-admin comparan userId === MORFX_OWNER_ID en vez de user.id"
    - "Ningun archivo de este grupo llama auth.getUser()"
    - "El contract de cada helper local se preserva para sus callers (incluido role de membership donde aplique)"
  artifacts:
    - path: "src/app/actions/integrations.ts"
      provides: "getAuthContext refactorizado a { supabase, userId, workspaceId, role }"
      contains: "getRequestAuth"
    - path: "src/app/actions/super-admin.ts"
      provides: "owner check via userId === MORFX_OWNER_ID"
      contains: "getRequestAuth"
  key_links:
    - from: "src/app/actions/agent-config.ts (getAuthContext)"
      to: "src/lib/auth/request-auth.ts"
      via: "delega"
      pattern: "getRequestAuth"
---

<objective>
Ola 2 (barrido — grupo de helpers especiales) — migrar los archivos de actions que NO son drop-in trivial porque tienen un `getAuthContext` duplicado (D-03) o devuelven el objeto `user` completo (requieren refactor, no swap ciego). Per RESEARCH Call-Site Audit (tabla "Whole-user-object returns").

Grupo (8 archivos):
- **getAuthContext duplicados restantes (D-03):** agent-config, agent-content-editor, automations, comandos, sms (el de orders.ts ya se hizo en Plan 02).
- **integrations.ts:** getAuthContext devuelve `{ supabase, user, workspaceId, role }` → refactor a `{ supabase, userId, workspaceId, role }` (role sigue de la query a workspace_members, NO del JWT).
- **super-admin.ts / sms-admin.ts:** devuelven el `user` y comparan `user.id === MORFX_OWNER_ID` → exponer `userId` y comparar `userId === MORFX_OWNER_ID`.

Purpose: completar la centralizacion D-03 y eliminar los helpers que devuelven el user completo, sin romper el contract de sus callers (TypeScript es la red — D-09).

Output: 8 archivos migrados, 0 auth.getUser() en cada uno, commits atomicos por archivo o subgrupo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Call-Site Audit tabla "Whole-`user`-object returns (helpers que deben refactorizarse, no naive-swapearse)" — tiene la migracion exacta por archivo (lineas agent-config:36, agent-content-editor:78, automations:102, comandos:112, sms:21, integrations:45, super-admin:17, sms-admin:19).
- `src/lib/auth/request-auth.ts` (Plan 01).
- `CLAUDE.md` Regla 3 (mutaciones via domain — solo migrar auth, no la logica).
</read_first>

<interfaces>
From src/lib/auth/request-auth.ts:
```typescript
export const getRequestAuth: () => Promise<{ userId: string; email: string|null; workspaceId: string } | null>
```

Migracion por archivo (RESEARCH Call-Site Audit verbatim):
| File | Hoy devuelve | Callers usan | Migracion |
| agent-config.ts:36 | { user, workspaceId, supabase } | user.id, workspaceId, supabase | → { userId, workspaceId, supabase }; actualizar user.id→userId |
| agent-content-editor.ts:78 | { user, workspaceId, supabase } | user.id, workspaceId, supabase | igual |
| automations.ts:102 | { supabase, user, workspaceId } | user.id (filtro L95), workspaceId | igual |
| comandos.ts:112 | { workspaceId } | workspaceId | drop-in |
| sms.ts:21 | { workspaceId } | workspaceId | drop-in |
| integrations.ts:45 | { supabase, user, workspaceId, role } | user.id (L38), role (membership) | → { supabase, userId, workspaceId, role }; role sigue de membership query |
| super-admin.ts:17 | user | user.id === MORFX_OWNER_ID | → userId; comparar userId === MORFX_OWNER_ID |
| sms-admin.ts:19 | user | user.id === MORFX_OWNER_ID | igual |

NOTA importante: los helpers que devuelven `supabase` deben SEGUIR devolviendo el cliente Supabase (los callers lo usan para queries). getRequestAuth NO devuelve supabase — el helper local hace `const supabase = await createClient()` ademas de `const auth = await getRequestAuth()`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: getAuthContext duplicados → delegar a getRequestAuth (agent-config, agent-content-editor, automations, comandos, sms)</name>
  <files>src/app/actions/agent-config.ts, src/app/actions/agent-content-editor.ts, src/app/actions/automations.ts, src/app/actions/comandos.ts, src/app/actions/sms.ts</files>
  <action>
Un commit atomico por archivo (typecheck en cada uno).

Para cada archivo, refactorizar su `getAuthContext` local segun la tabla de <interfaces>:

- **comandos.ts / sms.ts** (devuelven solo `{ workspaceId }`): drop-in.
  ```typescript
  async function getAuthContext() {
    const auth = await getRequestAuth()
    if (!auth) return { error: 'No autenticado' }  // o el shape de error actual del archivo
    return { workspaceId: auth.workspaceId }
  }
  ```
  Verificar el shape de retorno not-authed actual de cada uno y preservarlo.

- **agent-config.ts / agent-content-editor.ts / automations.ts** (devuelven `{ user, workspaceId, supabase }`): cambiar a `{ userId, workspaceId, supabase }`. El helper local hace AMBOS: `const supabase = await createClient()` + `const auth = await getRequestAuth()`.
  ```typescript
  async function getAuthContext() {
    const auth = await getRequestAuth()
    if (!auth) return { error: '...' }  // shape actual
    const supabase = await createClient()
    return { userId: auth.userId, workspaceId: auth.workspaceId, supabase }
  }
  ```
  Luego actualizar TODOS los callers que usaban `ctx.user.id` → `ctx.userId` (TypeScript marcara cada uno si se olvida). En automations.ts revisar el filtro de L95 (`user.id`) → `userId`.

- Mutaciones: solo migrar el helper de auth; la logica via domain layer / inngest queda intacta (Regla 3, Regla 6 — agent-config/automations tocan config de agentes en prod; NO cambiar su comportamiento, solo el auth resolution).

Commits: `perf(whatsapp-crm-read-latency): <archivo>.ts getAuthContext delega a getRequestAuth (D-03)` por archivo.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in agent-config agent-content-editor automations comandos sms; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - Los 5 getAuthContext delegan a getRequestAuth; 0 auth.getUser() en cada uno
    - Callers usan userId (no ctx.user.id)
    - tsc verde
  </done>
  <acceptance_criteria>
    - `for f in agent-config agent-content-editor automations comandos sms; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos 0
    - `grep -c "getRequestAuth" src/app/actions/agent-config.ts` >= 1
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: integrations.ts (role de membership) + super-admin.ts + sms-admin.ts (owner check)</name>
  <files>src/app/actions/integrations.ts, src/app/actions/super-admin.ts, src/app/actions/sms-admin.ts</files>
  <action>
Un commit por archivo (o un commit para los dos admin si son cortos).

- **integrations.ts (getAuthContext:45):** refactor a `{ supabase, userId, workspaceId, role }`. El `role` NO viene del JWT — viene de la query existente a `workspace_members` (membership.role). Mantener esa query. El helper hace `getRequestAuth()` + `createClient()` + la query de membership para el role. Actualizar callers de `ctx.user.id` (L38) → `ctx.userId`.

- **super-admin.ts (L17) / sms-admin.ts (L19):** estos helpers hoy devuelven el `user` y comparan `user.id === MORFX_OWNER_ID`. Migrar a:
  ```typescript
  const auth = await getRequestAuth()
  if (!auth) return { error: 'No autenticado' }  // shape actual
  if (auth.userId !== MORFX_OWNER_ID) return { error: '...' }  // misma logica
  ```
  Preservar EXACTAMENTE la semantica del owner check (es un gate de seguridad — no relajarlo). Mantener cualquier query/return adicional que el helper haga.

Commits: `perf(whatsapp-crm-read-latency): integrations.ts a getRequestAuth (role de membership preservado)` + `perf(whatsapp-crm-read-latency): super-admin/sms-admin owner check via getRequestAuth`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in integrations super-admin sms-admin; do echo -n "$f: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - integrations.ts expone userId + role (de membership) + supabase + workspaceId
    - super-admin/sms-admin comparan userId === MORFX_OWNER_ID
    - 0 auth.getUser() en los 3
    - tsc verde
  </done>
  <acceptance_criteria>
    - `for f in integrations super-admin sms-admin; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos 0
    - `grep -c "MORFX_OWNER_ID" src/app/actions/super-admin.ts` >= 1 (gate preservado)
    - `grep -n "userId.*MORFX_OWNER_ID\|MORFX_OWNER_ID.*userId" src/app/actions/super-admin.ts` retorna match
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `for f in agent-config agent-content-editor automations comandos sms integrations super-admin sms-admin; do grep -c "auth.getUser()" src/app/actions/$f.ts; done` → todos 0
- `npx tsc --noEmit` verde
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- `grep -rln "getRequestAuth" src/` → solo bajo src/lib/auth/ + src/app/actions/** (Pitfall 8)
- Suite existente verde: `npx vitest run`
</verification>

<success_criteria>
- 8 archivos del grupo de helpers especiales migrados, 0 auth.getUser()
- D-03 completa: todos los getAuthContext delegan al helper centralizado
- Owner checks (super-admin/sms-admin) y role de membership (integrations) preservados sin relajar seguridad
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/05-SUMMARY.md`
</output>
