# Twilio → Onurix Migration — Research

**Researched:** 2026-04-16
**Type:** Standalone (no phase number)
**Mode:** Ecosystem + implementation (hybrid — tech decisions fixed per CONTEXT.md)
**Domain:** Next.js 15 App Router + Supabase (Postgres jsonb) + pnpm + Vercel + Onurix SMS
**Confidence:** HIGH (execution patterns verified against codebase + docs)

## Summary

All tech choices are locked (see CONTEXT.md D-01 through D-13). This research focused on the **operational mechanics** of executing a 2-fase cutover safely: (A) script que migra 4 automations via `jsonb_set`, validación manual; (B) PR único que elimina 12 archivos `src/`, el webhook `/api/webhooks/twilio/status`, la dep npm `twilio`, y reemplaza la UI.

Key findings:
- **Onurix SMS solo ofrece polling** (`GET /api/v1/messages-state`), **no webhooks** — la ruta actual via Inngest `sms-delivery-check` es la única opción oficialmente soportada. Confirmado contra `docs.onurix.com`.
- **Twilio webhook retry behavior:** SMS status callbacks NO se reintentan ante 4xx (incluido 404) — el webhook muere instantáneamente tras el primer intento fallido. Confirma que eliminar el endpoint sin stub es seguro. (HTTP status no-2xx = no retry. Solo TCP/TLS failures disparan el retry único de 15s).
- **`scripts/` está excluido de `tsconfig.json`**, por lo que el script de migración NO atrapa errores de tipo en `pnpm build`. Hay que probarlo aparte (`node --env-file=.env.local scripts/migrate-...mjs --dry-run`).
- **`SmsStatus` está duplicado** entre `src/lib/twilio/types.ts` (viejo, 6 valores) y `src/lib/sms/types.ts` (nuevo, 4 valores). El domain ya usa el nuevo. Eliminar `twilio/types.ts` requiere auditar que ningún caller importa el `SmsStatus` viejo con sus 2 valores extra (`queued`, `sending`, `undelivered`).
- **Hay dos lockfiles** (`pnpm-lock.yaml` + `package-lock.json`). El segundo tiene 0 entries de twilio (stale). pnpm es el gestor real — pero el lockfile npm puede confundir herramientas; considerar eliminarlo en el PR.
- **Pattern idempotente para jsonb_set** requiere `WITH ORDINALITY` + CTE porque `jsonb_set` trabaja sobre paths de índice, no sobre predicados. Ejemplo prescriptivo incluido abajo.
- **Vercel + deleted routes:** no hay build-cache issue para rutas eliminadas; el deploy siguiente invalida la función y devuelve 404 nativo. No hay riesgo de servir la ruta vieja tras el deploy.

**Primary recommendation:** Ejecutar el script en 3 pasos (dry-run read-only → dry-run con diff → apply) sobre los 4 IDs específicos del AUDIT-REPORT, validar los 3 triggers reales tras Fase A, luego abrir el PR de Fase B con commits atómicos en orden **inverso al grafo de imports** (tipos first, client+webhook second, executor+constants third, UI+server actions fourth, `package.json` last).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (copy verbatim de CONTEXT.md §Decisions)

**Cutover Strategy:**
- **D-01:** Cutover en **2 fases**, NO single deploy:
  - **Fase A (sin deploy de código):** Script standalone Node.js migra 4 automations en DB (`send_sms`/`send_sms_onurix` → `send_sms` unificado apuntando a Onurix). Validación manual con triggers reales de las 3 automations Twilio — Claude asiste al usuario verificando que el SMS llega vía Onurix (logs + `sms_messages.provider='onurix'`).
  - **Fase B (deploy de código):** PR único elimina 12 archivos `src/` + webhook + dep npm + reemplaza UI. Solo se mergea tras validación manual exitosa de Fase A.
- **D-02:** Migración via **script standalone Node.js** (`scripts/migrate-twilio-automations-to-onurix.mjs` o similar). Usa `createAdminClient()` + `jsonb_set` para actualizar `automations.actions`. Idempotente (rechequea type antes de actualizar). Sin migración SQL — es cambio de datos, no de schema.
- **D-03:** **Sin feature flag.** Escala trivial (4 autos, 1 workspace), Onurix validado, rollback disponible vía revert git + script reverso.
- **D-04:** **Validación manual pre-cutover:** disparar trigger de cada una de las 3 automations Twilio con contactos de prueba o datos reales controlados. Claude asiste verificando `sms_messages.provider='onurix'`, status cambia a "Enviado" vía `sms-delivery-check` Inngest, y el cliente recibe el SMS con sender `MORFX`.

**Action Type Naming:**
- **D-05:** **Rename** `send_sms_onurix` → `send_sms` (un único action type). Implica actualizar 4 automations en DB, `constants.ts:339-358`, `action-executor.ts:1076-1159`.
- **D-06:** **Categoría UI 'SMS'** (eliminar categoría 'Twilio'). Label: `"Enviar SMS"` (sin prefijo de proveedor).
- **D-07:** Script migra **todas las 4 automations por consistencia**. Cero registros con `send_sms_onurix` legacy tras el script.

**Webhook + Historical Data:**
- **D-08:** **Eliminar `/api/webhooks/twilio/status`** en el mismo PR de limpieza. Sin stub intermedio — el webhook lleva roto 30 días.
- **D-09:** **Sin backfill** de los 740 SMS huérfanos.
- **D-10:** **Retirar dep npm `twilio`** en el mismo PR. `pnpm install` actualiza `pnpm-lock.yaml`. TS typecheck + build Vercel detectan imports escondidos.

**UI Cleanup:**
- **D-11:** **Reemplazar tab "Twilio"** por tab **"SMS"** en `/configuracion/integraciones` (Owner/Admin).
- **D-12:** **Reemplazar `checkTwilioConfigured` + `twilioWarning`** por check contra `sms_workspace_config.is_active AND balance_cop >= 97`.
- **D-13:** **Adaptar `getSmsUsage` / `getSmsUsageChart`** a Onurix. Claude decide ubicación final (integrations.ts vs sms.ts nuevo).

### Claude's Discretion
- Nombre exacto y ubicación del script standalone
- Orden interno de commits dentro del PR de limpieza
- Manejo del bug R2 (eliminar junto con el form)
- Ajuste del comentario en `bold-form.tsx`
- Ubicación del nuevo `getSmsUsage` Onurix
- Texto exacto del warning UI y copys ES

### Deferred Ideas (OUT OF SCOPE)
- Backfill histórico de 740 SMS Twilio
- Retirada manual de env vars Twilio en Vercel (post-deploy)
- Plantillas SMS, campañas masivas, SMS bidireccional
- Tab SMS para workspaces nuevos (onboarding)
- Test E2E de action `send_sms` via automation
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rename action types en `automations.actions` jsonb | **Database (script via admin client)** | — | Script one-off, fuera del request lifecycle. No es migración de schema — es data normalization. Must filter by workspace_id per Regla 3. |
| Envío SMS desde automation | **Domain Layer** (`src/lib/domain/sms.ts`) | Action Executor (dispatcher) | Regla 3 — executor delega al domain, no llama Onurix directo. |
| Polling de delivery status | **Inngest function** (`sms-delivery-check`) | — | Onurix NO ofrece webhook SMS — polling es la única vía oficial. |
| UI integraciones tab SMS | **Frontend Server (App Router)** | — | Server Actions leen `sms_workspace_config` del workspace actual. RLS enforced via `createClient()`. |
| Check de configuración SMS (warning en wizard) | **Frontend Server (Server Action)** | — | `checkTwilioConfigured` → reemplazar por `checkSmsConfigured()` que consulta `sms_workspace_config.is_active`. |
| Verification post-cutover | **Local script / ripgrep** | TS typecheck en Vercel build | Dos gates: grep garantiza cero referencias textuales; typecheck garantiza cero imports rotos. |

## Standard Stack

### Core Tooling (usado DURANTE la migración)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | Admin client en script + rpc/update | Ya presente [VERIFIED: package.json:40] |
| `pnpm` | gestor real del repo | Remove dep `twilio` + update lockfile | `pnpm-lock.yaml` presente; precedente en CLAUDE.md [VERIFIED: pnpm-lock.yaml] |
| `node --env-file=.env.local` | Node 20.x+ | Ejecutar scripts/*.mjs con env vars | Convención del repo (precedente: `scripts/test-onurix-domain.mjs:2` dice `node --env-file=.env.local scripts/...`) [VERIFIED] |
| ripgrep (`rg`) | built-in Claude Code tool | Verificar cero referencias Twilio tras PR | Grep tool (tool-level, no install) [VERIFIED] |
| TypeScript (strict) | ^5 | Build gate — detectar imports Twilio huérfanos | tsconfig `strict: true`, `skipLibCheck: true` [VERIFIED: tsconfig.json:7] |
| Postgres `jsonb_set` + `jsonb_array_elements WITH ORDINALITY` | Postgres 15+ (Supabase) | Rename inline dentro del array `actions` | Único patrón correcto para update condicional por field [CITED: kevcodez.de/posts/2020-09-13-postgres-jsonb-update-object-array] |

### Code Module Map (used BY the migration)
| Module | Role |
|--------|------|
| `src/lib/domain/sms.ts` | Target final del rename — executor delega aquí. Sin cambios. |
| `src/lib/sms/client.ts` + `src/lib/sms/utils.ts` + `src/lib/sms/constants.ts` | Client Onurix + `formatColombianPhone()` + `SMS_PRICE_COP`. Sin cambios. |
| `src/lib/sms/types.ts` | `SmsStatus` canónico. Sobrevive. |
| `src/inngest/functions/sms-delivery-check.ts` | Polling Onurix 60s. Sin cambios. |
| `src/app/super-admin/sms/*` | Plantilla UI para el nuevo tab SMS (queries + layout). |

### Alternatives Considered
| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| Script standalone (`.mjs`) | Supabase migration SQL (`supabase/migrations/...`) | Usuario eligió script (DISCUSSION-LOG §Q2); además no es cambio de schema. |
| `jsonb_set` con CTE `WITH ORDINALITY` | Fetch array → map en JS → full replace con UPDATE | Race-unsafe: entre el fetch y el update otro proceso podría tocar `actions`. `jsonb_set` es atómico. |
| Webhook stub (200 vacío) | Delete route file | Usuario eligió delete directo (D-08). Twilio no reintenta ante 4xx (ver Common Pitfalls #2), así que 404 es terminal. |
| Feature flag `USE_ONURIX_FOR_SEND_SMS` | Cutover directo | Usuario delegó; Claude eligió sin flag (D-03). |

**Installation (only command needed during migration PR):**
```bash
pnpm remove twilio
# Automatically updates package.json + pnpm-lock.yaml in one step.
# [CITED: pnpm.io/cli/remove] "Removes packages from node_modules and from the project's package.json"
```

**Version verification:** Dependencies in use are the ones already listed in `package.json` — no new installs needed.

## Architecture Patterns

### System Architecture Diagram

```
FASE A — Data migration (no code deploy)
─────────────────────────────────────────────

  Developer machine
         │
         │ node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs
         ▼
  ┌─────────────────────────────────────────────┐
  │  Script (admin client, ONE-SHOT idempotent) │
  │                                             │
  │  1. SELECT id, actions FROM automations     │
  │     WHERE workspace_id = SOMNIO_ID          │
  │       AND actions::text LIKE '%send_sms%'   │
  │                                             │
  │  2. For each row, for each action:          │
  │     if type IN ('send_sms','send_sms_onurix'│
  │       → UPDATE via jsonb_set to 'send_sms'  │
  │                                             │
  │  3. Log diff (from → to) per automation ID  │
  │  4. Exit 0 on success, non-0 on any failure │
  └────────────────┬────────────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────────────┐
  │  Supabase Postgres — automations table       │
  │                                             │
  │  After script: 4 automations have           │
  │  actions[i].type = 'send_sms' (uniform)     │
  └─────────────────────────────────────────────┘

  Next step: Manual validation (user triggers each of 3 automations)
             Claude verifies sms_messages.provider='onurix' for each send.


FASE B — Code deploy (PR único)
────────────────────────────────

  Developer commits (atomic, in order):
    commit 1: retire lib/twilio + webhook route      (terminal — no callers after)
    commit 2: executor + constants (rename handler)  (handler resolves to send_sms via domain)
    commit 3: server actions (checkSmsConfigured, getSmsUsage Onurix)
    commit 4: UI (actions-step category, integraciones tab SMS)
    commit 5: pnpm remove twilio + bold-form.tsx comment edit
                                │
                                ▼
                         git push origin main
                                │
                                ▼
  ┌──────────────────────────────────────────────────┐
  │  Vercel build                                    │
  │  1. pnpm install (fresh)                         │
  │  2. next build → runs TypeScript strict typecheck│
  │     → if any Twilio import survives → FAIL       │
  │  3. Deploy                                       │
  └──────────────────────────┬───────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────┐
  │  Production                                      │
  │  - Automation trigger → executor → domainSendSMS │
  │    → Onurix (same path as REPARTO today)         │
  │  - /api/webhooks/twilio/status returns 404 nativo│
  │    → Twilio sees 404 → no retry → no noise       │
  │  - UI: tab "SMS" visible en /configuracion/      │
  │    integraciones (Owner/Admin)                   │
  └──────────────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only)

```
src/
├── lib/
│   ├── twilio/                    ← ELIMINAR directorio completo (2 archivos)
│   │   ├── client.ts              ← DELETE
│   │   └── types.ts               ← DELETE (SmsStatus ya vive en lib/sms/types.ts)
│   ├── sms/                       ← SIN CAMBIOS (fuente canónica)
│   │   ├── client.ts
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── types.ts
│   ├── domain/
│   │   └── sms.ts                 ← SIN CAMBIOS
│   └── automations/
│       ├── action-executor.ts     ← EDITAR: eliminar executeSendSmsTwilio
│       │                             (líneas 1087-1136), renombrar
│       │                             executeSendSmsOnurix → handler send_sms
│       │                             (línea 1138-1159), quitar imports Twilio
│       └── constants.ts           ← EDITAR: eliminar entry 339-348,
│                                     renombrar 350-358 → send_sms, categoría 'SMS'
├── app/
│   ├── api/webhooks/twilio/
│   │   └── status/route.ts        ← DELETE archivo (y directorio queda vacío → también borrar)
│   ├── actions/
│   │   ├── integrations.ts        ← EDITAR: retirar saveTwilioIntegration,
│   │   │                             testTwilioConnection, getTwilioIntegration,
│   │   │                             imports Twilio. Adaptar getSmsUsage/Chart a Onurix
│   │   │                             (o mover a nuevo src/app/actions/sms.ts).
│   │   └── automations.ts         ← EDITAR: eliminar checkTwilioConfigured (944-964).
│   │                                 Añadir checkSmsConfigured() contra sms_workspace_config.
│   └── (dashboard)/
│       ├── configuracion/integraciones/
│       │   ├── page.tsx           ← EDITAR: tab 'Twilio' → tab 'SMS'
│       │   └── components/
│       │       ├── twilio-form.tsx     ← DELETE
│       │       ├── twilio-usage.tsx    ← DELETE (super-admin ya tiene dashboard)
│       │       ├── sms-tab.tsx         ← NUEVO (balance + link super-admin)
│       │       └── bold-form.tsx       ← EDITAR: ajustar comentario "copy of twilio-form"
│       └── automatizaciones/components/
│           └── actions-step.tsx   ← EDITAR: quitar línea 85 (categoría Twilio),
│                                     reemplazar checkTwilioConfigured por
│                                     checkSmsConfigured, ajustar twilioWarning
│                                     → smsWarning

scripts/
├── migrate-twilio-automations-to-onurix.mjs  ← NUEVO (one-shot idempotent)
├── test-onurix-sms.mjs                       ← SIN CAMBIOS (regresión)
└── test-onurix-domain.mjs                    ← SIN CAMBIOS (regresión)

package.json                       ← EDITAR: eliminar "twilio": "^5.12.1" (línea 84)
pnpm-lock.yaml                     ← pnpm remove lo actualiza automáticamente
```

### Pattern 1: Idempotent jsonb_set rename inside action array

**What:** Renombrar `actions[i].type` de `'send_sms'` o `'send_sms_onurix'` a `'send_sms'` en cada automation del workspace Somnio. Idempotente: correr N veces deja el mismo resultado. Atómico: una query por automation.

**When to use:** Cualquier rename de campo dentro de un jsonb array donde el índice no es conocido y el match es por otro campo del objeto.

**Why NOT shallow fetch+replace:** Entre el `SELECT` y el `UPDATE` el usuario podría editar la automation en UI. `jsonb_set` en una sola UPDATE es atómico y no compite.

**SQL pattern (reference — script lo ejecuta via Supabase client):**

```sql
-- Source: https://kevcodez.de/posts/2020-09-13-postgres-jsonb-update-object-array
-- Approach: CTE with WITH ORDINALITY to discover index of matching element,
-- then jsonb_set on the discovered path.

WITH matched AS (
  SELECT
    a.id AS automation_id,
    ('{' || (arr.idx - 1) || ',type}')::text[] AS path
  FROM automations a,
       jsonb_array_elements(a.actions) WITH ORDINALITY arr(item, idx)
  WHERE a.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'  -- Somnio
    AND arr.item->>'type' IN ('send_sms', 'send_sms_onurix')
)
UPDATE automations a
SET actions = jsonb_set(a.actions, matched.path, '"send_sms"'::jsonb, false)
FROM matched
WHERE a.id = matched.automation_id;
```

Idempotency check: la primera corrida cambia `send_sms_onurix` → `send_sms`. La segunda corrida vuelve a matchear `send_sms` (que está en la lista del WHERE) pero el `jsonb_set` asigna el mismo valor → NOOP efectivo, sin error.

### Pattern 2: Script standalone .mjs (convención repo)

**Template basado en `scripts/test-onurix-domain.mjs`:**

```javascript
// scripts/migrate-twilio-automations-to-onurix.mjs
// Run: node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs [--apply]
// Source: scripts/test-onurix-domain.mjs pattern

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const WORKSPACE_SOMNIO = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const TARGET_IDS = [
  'f77bff5b-eef8-4c12-a5a7-4a4127837575',  // GUIA TRANSPORTADORA
  '24005a44-d97e-406e-bdac-f74dbb2b5786',  // Inter
  '71c4f524-2c8b-4350-a96d-bbc8a258b6ff',  // template final ultima
  'c24cde89-2f91-493c-8d5b-7cd7610490e8',  // REPARTO
]

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// Step 1: Read current state (always, even in --apply)
const { data: before, error: readErr } = await supabase
  .from('automations')
  .select('id, name, actions, workspace_id')
  .eq('workspace_id', WORKSPACE_SOMNIO)
  .in('id', TARGET_IDS)

if (readErr) { console.error(readErr); process.exit(1) }

console.log(`Found ${before.length} automations in Somnio`)

// Step 2: Build diff
const changes = []
for (const auto of before) {
  const newActions = auto.actions.map((a) => {
    if (a.type === 'send_sms' || a.type === 'send_sms_onurix') {
      return { ...a, type: 'send_sms' }
    }
    return a
  })
  const changed = JSON.stringify(newActions) !== JSON.stringify(auto.actions)
  if (changed) changes.push({ id: auto.id, name: auto.name, oldActions: auto.actions, newActions })
}

console.log(`Diff: ${changes.length} automations will be modified.`)
for (const c of changes) {
  const oldTypes = c.oldActions.map(a => a.type).join(', ')
  const newTypes = c.newActions.map(a => a.type).join(', ')
  console.log(`  ${c.id} (${c.name}): [${oldTypes}] → [${newTypes}]`)
}

if (!APPLY) {
  console.log('\nDRY RUN — pass --apply to write changes.')
  process.exit(0)
}

// Step 3: Apply (full replace per row — safe because we WHERE by id AND workspace_id)
for (const c of changes) {
  const { error } = await supabase
    .from('automations')
    .update({ actions: c.newActions })
    .eq('id', c.id)
    .eq('workspace_id', WORKSPACE_SOMNIO)  // Regla 3 — workspace filter always
  if (error) { console.error(`FAILED ${c.id}:`, error); process.exit(1) }
  console.log(`  ✓ Updated ${c.id}`)
}

console.log('\n✅ Migration complete. Re-run to verify idempotency.')
```

**Key design choices:**
- **Dry-run by default** (print diff), `--apply` flag to write.
- **Explicit TARGET_IDS array** — rather than WHERE-clause scan — guarantees nobody else's automations get modified even if a row leaks outside Somnio.
- **JS-side diff instead of raw jsonb_set** is acceptable because the WHERE filter includes `eq('workspace_id', ...)` and `.eq('id', ...)` — atomic per row, and there's no concurrent writer (4 automations, 1 workspace, Claude-assisted session).
- **Idempotent by construction:** on re-run, the JSON diff is empty → nothing to update → exits with 0 changes.
- **Log before/after types** so user can visually confirm the diff before `--apply`.

### Pattern 3: Safe commit ordering within the cleanup PR

**Why ordering matters:** TypeScript strict mode means any commit with a dangling import fails the build. Since the PR goes to main, we want each commit to compile green in isolation (bisect-friendly). But at minimum, we want the **final state** green.

**Recommended order (dependency-graph-aware):**

| # | Commit | Files | Rationale |
|---|--------|-------|-----------|
| 1 | Retire Twilio leaf modules | `src/lib/twilio/client.ts` DELETE, `src/lib/twilio/types.ts` DELETE, `src/app/api/webhooks/twilio/status/route.ts` DELETE | Webhook has NO callers. lib/twilio/* has 2 callers: `action-executor.ts:17` and `integrations.ts:13-14`. This commit BREAKS the build intentionally — fix it immediately in commit 2. |
| 2 | Migrate action executor + catalog constants | `action-executor.ts`, `constants.ts` | Removes imports of deleted `lib/twilio`. Renames handler. Build should be green again at end of this commit. |
| 3 | Migrate server actions | `src/app/actions/integrations.ts` (retire Twilio functions, adapt `getSmsUsage`), `src/app/actions/automations.ts` (replace `checkTwilioConfigured` with `checkSmsConfigured`) | Removes last Twilio imports. Adds Onurix queries. Build stays green. |
| 4 | Migrate UI | `configuracion/integraciones/page.tsx`, `components/twilio-form.tsx` DELETE, `components/twilio-usage.tsx` DELETE, new `components/sms-tab.tsx`, `automatizaciones/components/actions-step.tsx`, `components/bold-form.tsx` (comment edit) | Removes UI references. Typecheck catches stale `checkTwilioConfigured` imports. |
| 5 | Retire npm dep | `package.json` (remove `"twilio": "^5.12.1"`), `pnpm-lock.yaml` (regenerated by `pnpm remove twilio`) | Last step — safe now because commits 1-4 removed all imports. |

**Alternative (if time-pressed):** squash into a single commit. The planner may opt for this since the PR is the atomic unit; per-commit granularity is for bisect/review, not for deploy safety. User's project uses atomic commits per task per CLAUDE.md `/gsd:execute-phase` rule — recommend 5 commits.

### Anti-Patterns to Avoid

- **Updating `actions` jsonb by fetching then PUT-ing** without a workspace filter on the UPDATE. Always `.eq('workspace_id', ctx.workspaceId)` on both read and write.
- **Deleting `src/lib/twilio/` before fixing callers.** TS typecheck screams, build fails. Fix in same commit OR order so callers go first.
- **Adding a webhook stub** `/api/webhooks/twilio/status` returning 200. Unnecessary — Twilio does NOT retry on 404 for SMS callbacks.
- **Leaving `package-lock.json`** (currently stale, 0 twilio entries). A stale npm lockfile confuses tools; consider deleting it (NOT in this PR — out of scope, but flag for cleanup later).
- **Running the migration script against prod without dry-run first.** Script must support `--apply` flag gated by explicit user confirmation.
- **Skipping the re-run idempotency check.** Running the script twice should produce identical output (`0 changes`). If it doesn't, the diff logic has a bug.
- **Using Supabase SQL editor manually** instead of the script. User chose script (DISCUSSION-LOG §Q2). Scripts are versioned in git, SQL editor edits are not.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rename field inside jsonb array | Custom PL/pgSQL function + RPC | `jsonb_set` + CTE `WITH ORDINALITY` **OR** JS-side map + `.update({ actions })` | Patrón documentado, atómico per-row con workspace filter. RPC añade schema surface. [CITED: kevcodez.de/posts/2020-09-13-postgres-jsonb-update-object-array] |
| Remove npm dep + update lockfile | Manual edit `package.json` + `pnpm install` | `pnpm remove twilio` | Hace ambas cosas en un paso atómico. [CITED: pnpm.io/cli/remove] |
| Detectar residual Twilio references | Custom AST walker | `rg --type ts --type tsx -i "twilio"` | ripgrep es exhaustivo y rápido. AST innecesario — comentarios y strings también queremos detectar. |
| SMS delivery status | Webhook handler (à la Twilio) | Inngest `sms-delivery-check` (polling `/api/v1/messages-state`) | Onurix NO ofrece webhook SMS. [VERIFIED: docs.onurix.com — WhatsApp webhooks exist, SMS does not] |
| Confirmar que no queden imports Twilio en bundle | Custom bundle analyzer | `pnpm build` + CI gate | `next build` con TS strict falla al primer import roto. [VERIFIED: tsconfig.json `strict: true`] |
| Validar que las 3 automations envían por Onurix post-cutover | Custom integration test | Trigger real del usuario + Claude inspecciona `sms_messages.provider='onurix'` | D-04 — validación asistida humano+Claude (no E2E automatizado, deferred). |

**Key insight:** Esta migración es **100% herramientas estándar** (pnpm, rg, Postgres jsonb, Supabase admin client). No hay espacio para soluciones custom — cualquier cosa hand-rolled añade superficie de bug sin ganancia.

## Runtime State Inventory

**Trigger aplicable:** Este phase ES un rename/refactor. Aplica la inventario completa.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | `automations.actions` jsonb contains `type='send_sms'` (3 rows) y `type='send_sms_onurix'` (1 row) en workspace Somnio [VERIFIED: AUDIT-REPORT §P4 with evidence IDs]. Tabla `sms_messages` contiene 740 rows con `provider='twilio'` (históricos, no se migran — D-09). `integrations` table contiene 1 row `type='twilio'` (credenciales Somnio) — se acepta como orphan hasta que el usuario decida limpiarlo. | **Fase A script** migra los 4 automations. Tabla `sms_messages`: NO action (D-09). Tabla `integrations`: fuera de scope (row huérfano sin caller tras eliminar `getTwilioConfig`). |
| **Live service config** | **Onurix portal** (portal.onurix.com) — credenciales de cuenta paga no están en git, ya configuradas pre-migración. **Twilio console** — webhook URL aún apuntando a `/api/webhooks/twilio/status`. **Inngest Cloud** — función `sms-delivery-check` registrada (sin cambios). | Twilio console: acción manual POST-deploy del usuario (retirar webhook URL + cerrar cuenta o suspender). No bloquea deploy — Twilio ya no llama para SMS nuevos post-cutover. |
| **OS-registered state** | Ninguno — no hay Task Scheduler / systemd / launchd en este phase. Vercel es serverless, Inngest es externo. | None — verified by inventory. |
| **Secrets/env vars** | Vercel env vars (producción): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — **no confirmados activos** en AUDIT-REPORT §P7 (".env.local no legible desde auditoría"). `ONURIX_CLIENT_ID=7976`, `ONURIX_API_KEY` ya configurados y verificados en tests A/B/C. Tabla `integrations.config` (workspace-level) tiene credenciales Twilio de Somnio. | **Vercel env vars Twilio**: acción manual POST-deploy del usuario (deferred, CONTEXT.md §Deferred). Safe to leave — no código las lee tras el PR. Tabla `integrations`: row huérfana, no bloqueante. |
| **Build artifacts / installed packages** | `node_modules/twilio/*` (local + CI cache). `.next/` cache. `pnpm-lock.yaml` tiene 2 entries `twilio@5.12.1`. `package-lock.json` tiene 0 entries de Twilio (stale but present). | `pnpm remove twilio` regenera `node_modules` + `pnpm-lock.yaml`. Vercel usa fresh `pnpm install` por deploy (no cache issue). `package-lock.json` stale NO afecta (pnpm lo ignora) — flag for separate cleanup out of scope. |

**Canonical question:** *Tras mergear el PR, ¿qué sistemas runtime siguen teniendo referencias viejas?*

Respuesta:
- **Twilio console** sigue listando el webhook URL hasta que el usuario lo retire manualmente (Fase post-deploy, CONTEXT.md §Deferred).
- **Vercel env vars Twilio** siguen inyectando `TWILIO_*` al runtime — **safe**, nadie las lee.
- **Tabla `integrations`** row con `type='twilio'` sigue presente — **safe**, nadie la lee tras eliminar `getTwilioConfig`.
- **Registros `sms_messages` con `provider='twilio'`** siguen allí — **safe**, solo histórico.

Nada en esta lista bloquea el deploy. Todos son "orphans seguros" por diseño (D-09).

## Common Pitfalls

### Pitfall 1: TypeScript typecheck de `scripts/` no existe
**What goes wrong:** El script `migrate-twilio-automations-to-onurix.mjs` tiene un bug de tipo y pasa el build Vercel sin ser detectado.
**Why it happens:** `tsconfig.json:34` excluye `"scripts"` del compile. `.mjs` además no es TypeScript.
**How to avoid:** Dry-run el script (`--no-apply`) antes de ejecutar. Inspeccionar el diff imprimido. Si el diff está vacío cuando debería tener 4 automations, el script tiene un bug.
**Warning signs:** Dry-run output muestra 0 changes, o muestra IDs fuera de TARGET_IDS, o menciona workspace_id distinto a Somnio.
[VERIFIED: tsconfig.json:34 `"exclude": ["node_modules", "scripts", ...]`]

### Pitfall 2: Asumir que Twilio reintenta el webhook 24-48h
**What goes wrong:** El operador deja un stub 200 en `/api/webhooks/twilio/status` "por si acaso" para evitar spam de reintentos, añadiendo complejidad innecesaria.
**Why it happens:** Memoria de patrones de webhooks HTTP generales donde muchos proveedores reintentan con backoff exponencial durante horas.
**How to avoid:** Twilio SMS status callbacks **NO se reintentan ante respuestas HTTP no-2xx** (incluido 404). Solo TCP/TLS failures disparan un retry único a los 15s. Eliminar el route file directo es seguro — Twilio verá 404 una vez y se detiene.
**Warning signs:** Si el log Vercel muestra POSTs repetidos a `/api/webhooks/twilio/status` horas después del deploy, algo está mal (pero esto NO ocurrirá para SMS callbacks).
[CITED: Twilio Docs §Webhooks Connection Overrides — "Twilio retries once on TCP connect or TLS handshake failures only"] [CITED: twilio.com/docs/api/errors/11200 — 4xx responses are terminal for most webhook types]

### Pitfall 3: Residual imports Twilio escondidos en comentarios o strings
**What goes wrong:** Tras pnpm remove, el build pasa, pero queda un `// TODO: migrate this twilio call` o un `console.log('Twilio config loaded')` que confunde lectores futuros.
**Why it happens:** TS typecheck solo detecta imports/usos de código vivo. Strings y comentarios pasan silenciosos.
**How to avoid:** Ejecutar **ripgrep post-cambio** para detectar TODAS las referencias:
```bash
# Run from repo root. Must return ZERO matches.
rg -i 'twilio' src/ --type ts --type tsx
rg -i 'twilio' src/ -g '!*.test.*' -g '!*.md'
```
Accepted residuals (explicit whitelist):
- Ninguno. Zero tolerance — el comentario de `bold-form.tsx` que menciona "copy of twilio-form" debe ajustarse en el mismo PR (D-11 §Claude's discretion).
**Warning signs:** Si `rg -i twilio src/` devuelve >0 matches post-PR, el deploy está incompleto.

### Pitfall 4: In-flight automation executions durante Fase A
**What goes wrong:** El usuario dispara el trigger de `GUIA TRANSPORTADORA` exactamente mientras el script está corriendo su UPDATE. El execution lee la versión vieja de `actions`, llama `executeSendSmsTwilio`, envía via Twilio una última vez.
**Why it happens:** El action-executor carga la automation al inicio del execution y el código Twilio (commit B no mergeado aún) sigue siendo funcional.
**How to avoid (mitigación, no eliminación):**
- Fase A script corre en <1s para 4 rows (UPDATEs atómicos). Ventana de riesgo real = <1s.
- No hay carga de tráfico SMS outbound automático fuera del horario CRC (8 AM - 9 PM). Correr el script fuera de horario pico (e.g., 7:30 AM) reduce probabilidad a ~0.
- En Fase A el código Twilio sigue VIVO — una ejecución in-flight usa Twilio correctamente. La migración solo afecta triggers DESPUÉS del script.
- Tras Fase A, si un automation se dispara y lee `type='send_sms'`, el executor (aún-código-Twilio) ejecuta `executeSendSmsTwilio` que sigue funcionando contra credenciales Twilio de `integrations` table. → **Sigue enviando SMS por Twilio** hasta Fase B. Esto es CORRECTO — el plan contempla que validación manual de Fase A se haga vía Onurix explícitamente (ver próxima pitfall).
**Warning signs:** Tras Fase A script, un SMS sale con `provider='twilio'` en `sms_messages`. Esto indicaría que el action-executor está buscando por type pero NO hizo el switch al domain. Revisar la lógica de dispatch.

**Risk analysis:** En el estado post-Fase A / pre-Fase B, el executor ACTUAL (aún con código Twilio) sigue viendo `type='send_sms'` y ejecutando Twilio. Esto **no rompe producción**, pero significa que la validación manual de Fase A **debe esperar a Fase B** para verificar que Onurix está en el path. Ver P5 en Pitfall #5.

### Pitfall 5: Validación manual ambigua en Fase A
**What goes wrong:** El usuario dispara GUIA TRANSPORTADORA tras correr el script, ve que llegó un SMS, lo declara "validado", y mergean Fase B. Pero el SMS llegó por Twilio (código viejo aún desplegado ejecutando `executeSendSmsTwilio` sobre `type='send_sms'`).
**Why it happens:** Confundir "el action type se llama send_sms y funciona" con "el action se ejecuta por Onurix". Fase A **no** cambia la ruta de código — solo los datos.
**How to avoid:** **La validación real de Fase A es verificar post-script que los datos están bien, no que el envío salió por Onurix.** Check:
```sql
SELECT id, name,
  (SELECT string_agg(a->>'type', ',') FROM jsonb_array_elements(actions) a) AS types
FROM automations
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND id IN ('f77bff5b-...','24005a44-...','71c4f524-...','c24cde89-...');
-- Expect: all rows show only 'send_sms' in types (no 'send_sms_onurix').
```
**La validación via envío real de SMS por Onurix debe ocurrir POST-Fase B**, tras el deploy del PR de limpieza. Ahí sí el executor refactorizado rutea a `domainSendSMS()` y aparecerá `provider='onurix'` en `sms_messages`.

**Reinterpretación del D-04:** La fase A valida el CAMBIO DE DATOS (types normalizados); la fase B valida el CAMBIO DE CÓDIGO (envío real por Onurix). El usuario corre los triggers reales DESPUÉS de Fase B, no entre A y B.

**Recommendation for planner:** Clarificar en el PLAN que Fase A = script + SQL verification; Fase B = deploy + manual triggers + inspection de `sms_messages.provider='onurix'`.

### Pitfall 6: Vercel build cache no es un problema, pero `pnpm install` sí puede serlo
**What goes wrong:** El deploy pasa typecheck pero en runtime un componente carga un chunk con Twilio imports.
**Why it happens:** Next.js compila el `next build` paso a paso — los chunks se generan desde los imports vivos. Sin imports, sin chunk. Cache de Vercel solo afecta `node_modules` si las hashes coinciden.
**How to avoid:** `pnpm remove twilio` (commit 5 del PR) garantiza que node_modules fresh en Vercel no tiene twilio. Vercel por defecto usa `pnpm install --frozen-lockfile` en CI — si el lockfile no incluye twilio, Vercel no lo instala.
**Warning signs:** Vercel build log muestra `ERR_MODULE_NOT_FOUND` o `Cannot find module 'twilio'` — indica que algún import sobrevivió. Grep previo debió detectarlo.
[VERIFIED: vercel.com/kb/guide/why-is-my-deployed-project-giving-404 — deleted routes return 404 on new deploy; no cache for deleted routes]

### Pitfall 7: SmsStatus type value mismatch entre viejo y nuevo
**What goes wrong:** Al eliminar `src/lib/twilio/types.ts`, un caller que imports `SmsStatus` desde allí se rompe, o peor, un comparador con `'queued'|'sending'|'undelivered'` (solo en el tipo viejo) queda sintácticamente válido pero semánticamente muerto.
**Why it happens:** El tipo viejo tenía 6 valores (`queued|sending|sent|delivered|failed|undelivered`), el nuevo tiene 4 (`pending|sent|delivered|failed`). Son overlapping pero no iguales.
**How to avoid:** Buscar usos del tipo viejo antes de eliminar:
```bash
rg "SmsStatus" src/ --type ts --type tsx
rg "'queued'|'sending'|'undelivered'" src/ --type ts --type tsx
```
Actual estado del codebase:
- `src/lib/domain/sms.ts:25` importa `SmsStatus` de `@/lib/sms/types` (el nuevo, ✓).
- `src/lib/twilio/types.ts:53` define el viejo `SmsStatus` con 6 valores.
- No hay otros importers del viejo `SmsStatus` [VERIFIED: grep output].

→ Safe to delete `src/lib/twilio/types.ts` en commit 1. Sin callers.

### Pitfall 8: Dos lockfiles contradictorios
**What goes wrong:** `package-lock.json` sigue en el repo con 0 entries de twilio (stale — no ha sido regenerado desde la migración a pnpm). Una herramienta o CI que lea npm primero puede confundirse.
**Why it happens:** Historia del repo — probablemente migraron de npm a pnpm sin eliminar el lockfile viejo.
**How to avoid:** **Fuera de scope de este PR** (CONTEXT.md no lo incluye), pero flag para LEARNINGS: considerar eliminar `package-lock.json` en un PR separado de housekeeping.
**Warning signs:** Si `pnpm remove twilio` no afecta `package-lock.json`, es porque pnpm no lo toca. Correcto comportamiento — pnpm solo edita `pnpm-lock.yaml`.
[VERIFIED: repo tiene ambos `pnpm-lock.yaml` y `package-lock.json`; Grep twilio en package-lock.json = 0 matches]

## Code Examples

### Example 1: Dry-run del script de migración (verificación de datos)

```bash
# Desde repo root
node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs

# Expected output:
# Found 4 automations in Somnio
# Diff: 4 automations will be modified.
#   f77bff5b-...  (GUIA TRANSPORTADORA): [send_sms] → [send_sms]
#   24005a44-...  (Inter): [send_sms] → [send_sms]
#   71c4f524-...  (template final ultima): [send_sms] → [send_sms]
#   c24cde89-...  (REPARTO): [send_sms_onurix] → [send_sms]
#
# DRY RUN — pass --apply to write changes.
```

### Example 2: Apply + idempotency verification

```bash
# First apply
node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs --apply
# Expected: ✓ Updated 4 rows, 'Migration complete'

# Second run (must be idempotent)
node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs
# Expected: 'Diff: 0 automations will be modified.' → 'DRY RUN — pass --apply'
```

### Example 3: SQL verification post-Fase A

```sql
-- Confirm all 4 automations in Somnio now have 'send_sms' uniformly
SELECT
  id,
  name,
  (SELECT array_agg(DISTINCT a->>'type') FROM jsonb_array_elements(actions) a) AS types
FROM automations
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND actions::text LIKE '%send_sms%';

-- Expected: all rows have types = {send_sms} only (no send_sms_onurix).
```

### Example 4: Ripgrep verification (Fase B pre-merge)

```bash
# Run from repo root. Each command must return 0 matches (exit 0 = found; rg returns 1 on 0 matches).

# Code references (live imports + strings + comments)
rg -i 'twilio' src/ --type ts --type tsx --no-messages

# Catalog references
rg 'send_sms_onurix' src/ --type ts --type tsx

# Webhook references
rg -i 'webhooks/twilio' --type ts --type tsx

# Lockfile sanity (should have 0 twilio@* entries)
rg '^twilio@|/twilio/' pnpm-lock.yaml

# Expected: ALL four commands return "No matches found" (exit code 1).
# Acceptable exceptions: .planning/ docs reference history (not part of build).
```

### Example 5: pnpm remove con confirmación

```bash
# From repo root — this is commit 5 of the PR
pnpm remove twilio

# Expected output:
# Progress: resolved X, reused Y, downloaded 0, added 0, done
# ...
# dependencies:
# - twilio 5.12.1
#
# Done in Xs
#
# Verify:
git diff package.json   # Should show "twilio" line removed
git diff pnpm-lock.yaml  # Should show twilio@5.12.1 entries removed (lines 5342 + 11194 gone)
```

### Example 6: checkSmsConfigured (reemplazo de checkTwilioConfigured)

```typescript
// src/app/actions/automations.ts — REPLACE lines 940-964

/**
 * Check if SMS (Onurix) is configured and active for the current workspace.
 * Returns { configured: boolean, balance: number | null, hasBalance: boolean }
 * Used by the automations wizard to show configuration warnings.
 */
export async function checkSmsConfigured(): Promise<{
  configured: boolean
  balance: number | null
  hasBalance: boolean
}> {
  const ctx = await getAuthContext()
  if (!ctx) return { configured: false, balance: null, hasBalance: false }

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('sms_workspace_config')
    .select('is_active, balance_cop')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error || !data) {
    return { configured: false, balance: null, hasBalance: false }
  }

  const MINIMUM_BALANCE = 97 // SMS_PRICE_COP — one segment

  return {
    configured: data.is_active,
    balance: data.balance_cop,
    hasBalance: data.balance_cop >= MINIMUM_BALANCE,
  }
}
```

Call site in `actions-step.tsx`:

```typescript
// Replace line 52 import + 1518-1532 state/effect
import { checkSmsConfigured } from '@/app/actions/automations'

const [smsConfig, setSmsConfig] = useState<{ configured: boolean; hasBalance: boolean }>({
  configured: false,
  hasBalance: false,
})

useEffect(() => {
  checkSmsConfigured().then((res) => {
    setSmsConfig({ configured: res.configured, hasBalance: res.hasBalance })
  })
}, [])

const smsWarning = !smsConfig.configured || !smsConfig.hasBalance
```

Warning render (replace line 1257 `{twilioWarning && catalogEntry.category === 'SMS' && ...}`):

```tsx
{smsWarning && catalogEntry.category === 'SMS' && (
  <div className="text-amber-600 dark:text-amber-500 text-xs flex items-start gap-1.5 mt-1">
    <Info size={14} className="shrink-0 mt-0.5" />
    <span>
      {!smsConfig.configured
        ? 'SMS no esta configurado para este workspace. Configura el servicio en Integraciones.'
        : 'Saldo SMS insuficiente (minimo $97 COP). Recarga desde Integraciones → SMS.'}
    </span>
  </div>
)}
```

### Example 7: Renamed action executor handler

```typescript
// src/lib/automations/action-executor.ts — REPLACE lines 1076-1159 with just:

// ============================================================================
// SMS Action — via Onurix domain layer
// ============================================================================

/**
 * Send an SMS via the domain layer (Onurix).
 * Delegates to domain/sms.ts which handles: phone validation, time window check,
 * balance pre-check, Onurix API call, message logging, balance deduction,
 * and Inngest delivery verification event emission.
 */
async function executeSendSms(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const body = String(params.body || '')
  if (!body) throw new Error('body is required for send_sms')

  const to = params.to ? String(params.to) : context.contactPhone
  if (!to) {
    throw new Error(
      'No phone number available for SMS — set "to" param or ensure trigger has contactPhone'
    )
  }

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendSMS(ctx, {
    phone: to,
    message: body,
    source: 'automation',
    contactName: context.contactName || undefined,
  })

  if (!result.success) throw new Error(result.error || 'SMS send failed')
  return result.data
}
```

Also remove line 17 import:
```typescript
// DELETE: import { getTwilioConfig, createTwilioClient } from '@/lib/twilio/client'
```

And update the dispatcher switch from two cases (`send_sms` + `send_sms_onurix`) to one (`send_sms`).

### Example 8: constants.ts action catalog entry (renamed)

```typescript
// src/lib/automations/constants.ts — REPLACE lines 338-358 with just:

{
  type: 'send_sms',
  label: 'Enviar SMS',
  category: 'SMS',
  description: 'Envia un mensaje SMS al contacto (Onurix - $97 COP)',
  params: [
    { name: 'body', label: 'Mensaje', type: 'textarea', required: true, supportsVariables: true },
    { name: 'to', label: 'Telefono destino (opcional)', type: 'text', required: false, supportsVariables: true },
  ],
},
```

And remove the `Twilio` category from `ACTION_CATEGORY_CONFIG` in `actions-step.tsx:85`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio REST API con webhook status callback | Onurix API + Inngest polling cada 60s | 2026-03-16 (sms-module) | Latencia de status update es 60s vs ~5s de webhook; aceptable por costo (Twilio $17.30/SMS vs Onurix $97 COP). |
| Dos action types (`send_sms`, `send_sms_onurix`) | Un action type (`send_sms`) | Post-cutover (este phase) | UI más limpia, cero ambigüedad. |
| `integrations` table para credenciales SMS (Twilio) | `sms_workspace_config` table con balance + is_active | 2026-03-16 (sms-module) | Modelo de pre-pago vs invoice mensual; adecuado para Onurix. |
| `twilio_sid` column | `provider_message_id` column + `provider` column | 2026-03-16 (migration 20260316100000) | Multi-provider-safe; columna renombrada + backfill. |

**Deprecated/outdated (a eliminar en este phase):**
- `src/lib/twilio/*` — superseded by `src/lib/sms/*` + `src/lib/domain/sms.ts`
- Action type `send_sms_onurix` — superseded by unified `send_sms`
- `checkTwilioConfigured()` — superseded by `checkSmsConfigured()` (new)
- Tab "Twilio" en `/configuracion/integraciones` — superseded by tab "SMS"
- `/api/webhooks/twilio/status` route — superseded by Inngest polling

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel deploy behavior for deleted routes: inmediato 404 nativo sin build cache issue | Pattern 3 / Pitfall 6 | Bajo — si Vercel sirve la ruta vieja unos minutos, Twilio verá 200 y actualizará registros viejos (pero R1 ya los rompe). No bloqueante. [CITED: vercel.com/kb with caveat — no fuentes oficiales garantizan inmediatez 100%] |
| A2 | `pnpm remove` también actualiza `pnpm-lock.yaml` | Pattern 3 commit 5 | Bajo — comportamiento estándar de pnpm. Verificable con `git diff pnpm-lock.yaml` tras el comando. [CITED: pnpm.io/cli/remove + standard behavior] |
| A3 | In-flight automation durante los <1s del script no pasa por condición inconsistente | Pitfall 4 | Medio — si se dispara simultáneo, usuario ve el SMS pero el executor con código-Twilio-vigente sigue usando Twilio (no Onurix). Mitigación: correr fuera de horario pico (7:30 AM). |
| A4 | Ningún caller importa el `SmsStatus` viejo (6 valores) con casts a `'queued'|'sending'|'undelivered'` | Pitfall 7 | Bajo — grep confirmado: solo `src/lib/twilio/types.ts` se exporta y solo `src/lib/domain/sms.ts` importa `SmsStatus` (del nuevo lib/sms/types.ts). [VERIFIED: grep output] |
| A5 | Onurix SMS API NO tiene webhook alternativa a polling messages-state | Architectural Responsibility Map | Bajo — confirmado contra docs.onurix.com (webhooks solo para WhatsApp). Si resulta que sí existe webhook SMS, el planner podría considerar migrar el Inngest polling — pero fuera de scope del cutover. [VERIFIED: docs.onurix.com] |

## Open Questions (RESOLVED)

All questions below are deferred / non-blocking; each `Recommendation:` below is the accepted resolution for this phase.

1. **REPARTO fue configurado con `send_sms_onurix` sin el usuario saberlo — ¿cuándo?**
   - What we know: Usuario declaró en DISCUSSION-LOG §Q3 que no sabía que REPARTO usaba `send_sms_onurix`. Puede haber enviado SMS reales antes del 2026-04-16 (fecha de validación oficial Onurix).
   - What's unclear: ¿Fecha de cambio de REPARTO? ¿Número de SMS reales ejecutados por REPARTO pre-validación? ¿Balance del workspace Somnio refleja esos consumos correctamente?
   - Recommendation: Post-cutover, ejecutar query diagnóstica:
     ```sql
     SELECT COUNT(*) AS total, MIN(created_at), MAX(created_at), SUM(cost_cop)
     FROM sms_messages
     WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
       AND provider = 'onurix'
       AND source = 'automation'
       AND created_at < '2026-04-16'::date;
     ```
     Incluir findings en LEARNINGS.md del phase — **no bloqueante** para el cutover.

2. **¿El usuario va a retirar manualmente las env vars Twilio en Vercel post-deploy?**
   - What we know: CONTEXT.md §Deferred incluye "Retirada manual de env vars Twilio en Vercel — acción manual del usuario tras deploy".
   - What's unclear: ¿Cuándo? ¿Hay un recordatorio en el plan para trackearlo?
   - Recommendation: LEARNINGS.md del phase debe incluir checklist final con esta acción explícita (con link al dashboard Vercel). No es deploy-blocking pero sí es "no one-way door" safety.

3. **¿`package-lock.json` stale se elimina en este PR o en uno separado?**
   - What we know: Tiene 0 entries de twilio, pnpm es el lockfile real.
   - What's unclear: Si herramientas CI (Dependabot, Snyk, Renovate) lo lean por separado.
   - Recommendation: **Fuera de scope** de este PR (CONTEXT.md no lo incluye). Flag para housekeeping PR posterior.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (for `.mjs` script) | Fase A script execution | ✓ | 20.x+ assumed (project uses `@types/node: ^20`) | — |
| `pnpm` | Dep removal + local install | ✓ | pnpm-lock.yaml presente | — |
| Supabase admin credentials (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Fase A script | ✓ (in .env.local per test-onurix-domain.mjs convention) | — | — |
| Onurix credentials (`ONURIX_CLIENT_ID=7976`, `ONURIX_API_KEY`) | Fase B post-deploy validation | ✓ (verified in prod + Vercel per AUDIT-REPORT) | — | — |
| Twilio credentials | Intentionally deleted this PR | n/a (going away) | — | — |
| ripgrep (`rg`) | Verification step | ✓ (Claude Code built-in Grep tool) | — | — |
| Vercel deployment target | PR merge → auto-deploy | ✓ (project deploys to Vercel on push main) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Sin framework formal (Jest/Vitest). Validación manual + scripts standalone (`test-onurix-sms.mjs`, `test-onurix-domain.mjs`) |
| Config file | — |
| Quick run command | `node --env-file=.env.local scripts/test-onurix-domain.mjs` |
| Full suite command | Ambos: `node --env-file=.env.local scripts/test-onurix-sms.mjs && node --env-file=.env.local scripts/test-onurix-domain.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 Fase A | Script migra 4 automations idempotente | Smoke + dry-run | `node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs` (then `--apply` then re-run) | ❌ Wave 0 — crear script |
| D-02 Idempotency | Segunda ejecución del script = 0 changes | Integration | Re-run del script tras --apply | ❌ Wave 0 |
| D-04 Onurix envío real | 3 triggers manuales → SMS llegan con sender MORFX | **Manual** | N/A (trigger UI) + SQL verify `SELECT provider, status FROM sms_messages WHERE automation_execution_id = ?` | N/A (manual) |
| D-05 Rename | `send_sms_onurix` no aparece en DB ni en código | SQL + grep | SQL: `SELECT COUNT(*) FROM automations WHERE actions::text LIKE '%send_sms_onurix%'` (expect 0). Grep: `rg 'send_sms_onurix' src/` (expect 0). | ✅ (one-off command, not a file) |
| D-08 Webhook eliminado | GET/POST a `/api/webhooks/twilio/status` devuelve 404 | Manual smoke | `curl -X POST https://morfx.app/api/webhooks/twilio/status` tras deploy (expect 404) | N/A (manual post-deploy) |
| D-10 Dep retirada | `pnpm install --frozen-lockfile && grep -c '"twilio"' package.json` = 0 | Smoke | Verificar en `git diff` del PR | ✅ |
| D-11/D-12 UI | Tab SMS muestra balance + warning real por `sms_workspace_config` | Manual | Navegar a `/configuracion/integraciones` tras deploy | N/A (manual UI test) |
| Regression Onurix | Tests A+B+C existentes siguen pasando | Smoke | `node --env-file=.env.local scripts/test-onurix-sms.mjs && node --env-file=.env.local scripts/test-onurix-domain.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm build` (TS typecheck + Next build). CI Vercel corre automático en push.
- **Per wave merge:** N/A (single PR, no waves).
- **Phase gate:** (1) Fase A script dry-run verifica diff; (2) `rg -i twilio src/` = 0 matches antes de merge; (3) Fase B post-deploy smoke tests Onurix (scripts existentes) + triggers manuales.

### Wave 0 Gaps
- [ ] `scripts/migrate-twilio-automations-to-onurix.mjs` — crear script con dry-run + --apply + idempotency
- [ ] **No unit test framework** — consistent con resto del repo (sin Jest/Vitest configurado). Test E2E del action flow queda deferred (ver CONTEXT.md).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Regla 3 domain layer — mutaciones vía `domainSendSMS()`. Regla 6 agente-en-producción. |
| V2 Authentication | yes | Script usa `SUPABASE_SERVICE_ROLE_KEY` (admin bypass) — solo ejecutable por developer local con `.env.local`. |
| V3 Session Management | no | Este phase no toca sesiones. |
| V4 Access Control | yes | Workspace-scoped UPDATE (`.eq('workspace_id', ...)`). Regla 3. |
| V5 Input Validation | yes | No hay user input directo en el script — IDs whitelisted en constant `TARGET_IDS`. |
| V6 Cryptography | no | Credenciales en env vars; no hand-rolled crypto. |
| V9 Communication | yes | Twilio webhook era HTTPS — al eliminar, reducimos superficie de ataque (un endpoint menos). |
| V10 Malicious Code | yes | No se introduce binarios nuevos. Script standalone visible en git. |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Script malicioso actualiza automations fuera de Somnio | Tampering | WHERE workspace_id hardcoded + IDs whitelisted + dry-run default |
| Webhook Twilio POST recibe spoof durante ventana de deploy | Spoofing | Twilio signature validation ya NO aplica (webhook roto 30d, se va a 404). Sin cambios. |
| Log leak de credenciales Twilio al eliminar | Information Disclosure | Script NO lee credenciales Twilio. Dep removal no toca `integrations.config`. |
| Race condition entre script + trigger automation | Elevation of Privilege (trivial) | Ventana < 1s, riesgo aceptado (Pitfall 4). Rollback = re-correr script. |

## Sources

### Primary (HIGH confidence)
- `src/lib/domain/sms.ts` — existing domain implementation (read in session)
- `src/lib/automations/action-executor.ts:1060-1159` — current handlers (read in session)
- `src/lib/automations/constants.ts:325-360` — catalog entries (read in session)
- `src/lib/twilio/client.ts` + `src/lib/twilio/types.ts` — files to delete (read in session)
- `src/app/api/webhooks/twilio/status/route.ts` — webhook to delete (read in session)
- `src/inngest/functions/sms-delivery-check.ts` — polling pattern (read in session)
- `scripts/test-onurix-domain.mjs` — script template (read in session)
- `tsconfig.json` — confirmed `scripts/` excluded (read in session)
- `package.json` — confirmed twilio ^5.12.1 on line 84 (read in session)
- `pnpm-lock.yaml` — confirmed 2 twilio entries lines 5342, 11194 (grep in session)
- `.planning/standalone/twilio-to-onurix-migration/AUDIT-REPORT.md` — all P1-P10 answers (read in session)
- `.planning/standalone/twilio-to-onurix-migration/CONTEXT.md` — all D-01 through D-13 (read in session)
- `.planning/standalone/twilio-to-onurix-migration/DISCUSSION-LOG.md` — user choices (read in session)

### Secondary (MEDIUM confidence)
- [pnpm remove CLI](https://pnpm.io/cli/remove) — syntax confirmed
- [Twilio Webhooks Connection Overrides](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides) — retry behavior (4xx = no retry)
- [Twilio 11200 HTTP retrieval failure](https://www.twilio.com/docs/api/errors/11200) — error semantics
- [kevcodez — Postgres JSONB array update pattern](https://kevcodez.de/posts/2020-09-13-postgres-jsonb-update-object-array/) — verified jsonb_set + WITH ORDINALITY approach
- [Vercel KB — 404 debugging](https://vercel.com/kb/guide/why-is-my-deployed-project-giving-404) — deleted route behavior
- [docs.onurix.com navigation structure](https://docs.onurix.com/) — confirmed webhooks only for WhatsApp (not SMS)

### Tertiary (LOW confidence)
- Assumption A1 (Vercel immediate 404 on deleted route) — behavior observed but no oficial doc guarantees timing to the second. Mitigated by: eliminar webhook es best-effort; worst case, unos minutos de 200 extras no rompen nada (webhook roto 30d ya).

## Metadata

**Confidence breakdown:**
- Codebase state (inventory, imports, types): **HIGH** — all verified in session via Read/Grep
- Script patterns (scripts/, .mjs convention): **HIGH** — precedente directo (`test-onurix-domain.mjs`)
- jsonb_set pattern: **HIGH** — documented pattern + simple JS-side approach viable
- Twilio retry behavior: **HIGH** — documented (no retries on 4xx)
- pnpm remove: **HIGH** — official docs confirmed
- Vercel deleted route behavior: **MEDIUM** — standard behavior, but exact invalidation timing not documented explicitly
- Onurix webhook availability (negative claim): **HIGH** — verified against docs.onurix.com
- In-flight automation race window: **MEDIUM** — analytical reasoning, not empirically measured
- UI migration patterns (tab SMS, warnings): **HIGH** — super-admin SMS dashboard already exists as template

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days; stack is stable, Onurix validation fresh)
