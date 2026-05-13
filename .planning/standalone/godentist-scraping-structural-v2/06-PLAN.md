---
phase: godentist-scraping-structural-v2
plan: 06
type: execute
wave: 3
depends_on: [01, 02, 05]
files_modified:
  - src/app/actions/godentist.ts
autonomous: true
requirements:
  - D-05
  - D-06
  - D-08
  - D-10
  - D-12

must_haves:
  truths:
    - "scrapeAppointments server-action lee getPlatformConfig<boolean>('use_new_godentist_scraping', true) — fallback DEBE ser true (D-10 default ON). Si flag=true (default): fetch al endpoint paradigm F. Si flag=false (kill-switch): retorna error explicito SIN fetch a ningun endpoint (paradigma A no existe en main post-Plan 05; rollback real = git revert + redeploy)."
    - "Despues de res.json() y antes del history insert, scrapeAppointments deduplica appointments por clave (sucursal|telefono|hora) (D-12)"
    - "Despues del dedupe y antes del history insert, scrapeAppointments detecta cross-sede (phone, fecha) en >1 sede y arma inconsistency_details JSONB (D-08)"
    - "Si isInconsistent === true, scrapeAppointments awaitea inngest.send con event 'godentist/scrape.inconsistent' (CRITICAL Pitfall: await obligatorio en serverless)"
    - "El history insert payload incluye los 3 nuevos campos: inconsistent, inconsistency_details, total_citas"
    - "sendConfirmations y scheduleReminders gatean en el flag inconsistent del scrape (lectura via historyId pasado como parametro, gate ANTES del loop principal)"
    - "TypeScript del proyecto morfx compila sin errores (next build pasa o npx tsc --noEmit)"
  artifacts:
    - path: "src/app/actions/godentist.ts"
      provides: "Feature flag (kill-switch semantica abort-on-OFF) + dedupe + cross-sede canary + downstream gating + Inngest event emission"
      contains:
        - "getPlatformConfig"
        - "use_new_godentist_scraping"
        - "Paradigm A removed in standalone godentist-scraping-structural-v2"
        - "const seen = new Set<string>()"
        - "crossSedePhones"
        - "isInconsistent"
        - "inconsistency_details"
        - "godentist/scrape.inconsistent"
        - "Scrape marcado como inconsistent"
  key_links:
    - from: "src/app/actions/godentist.ts:scrapeAppointments"
      to: "platform_config row (Plan 02) + godentist_scrape_history.inconsistent/inconsistency_details/total_citas (Plan 01) + Inngest 'godentist/scrape.inconsistent' event (Plan 07)"
      via: "getPlatformConfig fetch + admin insert + inngest.send"
      pattern: "await getPlatformConfig|inconsistency_details|godentist/scrape.inconsistent"
    - from: "src/app/actions/godentist.ts:sendConfirmations + scheduleReminders"
      to: "godentist_scrape_history.inconsistent column"
      via: "early-return gate on flag"
      pattern: "Scrape marcado como inconsistent"
---

<objective>
Inyectar las 3 defensas server-action mandatadas por D-06/D-08/D-10/D-12 en `src/app/actions/godentist.ts`:

1. **Feature flag (D-10) — semantica Option A (abort-on-OFF):** `getPlatformConfig<boolean>('use_new_godentist_scraping', true)` decide flujo. Default ON. Si `false`, el server-action retorna error explicito SIN fetch a ningun endpoint. Razon: Plan 05 BORRA paradigma A del adapter; no existe `/api/scrape-appointments-legacy` en server.ts. Fetcheario seria un 404 silencioso que ocultaria el rollback. La semantica correcta del flag es "kill-switch" — OFF = abortar nuevos scrapes con error explicito. Rollback REAL a paradigma A = `git revert HEAD del commit del standalone + redeploy`.
2. **Dedupe (D-12):** descarta filas duplicadas exactas por clave `(sucursal|telefono|hora)` antes de persistir el scrape. Silencioso (D-06 safety net barato).
3. **Cross-sede canary (D-08):** detecta `(phone)` en >1 sede dentro del mismo scrape. Si detecta: persiste con `inconsistent=true` + `inconsistency_details` JSONB + `await inngest.send('godentist/scrape.inconsistent')`. La canary jamas dispara en paradigm F+dedupe segun RESEARCH.md — si dispara, es SIGNAL de bug nuevo, no workflow.
4. **Downstream gating (D-08):** `sendConfirmations` + `scheduleReminders` aborten temprano si el scrape (lookup por historyId) tiene `inconsistent=true`.

Purpose: La defensa server-action es la capa final que cierra el bug. CONTEXT.md D-06: "dedupe + detector cross-sede son OBLIGATORIOS independiente del paradigma de scraping" — porque el portal Dentos puede cambiar el HTML en el futuro y romper el robot sin que el operador se entere.

Output: ~120 lineas inyectadas en 3 metodos de actions/godentist.ts. Sin commit todavia (commit unificado en Plan 11).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-structural-v2/CONTEXT.md
@.planning/standalone/godentist-scraping-structural-v2/RESEARCH.md
@.planning/standalone/godentist-scraping-structural-v2/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Current scrapeAppointments (lines 108-167) -->
```typescript
export async function scrapeAppointments(sucursales?: string[], targetDate?: string): Promise<{ error?: string; data?: ScrapeResult; historyId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }
  try {
    const res = await fetch(`${ROBOT_URL}/api/scrape-appointments`, { method: 'POST', headers: ..., body: ... })
    if (!res.ok) { ... }
    const data: ScrapeResult = await res.json()
    // Save to history
    const admin = createAdminClient()
    const insertPayload = {
      workspace_id: workspaceId,
      scraped_date: data.date,
      sucursales: sucursales || [...],
      appointments: JSON.parse(JSON.stringify(data.appointments)),
      total_appointments: data.appointments.length,
    }
    const { data: historyRow, error: historyError } = await admin.from('godentist_scrape_history').insert(insertPayload).select('id').single()
    // ...
    return { data, historyId: savedHistoryId }
  } catch (err) { ... }
}
```

<!-- Existing imports at top of file — verify before adding -->
- `import { cookies } from 'next/headers'`
- `import { createClient } from '@/lib/supabase/server'`
- `import { createAdminClient } from '@/lib/supabase/admin'`
- `import { inngest } from '@/inngest/client'` (verify; may need to add)

<!-- getPlatformConfig helper pattern (from webhook-processor.ts §572-577) -->
```typescript
const { getPlatformConfig } = await import('@/lib/domain/platform-config')
const enabled = await getPlatformConfig<boolean>('crm_bot_enabled', true)
```

<!-- Inngest event emission pattern (CRITICAL Pitfall — from MEMORY.md + bold/client.ts) -->
```typescript
// CRITICAL: Vercel terminates lambda after res.json() — in-flight unawaited
// inngest.send promises are DROPPED. await is NON-NEGOTIABLE.
await (inngest.send as any)({
  name: 'godentist/scrape.inconsistent',
  data: { workspaceId, scrapedDate, crossSedePhones, detectedAt }
})
```

<!-- ScrapeResult type from current file (lines ~80-105 approx; verify structure) -->
- ScrapeResult.date: string
- ScrapeResult.appointments: GodentistAppointment[]
- ScrapeResult.totalCitas?: number | null  // NEW from Plan 05 — verify present after Plan 05
- GodentistAppointment.sucursal, .telefono, .hora, .nombre, .doctor, .estado

<!-- sendConfirmations signature (line 170) -->
```typescript
export async function sendConfirmations(appointments: GodentistAppointment[], date: string, historyId?: string)
```

<!-- scheduleReminders signature (line 641) -->
```typescript
export async function scheduleReminders(appointments: GodentistAppointment[], date: string, historyId?: string)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Inyectar feature flag (D-10, semantica abort-on-OFF) + dedupe (D-12) + cross-sede canary (D-08) + new history columns en scrapeAppointments</name>

  <read_first>
    - src/app/actions/godentist.ts lineas 1-50 (imports — verificar si `inngest` ya esta importado; si no, agregar)
    - src/app/actions/godentist.ts lineas 80-167 (scrapeAppointments completo)
    - src/lib/agents/production/webhook-processor.ts lineas 570-580 (analog getPlatformConfig usage)
    - src/lib/bold/client.ts lineas 60-75 (analog await inngest.send pattern)
    - src/lib/domain/platform-config.ts lineas 60-135 (helper signature + cache TTL)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §3 (snippet verbatim de feature flag + dedupe + canary)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §"Code Examples" — Server-action dedupe + Cross-sede canary
  </read_first>

  <files>src/app/actions/godentist.ts</files>

  <action>
**Step 1 — Imports:** Verificar que `inngest` esta importado al top del archivo. Si no, agregar:

```typescript
import { inngest } from '@/inngest/client'
```

Verificacion: `grep -c "import.*inngest" src/app/actions/godentist.ts` debe retornar al menos 1.

**Step 2 — Reescribir el cuerpo de `scrapeAppointments`:** Localizar la funcion `export async function scrapeAppointments(sucursales?: string[], targetDate?: string)` (linea 108) y reemplazar el cuerpo completo (entre la firma y la closing brace de la funcion):

```typescript
export async function scrapeAppointments(sucursales?: string[], targetDate?: string): Promise<{ error?: string; data?: ScrapeResult; historyId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // ── D-10: feature flag with kill-switch semantics (Option A) ──
  // Per CONTEXT.md D-10 + PATTERNS.md §3 + RESEARCH.md §"Implementation Roadmap" Wave 2.
  // fallback=true is MANDATORY (D-10 default ON). If platform_config row missing,
  // helper returns fallback => paradigm F endpoint is used.
  //
  // SEMANTICA: flag=true => paradigm F (default). flag=false => ABORT con error explicito,
  // NO fetch a ningun endpoint. Razon: paradigma A fue borrado del adapter en Plan 05;
  // `/api/scrape-appointments-legacy` no existe en server.ts. Fetcheario produciria 404 que
  // confundiria al operador (rollback aparente que no funciona). El kill-switch correcto
  // es "abortar nuevos scrapes" hasta que se decida el path de rollback.
  //
  // ROLLBACK REAL a paradigma A: `git revert HEAD del commit del standalone + git push`.
  // Vercel + Railway redeployan; paradigma A vuelve a main. Flag se queda en false hasta
  // que el operador la flipee back a true en el deployment con paradigma A.
  //
  // ROLLBACK SOFT (preventivo, mientras se diagnostica un bug nuevo de paradigma F):
  //   UPDATE platform_config SET value='false'::jsonb WHERE key='use_new_godentist_scraping'
  //   → bloquea nuevos scrapes con error explicito en ≤30s (cache TTL).
  const { getPlatformConfig } = await import('@/lib/domain/platform-config')
  const useNewScraping = await getPlatformConfig<boolean>('use_new_godentist_scraping', true)
  console.log(`[godentist] scrapeAppointments: useNewScraping=${useNewScraping}`)

  if (!useNewScraping) {
    console.error('[godentist] FLAG OFF: aborting scrape (paradigm A removed in standalone godentist-scraping-structural-v2)')
    return {
      error: 'Feature flag use_new_godentist_scraping=false. Paradigm A removed in standalone godentist-scraping-structural-v2. To rollback to paradigm A, git revert the standalone + redeploy.'
    }
  }

  try {
    const res = await fetch(`${ROBOT_URL}/api/scrape-appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        credentials: { username: 'JROMERO', password: '123456' },
        ...(sucursales?.length ? { sucursales } : {}),
        ...(targetDate ? { targetDate } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Robot error (${res.status}): ${text}` }
    }

    const data: ScrapeResult = await res.json()

    // ── D-12: dedupe by (sucursal|telefono|hora) ──
    // Per CONTEXT.md D-12 + RESEARCH.md §Pattern 3: portal Dentos intermitently serves
    // duplicate rows in CABECERA (1-2 per scrape). Silent defense: descarta exactos
    // antes de persistir. NO alarma (es safety net barato, no canary).
    const seen = new Set<string>()
    const dedupedAppointments: GodentistAppointment[] = []
    let dedupedCount = 0
    for (const apt of data.appointments) {
      const key = `${apt.sucursal}|${apt.telefono}|${apt.hora}`
      if (seen.has(key)) {
        dedupedCount++
        continue
      }
      seen.add(key)
      dedupedAppointments.push(apt)
    }
    if (dedupedCount > 0) {
      console.log(`[godentist] D-12 dedupe: removed ${dedupedCount} duplicates from ${data.appointments.length} raw appointments`)
    }
    data.appointments = dedupedAppointments

    // ── D-08: cross-sede canary detector ──
    // Per CONTEXT.md D-08: a phone appearing in >1 sede within the same scrape
    // = paradigm F invariant violated (correctness by construction failed). Should
    // NEVER fire under paradigm F + dedupe (verified 5/5 in RESEARCH.md). If it
    // fires, signal of bug — block downstream + alert developer via Inngest event.
    const phoneToSedes = new Map<string, Set<string>>()
    for (const apt of data.appointments) {
      if (!phoneToSedes.has(apt.telefono)) phoneToSedes.set(apt.telefono, new Set())
      phoneToSedes.get(apt.telefono)!.add(apt.sucursal)
    }
    const crossSedePhones = [...phoneToSedes]
      .filter(([, s]) => s.size > 1)
      .map(([phone, sedes]) => ({ phone, sedes: [...sedes] }))
    const isInconsistent = crossSedePhones.length > 0

    let inconsistencyDetails: Record<string, unknown> | null = null
    if (isInconsistent) {
      inconsistencyDetails = {
        crossSedePhones,
        detectedAt: new Date().toISOString(),
        totalAppointments: data.appointments.length,
      }
      console.error(`[godentist] D-08 CROSS-SEDE CANARY FIRED: ${crossSedePhones.length} phones in >1 sede`, JSON.stringify(crossSedePhones))

      // CRITICAL Pitfall (per CLAUDE.md MEMORY): ALWAYS await inngest.send in serverless.
      // Vercel terminates lambda right after res.json(); in-flight unawaited
      // inngest.send Promises are DROPPED.
      await (inngest.send as any)({
        name: 'godentist/scrape.inconsistent',
        data: {
          workspaceId,
          scrapedDate: data.date,
          crossSedePhones,
          detectedAt: new Date().toISOString(),
        },
      })
    }

    // ── Save to history with new columns ──
    let savedHistoryId: string | undefined
    try {
      const admin = createAdminClient()
      const insertPayload = {
        workspace_id: workspaceId,
        scraped_date: data.date,
        sucursales: sucursales || ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS'],
        appointments: JSON.parse(JSON.stringify(data.appointments)),
        total_appointments: data.appointments.length,
        // ── D-08 columns (Plan 01 migration applied) ──
        inconsistent: isInconsistent,
        inconsistency_details: inconsistencyDetails,
        // ── D-15 audit (Plan 01 migration applied + Plan 05 robot returns) ──
        total_citas: data.totalCitas ?? null,
      }
      console.log('[godentist] Saving history, workspace:', workspaceId, 'date:', data.date, 'count:', data.appointments.length, 'inconsistent:', isInconsistent)
      const { data: historyRow, error: historyError } = await admin
        .from('godentist_scrape_history')
        .insert(insertPayload)
        .select('id')
        .single()

      if (historyError) {
        console.error('[godentist] History insert FAILED:', JSON.stringify(historyError))
      } else {
        savedHistoryId = historyRow?.id
        console.log('[godentist] History saved:', savedHistoryId, 'inconsistent:', isInconsistent)
      }
    } catch (histErr) {
      console.error('[godentist] History save threw:', histErr)
    }

    return { data, historyId: savedHistoryId }
  } catch (err) {
    return { error: `Error conectando al robot: ${err instanceof Error ? err.message : String(err)}` }
  }
}
```

**Verificacion de tipos:**
- `ScrapeResult.totalCitas` debe estar declarado (Plan 05 lo agrega a la types del robot, pero el server-action puede tener su propia copia del tipo). Si TypeScript se queja, agregar `totalCitas?: number | null` al `interface ScrapeResult` local en `src/app/actions/godentist.ts` (busque con grep `interface ScrapeResult`).
- `inconsistency_details: Record<string, unknown> | null` — Supabase JSONB acepta `Record<string,unknown>`.

**Style notes:**
- Indent 2 espacios.
- Logging con prefix `[godentist]` (consistente con resto del archivo).
- `await` obligatorio en inngest.send (RESEARCH.md pitfall 8 + CLAUDE.md MEMORY).
- `(inngest.send as any)` (PATTERNS.md §Inngest Event Emission documenta esto como convencion del repo para custom events).
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-06-1.log | head -30; STATUS=$?; grep -c "use_new_godentist_scraping" src/app/actions/godentist.ts; grep -c "Paradigm A removed in standalone godentist-scraping-structural-v2" src/app/actions/godentist.ts; grep -c "if (!useNewScraping)" src/app/actions/godentist.ts; grep -c "const seen = new Set<string>()" src/app/actions/godentist.ts; grep -c "crossSedePhones" src/app/actions/godentist.ts; grep -c "inconsistency_details" src/app/actions/godentist.ts; grep -c "godentist/scrape.inconsistent" src/app/actions/godentist.ts; grep -c "await (inngest.send as any)" src/app/actions/godentist.ts; grep -c "total_citas" src/app/actions/godentist.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - `grep -c "getPlatformConfig<boolean>('use_new_godentist_scraping', true)" src/app/actions/godentist.ts` retorna `1` con fallback=true (D-10 mandate).
    - **Issue 3 (BLOCKER fix Option A) — flag-OFF early-return:** `grep -c "if (!useNewScraping)" src/app/actions/godentist.ts` retorna `1` (gate aborts before fetch).
    - **Issue 3 (BLOCKER fix Option A) — error message verbatim:** `grep -c "Paradigm A removed in standalone godentist-scraping-structural-v2" src/app/actions/godentist.ts` retorna `1` (operator gets explicit instructions on rollback path).
    - **Issue 3 (BLOCKER fix Option A) — no legacy fetch:** `grep -c "/api/scrape-appointments-legacy" src/app/actions/godentist.ts` retorna `0` (NO fetch to non-existent endpoint; flag OFF aborts cleanly).
    - **Issue 3 (BLOCKER fix Option A) — fetch only happens on flag ON:** The fetch call to `${ROBOT_URL}/api/scrape-appointments` MUST be inside the `try { ... }` block that follows the `if (!useNewScraping) return { error: ... }` early-return. Verifiable manually: line number of `if (!useNewScraping)` < line number of `await fetch(\`${ROBOT_URL}`.
    - `grep -c "const seen = new Set<string>()" src/app/actions/godentist.ts` retorna `1` (dedupe D-12).
    - `grep -c "\`\${apt.sucursal}|\${apt.telefono}|\${apt.hora}\`" src/app/actions/godentist.ts` retorna `1` (dedupe key per RESEARCH.md/PATTERNS verbatim).
    - `grep -c "const crossSedePhones" src/app/actions/godentist.ts` retorna `1` (D-08 canary).
    - `grep -c "isInconsistent" src/app/actions/godentist.ts` retorna al menos `3` (calc + payload + log).
    - `grep -c "await (inngest.send as any)" src/app/actions/godentist.ts` retorna al menos `1` (CRITICAL pitfall: await mandatory).
    - `grep -c "godentist/scrape.inconsistent" src/app/actions/godentist.ts` retorna `1`.
    - insertPayload incluye los 3 columns: `grep -c "inconsistent: isInconsistent\|inconsistency_details: inconsistencyDetails\|total_citas:" src/app/actions/godentist.ts` retorna `3`.
  </acceptance_criteria>

  <done>
    scrapeAppointments tiene: flag con default ON (kill-switch semantica abort-on-OFF — NO fetches legacy endpoint inexistente), dedupe D-12, canary D-08 con awaited inngest.send, history payload con 3 nuevos columns. tsc pasa.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Gatear sendConfirmations + scheduleReminders en el flag inconsistent del scrape (early-return)</name>

  <read_first>
    - src/app/actions/godentist.ts lineas 170-200 (sendConfirmations signature + apertura)
    - src/app/actions/godentist.ts lineas 641-680 (scheduleReminders signature + apertura)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §3 "sendConfirmations / scheduleReminders gating (D-08)" — snippet verbatim
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-08 (gate behavior)
  </read_first>

  <files>src/app/actions/godentist.ts</files>

  <action>
**Cambio 1 — sendConfirmations gate** (linea ~190, INMEDIATAMENTE DESPUES de la verificacion de apiKey y ANTES del loop `for (const apt of appointments)`):

Localizar el bloque (aproximadamente lineas 188-194):
```typescript
const apiKey = wsData?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
if (!apiKey) return { error: 'API key de WhatsApp no configurada' }

const fechaFormateada = formatDateSpanish(date)
```

Insertar INMEDIATAMENTE DESPUES de `if (!apiKey)...` y ANTES de `const fechaFormateada`:

```typescript

  // ── D-08: gate on scrape inconsistent flag (early-return) ──
  // Per CONTEXT.md D-08 + PATTERNS.md §3: if the scrape (looked up by historyId) was
  // flagged inconsistent by the canary in scrapeAppointments (Task 1), abort the send
  // before the loop to avoid spending DB reads per appointment. The check happens at
  // server-action entry; downstream fns trust the audit-trail flag (single source of truth).
  if (historyId) {
    const adminGate = createAdminClient()
    const { data: scrapeRow } = await adminGate
      .from('godentist_scrape_history')
      .select('inconsistent')
      .eq('id', historyId)
      .eq('workspace_id', workspaceId)
      .single()
    if (scrapeRow?.inconsistent) {
      console.error(`[godentist] sendConfirmations BLOCKED: scrape ${historyId} marked inconsistent`)
      return { error: 'Scrape marcado como inconsistent — envío bloqueado. Revisar diagnóstico del scrape antes de reintentar.' }
    }
  }

```

**Cambio 2 — scheduleReminders gate** (linea ~650, despues de la apertura/validacion y ANTES del loop principal):

Localizar el bloque inicial de `scheduleReminders` (aproximadamente lineas 641-660). Insertar la misma logica de gate inmediatamente despues de las verificaciones de auth/workspace/api-key (donde se aplique) y ANTES del loop sobre appointments:

```typescript

  // ── D-08: gate on scrape inconsistent flag (early-return) ──
  // Per CONTEXT.md D-08 + PATTERNS.md §3: same gate as sendConfirmations. If the
  // scrape is inconsistent, abort scheduling — don't queue reminders that will fire
  // tomorrow with bad data.
  if (historyId) {
    const adminGate = createAdminClient()
    const { data: scrapeRow } = await adminGate
      .from('godentist_scrape_history')
      .select('inconsistent')
      .eq('id', historyId)
      .eq('workspace_id', workspaceId)
      .single()
    if (scrapeRow?.inconsistent) {
      console.error(`[godentist] scheduleReminders BLOCKED: scrape ${historyId} marked inconsistent`)
      return { error: 'Scrape marcado como inconsistent — programación bloqueada. Revisar diagnóstico del scrape antes de reintentar.' }
    }
  }

```

**NOTA SOBRE EL RETORNO:** Verificar la shape de retorno de cada funcion. `sendConfirmations` retorna `{ error?: string; data?: SendResult }` — el `{ error: ... }` es compatible. `scheduleReminders` retorna `{ error?: string; data?: ... }` — confirmar con `grep -A 3 "^export async function scheduleReminders" src/app/actions/godentist.ts`.

**Pitfall a evitar (per PATTERNS.md §3 Risks/landmines):**
> Don't gate on crossSedePhones.length directly in send fns: use the persisted inconsistent column. The check happens in the server action; downstream fns should trust the audit-trail flag (single source of truth).

El gate lee `inconsistent` de la BD, NO recalcula cross-sede. Esto evita race conditions si el scrape se modifica entre escritura y lectura.

**Style notes:**
- Indent 2 espacios.
- `[godentist]` log prefix.
- Variable name `adminGate` (vs `admin` mas adelante en la funcion) para evitar shadow warning.
- Mensajes de error en espanol (consistente con resto del archivo).
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-06-2.log | head -20; TSC_STATUS=$?; echo "── tsc exit: $TSC_STATUS ──"; grep -c "Scrape marcado como inconsistent" src/app/actions/godentist.ts; grep -c "sendConfirmations BLOCKED" src/app/actions/godentist.ts; grep -c "scheduleReminders BLOCKED" src/app/actions/godentist.ts; grep -c "scrapeRow?.inconsistent" src/app/actions/godentist.ts; echo "── Ordering check: sendConfirmations gate BEFORE loop ──"; awk '/^export async function sendConfirmations/,/^export async function [a-z]/{print NR": "$0}' src/app/actions/godentist.ts > /tmp/sendconf.txt; SEND_GATE_LINE=$(grep -n "sendConfirmations BLOCKED" /tmp/sendconf.txt | head -1 | cut -d: -f1); SEND_LOOP_LINE=$(grep -n "for (const apt of appointments" /tmp/sendconf.txt | head -1 | cut -d: -f1); if [ -z "$SEND_GATE_LINE" ] || [ -z "$SEND_LOOP_LINE" ]; then echo "FAIL: sendConfirmations gate ($SEND_GATE_LINE) or loop ($SEND_LOOP_LINE) not found"; exit 1; fi; if [ "$SEND_GATE_LINE" -lt "$SEND_LOOP_LINE" ]; then echo "PASS sendConfirmations: gate@$SEND_GATE_LINE before loop@$SEND_LOOP_LINE"; else echo "FAIL sendConfirmations: gate@$SEND_GATE_LINE must precede loop@$SEND_LOOP_LINE"; exit 1; fi; echo "── Ordering check: scheduleReminders gate BEFORE loop ──"; awk '/^export async function scheduleReminders/,/^export async function [a-z]|^}$/{print NR": "$0}' src/app/actions/godentist.ts > /tmp/schedrem.txt; SCHED_GATE_LINE=$(grep -n "scheduleReminders BLOCKED" /tmp/schedrem.txt | head -1 | cut -d: -f1); SCHED_LOOP_LINE=$(grep -nE "for \(const (apt|appointment) " /tmp/schedrem.txt | head -1 | cut -d: -f1); if [ -z "$SCHED_GATE_LINE" ] || [ -z "$SCHED_LOOP_LINE" ]; then echo "FAIL: scheduleReminders gate ($SCHED_GATE_LINE) or loop ($SCHED_LOOP_LINE) not found"; exit 1; fi; if [ "$SCHED_GATE_LINE" -lt "$SCHED_LOOP_LINE" ]; then echo "PASS scheduleReminders: gate@$SCHED_GATE_LINE before loop@$SCHED_LOOP_LINE"; else echo "FAIL scheduleReminders: gate@$SCHED_GATE_LINE must precede loop@$SCHED_LOOP_LINE"; exit 1; fi; exit $TSC_STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - El mensaje de error gate aparece 2 veces (uno por funcion): `grep -c "Scrape marcado como inconsistent" src/app/actions/godentist.ts` retorna `2`.
    - Logs distintos por funcion: `grep -c "sendConfirmations BLOCKED" src/app/actions/godentist.ts` = 1 AND `grep -c "scheduleReminders BLOCKED" src/app/actions/godentist.ts` = 1.
    - `grep -c "scrapeRow?.inconsistent" src/app/actions/godentist.ts` retorna al menos `2`.
    - **Issue 4 fix — sectioned line-number ordering check:** Los gates SE UBICAN ANTES del loop principal en cada funcion. Verificable extrayendo el bloque de cada funcion via awk y comparando line-numbers:
      ```bash
      # sendConfirmations: gate must precede the appointments loop.
      awk '/^export async function sendConfirmations/,/^export async function [a-z]/{print NR": "$0}' src/app/actions/godentist.ts > /tmp/sendconf.txt
      SEND_GATE_LINE=$(grep -n "sendConfirmations BLOCKED" /tmp/sendconf.txt | head -1 | cut -d: -f1)
      SEND_LOOP_LINE=$(grep -n "for (const apt of appointments" /tmp/sendconf.txt | head -1 | cut -d: -f1)
      [ -n "$SEND_GATE_LINE" ] && [ -n "$SEND_LOOP_LINE" ] && [ "$SEND_GATE_LINE" -lt "$SEND_LOOP_LINE" ]  # PASS
      # scheduleReminders: gate must precede the appointments loop.
      awk '/^export async function scheduleReminders/,/^export async function [a-z]|^}$/{print NR": "$0}' src/app/actions/godentist.ts > /tmp/schedrem.txt
      SCHED_GATE_LINE=$(grep -n "scheduleReminders BLOCKED" /tmp/schedrem.txt | head -1 | cut -d: -f1)
      SCHED_LOOP_LINE=$(grep -nE "for \(const (apt|appointment) " /tmp/schedrem.txt | head -1 | cut -d: -f1)
      [ -n "$SCHED_GATE_LINE" ] && [ -n "$SCHED_LOOP_LINE" ] && [ "$SCHED_GATE_LINE" -lt "$SCHED_LOOP_LINE" ]  # PASS
      ```
      The check exits non-zero if gate or loop not found, OR if gate appears after loop. This rejects the failure mode "future edit places gate AFTER loop but greps still pass".
  </acceptance_criteria>

  <done>
    Ambos gates funcionando con lectura del flag `inconsistent` desde la BD (no recalculando cross-sede). tsc pasa. Si el scrape es inconsistent, sendConfirmations y scheduleReminders abortan con error en espanol. Line-number ordering verified (gate < loop en ambas fns).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Server-action <-> Robot Railway | Solo paradigm F endpoint `/api/scrape-appointments`. Flag OFF NO hace fetch a ningun endpoint (Issue 3 fix Option A — eliminado el path "fetch legacy 404" que ocultaria rollback fallido). Rollback REAL = git revert + redeploy. Documentado en SUMMARY + LEARNINGS. |
| Server-action <-> godentist_scrape_history | Lectura adicional por gate. ~50ms latency per send/schedule. Aceptable (run daily). |
| Server-action <-> Inngest | Nueva emision de event `godentist/scrape.inconsistent` (CRITICAL: awaited). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-06-01 | Tampering | Feature flag in platform_config | accept | Service-role-only access. Audit via updated_at. |
| T-v2-06-02 | Denial of service | Gate adds 1 DB read per sendConfirmations/scheduleReminders call | accept | <50ms latency. Happens once per scrape (not per appointment). Aceptable. |
| T-v2-06-03 | Information disclosure | inconsistency_details JSONB stores phone+sedes (PII) | mitigate | Solo accesible via service role. Misma superficie que appointments JSONB de la misma tabla (pre-existente). |
| T-v2-06-04 | Repudiation | Inngest event 'godentist/scrape.inconsistent' is audit trail | accept | Plan 07 logea a agent_observability_events. Trazabilidad assegurada. |
| T-v2-06-05 | Denial of service | Inngest send latency en el critical path del scrape | accept | Solo se ejecuta SI isInconsistent (rare per RESEARCH.md). Si dispara, ~100-300ms extra son aceptables porque el scrape ya esta bloqueado downstream. |
| T-v2-06-06 | Spoofing / silent failure | Rollback via flag OFF cuando endpoint legacy no existe (Issue 3 root cause) | mitigate | **Resuelto en Option A:** flag OFF retorna error explicito SIN fetch. No hay 404 silencioso que confunda al operador. El mensaje del error apunta al rollback REAL (git revert + redeploy). El operador NO puede creer que rollback funciono cuando no funciono. |
| T-v2-06-07 | Operational confusion | Operator expects flag OFF to revert behavior to old code | mitigate | Comentarios in-line en el code + LEARNINGS.md + Plan 02 comment documentan: flag OFF = ABORT, no fallback. Rollback = git revert. Operator playbook claro. |
</threat_model>

<verification>
- npx tsc --noEmit pasa.
- 3 defenses inyectadas en scrapeAppointments (flag con kill-switch semantica abort-on-OFF, dedupe, canary).
- 2 gates en sendConfirmations y scheduleReminders, verificados con line-number ordering (gate < loop).
- await inngest.send (no fire-and-forget).
- insertPayload tiene 3 nuevos campos (inconsistent, inconsistency_details, total_citas).
- Style verbatim (logs con `[godentist]`, mensajes en espanol).
- NO referencia a `/api/scrape-appointments-legacy` (Issue 3 fix Option A — endpoint inexistente eliminado del codigo).
</verification>

<success_criteria>
- [ ] Task 1: scrapeAppointments con flag/dedupe/canary + history payload con 3 columns. Flag OFF aborta limpio.
- [ ] Task 2: sendConfirmations + scheduleReminders gated en inconsistent flag, con line-number ordering check.
- [ ] tsc --noEmit pasa.
- [ ] inngest.send awaited (CRITICAL pitfall).
- [ ] Sin push a Vercel todavia (push unificado en Plan 11).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/06-SUMMARY.md` con:
- Lista de cambios por funcion.
- Output tsc --noEmit.
- **Nota Option A (Issue 3 fix):** "Flag OFF = ABORT con error explicito. NO fetches a `/api/scrape-appointments-legacy` (endpoint inexistente post-Plan 05). Rollback REAL a paradigma A = git revert del commit del standalone + redeploy. Operator playbook: si paradigma F falla en prod, flipear flag OFF (SQL `UPDATE platform_config SET value='false'::jsonb WHERE key='use_new_godentist_scraping'`) detiene nuevos scrapes en ≤30s, entonces decidir si hotfix o git revert."
- Nota: "Plan 07 (Inngest receiver) puede ahora consumir el evento `godentist/scrape.inconsistent`."
</output>
</content>
