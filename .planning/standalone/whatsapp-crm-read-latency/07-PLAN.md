---
phase: whatsapp-crm-read-latency
plan: 07
type: execute
wave: 4
depends_on: [01, 03, 06]
files_modified:
  - src/app/actions/pipelines.ts
  - src/app/actions/whatsapp.ts
  - src/app/actions/messages.ts
  - src/app/actions/godentist.ts
  - src/app/actions/client-activation.ts
autonomous: false
requirements: [L1]
must_haves:
  truths:
    - "Los 4 archivos sensibles (whatsapp, messages, godentist, client-activation) migran SOLO las Server Actions de UI a getRequestAuth() — verificando el caller de cada funcion (Pitfall 8)"
    - "Ninguna funcion invocada desde un path de agente/webhook/robot se migra (esos no usan la cookie de UI ni el request-auth context)"
    - "pipelines.ts migra su auth SIN perder el revalidateTag('ref:pipelines:...') agregado en Plan 03 (double-touch legitimo)"
    - "Tras este plan, grep -rc 'auth.getUser()' src/app/actions/ es 0 GLOBAL — deuda estructural cerrada en los 42 archivos"
    - "Toda mutacion sigue pasando por domain layer (Regla 3); el agente/robot en prod sigue funcionando identico (Regla 6)"
  artifacts:
    - path: "src/app/actions/whatsapp.ts"
      provides: "Server Actions de UI con 0 auth.getUser() (UI); paths de agente/webhook intactos"
      contains: "getRequestAuth"
    - path: "src/app/actions/pipelines.ts"
      provides: "0 auth.getUser(); conserva revalidateTag('ref:pipelines:...') de Plan 03"
      contains: "getRequestAuth"
  key_links:
    - from: "src/app/actions/pipelines.ts"
      to: "Plan 03 revalidateTag('ref:pipelines:...')"
      via: "double-touch preservado"
      pattern: "revalidateTag\\('ref:pipelines"
    - from: "src/app/actions/{whatsapp,messages,godentist,client-activation}.ts"
      to: "src/lib/auth/request-auth.ts"
      via: "SOLO Server Actions de UI (Pitfall 8)"
      pattern: "getRequestAuth"
---

<objective>
Ola 2 (barrido — grupo SENSIBLE, cierre del barrido global) — migrar los 5 archivos que requieren verificacion de caller explicita antes de migrar (Pitfall 8) o son double-touch con Plan 03. Separados del barrido masivo original (Warning 3 del checker) para tasks mas granulares con verificacion del caller.

Grupo (5 archivos):
- **whatsapp.ts / messages.ts / godentist.ts / client-activation.ts (Pitfall 8 + Regla 6):** pueden contener funciones invocadas desde paths de agente/webhook/robot (no UI). Esas funciones NO usan la cookie de UI ni el request-auth context y NO deben migrarse. SOLO migrar las Server Actions de UI, verificando el caller de cada funcion ANTES de tocarla.
- **pipelines.ts (double-touch con Plan 03):** Plan 03 ya le agrego `revalidateTag('ref:pipelines:'+workspaceId)`. Aqui se migra su auth en lineas distintas SIN borrar/mover ese revalidateTag. Por eso este plan depende de Plan 03.

Tras este plan, `grep -rc "auth.getUser()" src/app/actions/` debe ser 0 GLOBAL (el middleware NO esta bajo src/app/actions — sigue intacto, D-04). Este es el cierre del barrido: Plan 02 (5) + Plan 05 (9) + Plan 06 (23) + Plan 07 (5) = 42 archivos.

Purpose: cerrar la deuda estructural completa sin tocar runtime de agente/robot en prod (Regla 6). TypeScript + verificacion de caller son la red de seguridad (D-09, Pitfall 8); commits atomicos con typecheck en cada uno.

Output: 5 archivos sensibles migrados (solo UI), 0 auth.getUser() GLOBAL en src/app/actions/**.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md

<read_first>
- `.planning/standalone/whatsapp-crm-read-latency/RESEARCH.md` — Code Example 2 (patron drop-in), Pitfall 8 (NUNCA migrar paths de agente/webhook/robot — usan auth distinta sin cookie de UI).
- `src/lib/auth/request-auth.ts` (Plan 01).
- `.planning/standalone/whatsapp-crm-read-latency/06-SUMMARY.md` si existe (mismo patron drop-in del barrido seguro — replicar).
- `.planning/standalone/whatsapp-crm-read-latency/03-SUMMARY.md` si existe (que linea de pipelines.ts recibio el revalidateTag).
- `CLAUDE.md` Regla 3 (mutaciones via domain — solo migrar auth), Regla 6 (godentist.ts/whatsapp.ts/messages.ts/client-activation.ts tocan paths sensibles — el agente/robot en prod NO debe cambiar de comportamiento; solo el bloque de auth de las Server Actions de UI).
</read_first>

<interfaces>
Patron drop-in (idem Plan 02/06 Code Example 2):
```typescript
// ANTES
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return <not-authed>

// DESPUES (SOLO para Server Actions de UI — NUNCA para funciones de agente/webhook/robot)
const auth = await getRequestAuth()
if (!auth) return <not-authed>   // preservar el return exacto
const supabase = await createClient()
// usar auth.userId / auth.workspaceId / auth.email
```

Pitfall 8 — antes de migrar CADA funcion de whatsapp/messages/godentist/client-activation:
```
1. Buscar el caller: grep -rn "<nombreFuncion>" src/ (¿quien la invoca?)
2. Si el caller es UI (componente del dashboard, server action invocada desde el cliente) → MIGRAR.
3. Si el caller es un path de agente/webhook/robot/inngest (src/lib/agents/**, src/app/api/**, src/inngest/**) → NO MIGRAR esa funcion (deja su auth.getUser() o su resolucion de auth tal cual — usa contexto distinto sin cookie de UI).
4. Si una funcion tiene auth.getUser() pero NO es invocada desde UI, documentarla en el SUMMARY como "intencionalmente no migrada (path de agente/webhook)".
```

pipelines.ts: NO borrar ni mover el `revalidateTag('ref:pipelines:' + workspaceId)` agregado en Plan 03; solo cambiar el bloque getUser→getRequestAuth en las lineas del auth.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: pipelines.ts — migrar auth preservando el revalidateTag de Plan 03 (double-touch)</name>
  <files>src/app/actions/pipelines.ts</files>
  <action>
- Importar `getRequestAuth` de `@/lib/auth/request-auth`.
- Migrar TODAS las ocurrencias de `auth.getUser()` al patron drop-in (ver <interfaces>). Donde se leia la cookie morfx_workspace, usar `auth.workspaceId`.
- **CRITICO (double-touch con Plan 03):** NO tocar el `revalidateTag('ref:pipelines:'+workspaceId)` que Plan 03 agrego. Estan en lineas distintas al bloque de auth. Confirmar con `git diff` que ese revalidateTag sigue presente tras la migracion.
- Mutaciones (crear/editar pipeline o stage): solo migrar el bloque auth; domain layer + revalidatePath/revalidateTag intactos (Regla 3).

Commit atomico: `perf(whatsapp-crm-read-latency): migra pipelines.ts a getRequestAuth (conserva revalidateTag de Plan 03)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && echo -n "getUser: " && grep -c "auth.getUser()" src/app/actions/pipelines.ts && echo -n "revalidateTag: " && grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts</automated>
  </verify>
  <done>
    - `grep -c "auth.getUser()" src/app/actions/pipelines.ts` == 0
    - `grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts` >= 1 (no se perdio el de Plan 03)
    - tsc verde
  </done>
  <acceptance_criteria>
    - `grep -c "auth.getUser()" src/app/actions/pipelines.ts` == 0
    - `grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts` >= 1
    - `npx tsc --noEmit` verde
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: whatsapp.ts + messages.ts — SOLO Server Actions de UI (verificar caller, Pitfall 8)</name>
  <files>src/app/actions/whatsapp.ts, src/app/actions/messages.ts</files>
  <action>
**Pitfall 8 + Regla 6 — verificacion de caller OBLIGATORIA por funcion.** Estos archivos pueden contener funciones invocadas desde el webhook/agente (envio de WhatsApp, procesamiento inbound) ademas de Server Actions de UI.

Para CADA funcion con `auth.getUser()` en estos dos archivos:
1. `grep -rn "<nombreFuncion>" src/` para encontrar el caller.
2. Si el caller es UI (componente del dashboard / accion invocada desde el cliente) → migrar al patron drop-in.
3. Si el caller es un path de agente/webhook/inngest (`src/lib/agents/**`, `src/app/api/**`, `src/inngest/**`) → NO migrar; dejar su auth tal cual y documentar en el SUMMARY.
4. NO cambiar la logica de envio de WhatsApp ni de procesamiento inbound — solo el bloque de auth de las Server Actions de UI (Regla 6 — el agente en prod no debe cambiar de comportamiento).

Commits: `perf(whatsapp-crm-read-latency): migra Server Actions de UI de whatsapp.ts a getRequestAuth (Pitfall 8 — paths de agente intactos)` + idem para messages.ts.

Si tras la verificacion alguna funcion queda intencionalmente sin migrar, su `auth.getUser()` permanece — eso es esperado y se documenta. El verify de "0 getUser" abajo aplica SOLO si todas las funciones resultaron ser de UI; si quedan funciones de agente, el conteo esperado es el numero de funciones no-UI (documentarlo).
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in whatsapp messages; do echo -n "$f getUser restantes: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - Las Server Actions de UI de whatsapp.ts/messages.ts migradas a getRequestAuth
    - Funciones de agente/webhook (si las hay) NO migradas y documentadas en el SUMMARY
    - Logica de envio/inbound intacta (Regla 6)
    - tsc verde
  </done>
  <acceptance_criteria>
    - `npx tsc --noEmit` verde
    - `grep -c "getRequestAuth" src/app/actions/whatsapp.ts` >= 1 (al menos las UI migradas)
    - Cualquier `auth.getUser()` restante en whatsapp.ts/messages.ts esta justificado en el SUMMARY como path de agente/webhook (Pitfall 8)
    - `grep -rln "getRequestAuth" src/` → ningun match bajo src/lib/agents/** ni src/inngest/** ni src/app/api/** (Pitfall 8 — el helper de UI NO se filtro a paths de agente)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: godentist.ts + client-activation.ts — SOLO Server Actions de UI (verificar caller, Pitfall 8)</name>
  <files>src/app/actions/godentist.ts, src/app/actions/client-activation.ts</files>
  <action>
**Pitfall 8 + Regla 6 — verificacion de caller OBLIGATORIA por funcion.** godentist.ts toca el robot Railway / agente godentist; client-activation.ts toca el trigger de is_client (puede invocarse desde webhook/automation).

Para CADA funcion con `auth.getUser()`:
1. `grep -rn "<nombreFuncion>" src/` para encontrar el caller.
2. Caller UI → migrar al patron drop-in.
3. Caller de agente/robot/webhook/inngest/automation → NO migrar; documentar en el SUMMARY.
4. NO cambiar la logica del robot godentist ni del trigger de client-activation — solo el bloque de auth de las Server Actions de UI (Regla 6).

Commits: `perf(whatsapp-crm-read-latency): migra Server Actions de UI de godentist.ts a getRequestAuth (Pitfall 8)` + idem para client-activation.ts.

Mismo criterio que Task 2: el conteo "0 getUser" aplica solo a funciones de UI; funciones de agente/robot/webhook que queden sin migrar son esperadas y se documentan.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for f in godentist client-activation; do echo -n "$f getUser restantes: "; grep -c "auth.getUser()" src/app/actions/$f.ts; done</automated>
  </verify>
  <done>
    - Las Server Actions de UI de godentist.ts/client-activation.ts migradas
    - Funciones de robot/agente/webhook (si las hay) NO migradas y documentadas
    - Logica de robot/trigger intacta (Regla 6)
    - tsc verde
  </done>
  <acceptance_criteria>
    - `npx tsc --noEmit` verde
    - Cualquier `auth.getUser()` restante en godentist.ts/client-activation.ts esta justificado en el SUMMARY como path de robot/agente/webhook (Pitfall 8)
    - `grep -rln "getRequestAuth" src/` → ningun match bajo src/lib/agents/** ni src/inngest/** ni src/app/api/** (Pitfall 8)
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Barrido completo cerrado: los 42 archivos de src/app/actions/** migrados a getRequestAuth (Plan 02 hot-path 5 + Plan 05 helpers/workspace 9 + Plan 06 drop-in 23 + Plan 07 sensible 5). auth.getUser() reducido a 0 en todas las Server Actions de UI; las funciones de agente/webhook/robot que comparten archivo (Pitfall 8) quedaron intencionalmente sin migrar y documentadas. workspace.ts conserva su fallback de bootstrap (Warning 1). pipelines.ts conserva su revalidateTag (Plan 03). Deploy a main (Vercel prod).
  </what-built>
  <how-to-verify>
    1. Push a main + esperar deploy.
    2. **Bootstrap de workspace (Warning 1 — critico):** probar el flujo de PRIMER login / usuario sin cookie morfx_workspace (incognito o borrar la cookie). El dashboard DEBE resolver el workspace via el fallback (getActiveWorkspaceId hace lookup en workspace_members + setea la cookie). NO debe quedar en blanco ni dar "No autenticado".
    3. **Smoke amplio en prod:** navegar el dashboard tocando varias secciones que usan estas actions — CRM (contactos, pedidos, tareas, notas), WhatsApp (inbox, templates), automatizaciones, metricas, configuracion de agentes, integraciones (shopify/meta), godentist. Todo debe cargar normal (y mas rapido en general). Verificar especificamente que el cambio de conversacion (hot-path) se siente mas rapido.
    4. **Admin/owner:** si tienes acceso owner, confirmar que super-admin/sms-admin siguen gateados (no se relajo el check).
    5. **Agente/robot en prod (Regla 6):** confirmar que los agentes (somnio, godentist) y el robot godentist siguen respondiendo/operando normal — este barrido NO debe haber tocado runtime de agente (solo Server Actions de UI).
    6. **Sin errores de auth:** ningun "No autenticado" inesperado ni pantallas vacias donde antes habia datos.
  </how-to-verify>
  <resume-signal>Escribe "approved" si el dashboard completo funciona, el bootstrap de workspace en primer login resuelve, y el agente/robot en prod sigue normal; o describe el problema (seccion rota / error de auth / bootstrap roto / agente afectado).</resume-signal>
</task>

</tasks>

<verification>
- `grep -rc "auth.getUser()" src/app/actions/ | grep -v ":0"` → idealmente VACIO (0 global). Si quedan matches, deben ser EXCLUSIVAMENTE funciones de agente/webhook/robot documentadas en los SUMMARYs (Pitfall 8 — intencionalmente no migradas).
- `npx tsc --noEmit` verde (red de seguridad D-09)
- `git diff --stat src/lib/supabase/middleware.ts` vacio (D-04)
- `grep -c "revalidateTag('ref:pipelines" src/app/actions/pipelines.ts` >= 1 (Plan 03 preservado)
- workspace.ts: fallback de bootstrap preservado (Plan 05 / Warning 1)
- `grep -rln "getRequestAuth" src/` → solo bajo src/lib/auth/ + src/app/actions/** (Pitfall 8 — nunca paths de agente/webhook/robot)
- Suite existente verde: `npx vitest run`
- Checkpoint humano: dashboard completo OK + bootstrap de primer login OK + agente/robot en prod sin afectacion
</verification>

<success_criteria>
- 5 archivos sensibles migrados (solo Server Actions de UI; paths de agente/webhook/robot intactos — Pitfall 8, Regla 6)
- pipelines.ts conserva su invalidacion de cache (Plan 03)
- Barrido GLOBAL cerrado: 0 auth.getUser() en src/app/actions/** salvo funciones de agente documentadas
- Dashboard sin regresiones; bootstrap de workspace en primer login funciona; agente/robot en prod normal
</success_criteria>

<output>
Crear `.planning/standalone/whatsapp-crm-read-latency/07-SUMMARY.md`
</output>
</output>
