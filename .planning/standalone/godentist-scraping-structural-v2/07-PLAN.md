---
phase: godentist-scraping-structural-v2
plan: 07
type: execute
wave: 3
depends_on: [06]
files_modified:
  - src/inngest/functions/godentist-scrape-inconsistent.ts
  - src/inngest/events.ts
  - src/app/api/inngest/route.ts
autonomous: true
requirements:
  - D-08

must_haves:
  truths:
    - "Existe el archivo src/inngest/functions/godentist-scrape-inconsistent.ts exportando godentistScrapeInconsistent creado via inngest.createFunction con id godentist-scrape-inconsistent"
    - "La funcion escucha el event 'godentist/scrape.inconsistent' y loguea via createModuleLogger + escribe a agent_observability_events"
    - "La funcion tiene concurrency limit per workspaceId (single-flight) y retries: 1"
    - "src/inngest/events.ts incluye el event type 'godentist/scrape.inconsistent' dentro del type GodentistEvents con los campos workspaceId, scrapedDate, crossSedePhones, detectedAt"
    - "src/app/api/inngest/route.ts importa godentistScrapeInconsistent y lo registra en el functions array"
    - "TypeScript compila sin errores"
  artifacts:
    - path: "src/inngest/functions/godentist-scrape-inconsistent.ts"
      provides: "Inngest function que recibe el event D-08 cross-sede canary y loguea forensics"
      contains:
        - "export const godentistScrapeInconsistent"
        - "godentist-scrape-inconsistent"
        - "godentist/scrape.inconsistent"
        - "agent_observability_events"
        - "createModuleLogger"
    - path: "src/inngest/events.ts"
      provides: "Type declaration del event 'godentist/scrape.inconsistent' dentro de GodentistEvents"
      contains:
        - "'godentist/scrape.inconsistent'"
        - "crossSedePhones"
        - "scrapedDate"
    - path: "src/app/api/inngest/route.ts"
      provides: "Registracion de godentistScrapeInconsistent en el endpoint /api/inngest"
      contains:
        - "godentistScrapeInconsistent"
  key_links:
    - from: "src/inngest/functions/godentist-scrape-inconsistent.ts"
      to: "src/inngest/events.ts (event type) + src/app/api/inngest/route.ts (registration) + agent_observability_events table"
      via: "inngest.createFunction + supabase insert"
      pattern: "inngest.createFunction|agent_observability_events"
---

<objective>
Cerrar el ciclo de D-08 cross-sede canary: el server-action (Plan 06) emite `godentist/scrape.inconsistent`; este plan crea el receiver que loguea + persiste a `agent_observability_events`. Patron 1:1 copiado de `src/inngest/functions/bold-upstream-broken.ts` (analog exact).

Purpose: CONTEXT.md D-08 mandata "Inngest event nuevo godentist/scrape.inconsistent con handler que loguea + (futuro) notifica". V1 = logger only (mismo punto que bold-upstream-broken). WhatsApp/email notification queda TODO documentado, no bloquea V1 de este standalone.

Por que separar de Plan 06: el receiver puede deployarse independientemente del server-action (route.ts es un archivo distinto + functions array). Permite verificar el handler en isolation sin race con cambios del server-action.

Output: 1 archivo nuevo + 2 archivos modificados con cambios minimos (event type + registration). ~70 lineas nuevas total.
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
<!-- Analog file (verbatim shape) src/inngest/functions/bold-upstream-broken.ts -->
```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('bold-upstream-broken')

export const boldUpstreamBroken = inngest.createFunction(
  {
    id: 'bold-upstream-broken',
    name: 'Bold Upstream Broken — Telemetry Receiver',
    retries: 1,
    concurrency: [{ key: '"bold-upstream-broken"', limit: 1 }],  // global single-flight
  },
  { event: 'bold-robot/upstream-broken' },
  async ({ event, step }) => {
    const { failureCount, lastError, detectedAt } = event.data
    logger.warn({ ... }, 'Bold robot upstream broken')

    const supabase = createAdminClient()
    await step.run('log-to-observability', async () => {
      await supabase.from('agent_observability_events').insert({ ... })
    })

    return { alerted: true }
  },
)
```

<!-- Existing GodentistEvents type (src/inngest/events.ts line 658) -->
```typescript
export type GodentistEvents = {
  'godentist/reminder.send': { data: { ... } }
  'godentist/tag.remove_scheduled': { data: { ... } }
  'godentist/followup.check': { data: { ... } }
}
```
<!-- AllAgentEvents at line 925 already concatenates GodentistEvents — no edit needed if adding INSIDE GodentistEvents -->

<!-- Existing route.ts registration (src/app/api/inngest/route.ts lines 39 + 88) -->
```typescript
import { boldUpstreamBroken } from '@/inngest/functions/bold-upstream-broken'
// ... line 88:
boldUpstreamBroken,  // Standalone: bold-auth0-migration (D-07 — telemetry receiver)
```

<!-- agent_observability_events table shape (existing in repo) -->
```sql
agent_observability_events (
  workspace_id UUID,
  event_type TEXT,
  agent_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear archivo src/inngest/functions/godentist-scrape-inconsistent.ts (clonado de bold-upstream-broken.ts)</name>

  <read_first>
    - src/inngest/functions/bold-upstream-broken.ts (analog EXACTO, leer completo)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §5 "New Inngest function: godentist-scrape-inconsistent" (snippet verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-08 (handler behavior)
  </read_first>

  <files>src/inngest/functions/godentist-scrape-inconsistent.ts</files>

  <action>
Crear archivo nuevo `src/inngest/functions/godentist-scrape-inconsistent.ts` con el siguiente contenido EXACTO:

```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('godentist-scrape-inconsistent')

/**
 * Per CONTEXT.md D-08 + RESEARCH.md Pattern 4 (cross-sede canary):
 * Receives the event emitted by src/app/actions/godentist.ts:scrapeAppointments
 * when a (phone) appears in >1 sede within the same scrape — indicates paradigm F
 * invariant violated (correctness by construction failed).
 *
 * V1 behavior: log + persist to agent_observability_events for forensics.
 * V1 does NOT send WhatsApp/email alert — mirrors bold-upstream-broken.ts which
 * also punts notification to TODO. The developer monitors via Inngest dashboard
 * + agent_observability_events query.
 *
 * Concurrency: single-flight per workspace to avoid spam if multiple scrapes
 * fire in flight (e.g., manual user-triggered scrape concurrent with cron).
 */
export const godentistScrapeInconsistent = inngest.createFunction(
  {
    id: 'godentist-scrape-inconsistent',
    name: 'GoDentist Scrape Inconsistent — Cross-Sede Canary Receiver',
    retries: 1,
    concurrency: [{ key: 'event.data.workspaceId', limit: 1 }],
  },
  { event: 'godentist/scrape.inconsistent' },
  async ({ event, step }) => {
    const { workspaceId, scrapedDate, crossSedePhones, detectedAt } = event.data

    logger.warn(
      {
        workspaceId,
        scrapedDate,
        crossSedePhonesCount: crossSedePhones.length,
        detectedAt,
      },
      'GoDentist scrape detected cross-sede contamination — D-07 invariant violated (paradigm F has a grieta)',
    )

    const supabase = createAdminClient()

    await step.run('log-to-observability', async () => {
      const { error } = await supabase.from('agent_observability_events').insert({
        workspace_id: workspaceId,
        event_type: 'godentist_scrape_inconsistent',
        agent_id: 'godentist-robot',
        payload: {
          scrapedDate,
          crossSedePhones,
          detectedAt,
          phonesAffected: crossSedePhones.length,
        },
      })
      if (error) {
        logger.error({ error: error.message, workspaceId, scrapedDate }, 'Failed to insert observability event')
      }
    })

    // TODO follow-up: notify developer via WhatsApp/email when notification path stabilizes.
    // Currently mirrors bold-upstream-broken.ts which also keeps notify as TODO.

    return {
      alerted: true,
      phonesAffected: crossSedePhones.length,
      workspaceId,
    }
  },
)
```

**Style notes:**
- 2-espacios indent.
- Punto y coma final (consistente con TS del repo morfx — distinto del robot adapter que no usa `;`).
- Logger via `createModuleLogger('godentist-scrape-inconsistent')` (analog 1:1 a bold).
- JSDoc obligatorio en symbols exportados.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-07-1.log | head -20; STATUS=$?; test -f src/inngest/functions/godentist-scrape-inconsistent.ts; grep -c "export const godentistScrapeInconsistent" src/inngest/functions/godentist-scrape-inconsistent.ts; grep -c "id: 'godentist-scrape-inconsistent'" src/inngest/functions/godentist-scrape-inconsistent.ts; grep -c "event: 'godentist/scrape.inconsistent'" src/inngest/functions/godentist-scrape-inconsistent.ts; grep -c "concurrency.*event.data.workspaceId" src/inngest/functions/godentist-scrape-inconsistent.ts; grep -c "agent_observability_events" src/inngest/functions/godentist-scrape-inconsistent.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - Archivo existe: `test -f src/inngest/functions/godentist-scrape-inconsistent.ts`.
    - `grep -c "export const godentistScrapeInconsistent" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "id: 'godentist-scrape-inconsistent'" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "event: 'godentist/scrape.inconsistent'" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "concurrency: \[{ key: 'event.data.workspaceId', limit: 1 }\]" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "retries: 1" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "agent_observability_events" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
    - `grep -c "createModuleLogger" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1` (import).
    - `grep -c "createAdminClient" src/inngest/functions/godentist-scrape-inconsistent.ts` retorna `1`.
  </acceptance_criteria>

  <done>
    Archivo nuevo creado, exporta godentistScrapeInconsistent, sigue patron exact de bold-upstream-broken.ts. tsc pasa.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar el event type 'godentist/scrape.inconsistent' al GodentistEvents en src/inngest/events.ts</name>

  <read_first>
    - src/inngest/events.ts lineas 655-705 (GodentistEvents type completo + analog godentist/reminder.send)
    - src/inngest/events.ts lineas 905-930 (BoldRobotEvents + AllAgentEvents — verificar que ya concatena GodentistEvents)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §6 (snippet verbatim)
  </read_first>

  <files>src/inngest/events.ts</files>

  <action>
**Localizar el type `GodentistEvents` (linea 658). Agregar el siguiente miembro DENTRO del objeto (no fuera). Insertar DESPUES del ultimo miembro existente (presumiblemente `'godentist/followup.check'` linea ~694-700) y ANTES de la closing brace `}` del type:**

```typescript
  /**
   * Per CONTEXT.md D-08 + RESEARCH.md Pattern 4: emitted by
   * src/app/actions/godentist.ts:scrapeAppointments when the cross-sede canary
   * detects (phone) appearing in >1 sede within the same scrape. Indicates D-07
   * invariant violated (paradigm F has a grieta in production).
   *
   * Consumed by src/inngest/functions/godentist-scrape-inconsistent.ts which
   * logs to agent_observability_events. sendConfirmations + scheduleReminders
   * abort if the scrape row has inconsistent=true.
   */
  'godentist/scrape.inconsistent': {
    data: {
      workspaceId: string
      scrapedDate: string  // YYYY-MM-DD
      crossSedePhones: Array<{ phone: string; sedes: string[] }>
      detectedAt: string  // ISO timestamp
    }
  }
```

**IMPORTANTE — coma:** TypeScript object types soportan miembros separados por `;` o `,`. Verificar la convencion del archivo con `grep -A 5 "'godentist/followup.check'" src/inngest/events.ts` y matchear el separator (probablemente sin trailing comma — confirmar). Si el ultimo miembro existente no tiene trailing comma, agregar coma DESPUES del miembro previo antes del nuevo miembro insertado.

**NO modificar:**
- AllAgentEvents (linea ~925): ya concatena GodentistEvents — sin edit necesario.
- Otros types.

**Style notes:**
- Indent matchea el archivo (probablemente 2 espacios).
- JSDoc obligatorio.
- Type Array<{...}> consistente con sintaxis del resto del file.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-07-2.log | head -20; STATUS=$?; grep -c "'godentist/scrape.inconsistent'" src/inngest/events.ts; grep -c "crossSedePhones: Array<{ phone: string; sedes: string\[\] }>" src/inngest/events.ts; grep -c "scrapedDate" src/inngest/events.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - `grep -c "'godentist/scrape.inconsistent'" src/inngest/events.ts` retorna `1`.
    - `grep -c "crossSedePhones: Array<{ phone: string; sedes: string\[\] }>" src/inngest/events.ts` retorna `1`.
    - El miembro nuevo esta DENTRO de GodentistEvents (no como type top-level nuevo): verificable con `awk '/^export type GodentistEvents = {/{a=NR} /^}/{if(a){print "GodentistEvents at:", a, "closes at:", NR; exit}}' src/inngest/events.ts` + el match de `'godentist/scrape.inconsistent'` esta entre esas dos lineas.
    - `grep -c "scrapedDate" src/inngest/events.ts` retorna al menos `1`.
    - AllAgentEvents NO se modifico (ya concatena GodentistEvents): `grep -c "GodentistEvents" src/inngest/events.ts` retorna al menos `2` (declaracion + union).
  </acceptance_criteria>

  <done>
    Event type agregado dentro de GodentistEvents. tsc pasa. AllAgentEvents inalterado (ya concatena GodentistEvents).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Registrar godentistScrapeInconsistent en src/app/api/inngest/route.ts</name>

  <read_first>
    - src/app/api/inngest/route.ts COMPLETO (verificar structure de imports + functions array)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §6 (snippet verbatim — 2 lineas)
  </read_first>

  <files>src/app/api/inngest/route.ts</files>

  <action>
**Cambio 1 — Import (cerca de linea 39, junto con otros imports de Inngest functions):**

Localizar la linea:
```typescript
import { boldUpstreamBroken } from '@/inngest/functions/bold-upstream-broken'
```

Insertar INMEDIATAMENTE DESPUES:
```typescript
import { godentistScrapeInconsistent } from '@/inngest/functions/godentist-scrape-inconsistent'
```

**Cambio 2 — Registracion en functions array (cerca de linea 88):**

Localizar la linea:
```typescript
boldUpstreamBroken,  // Standalone: bold-auth0-migration (D-07 — telemetry receiver)
```

Insertar INMEDIATAMENTE DESPUES:
```typescript
godentistScrapeInconsistent,  // Standalone: godentist-scraping-structural-v2 (D-08 — cross-sede canary receiver)
```

**Style notes:**
- Indent matchea el archivo (probablemente 4 espacios para items del array).
- Trailing comma incluido (consistente con resto del array — verificar).
- Comentario inline explicativo (analog: bold-upstream-broken tiene su propio comentario).

**NO modificar:**
- Otros imports.
- Otros items del array.
- Inngest serve config.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-07-3.log | head -20; STATUS=$?; grep -c "import { godentistScrapeInconsistent }" src/app/api/inngest/route.ts; grep -c "godentistScrapeInconsistent," src/app/api/inngest/route.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - `grep -c "import { godentistScrapeInconsistent } from '@/inngest/functions/godentist-scrape-inconsistent'" src/app/api/inngest/route.ts` retorna `1`.
    - `grep -c "godentistScrapeInconsistent" src/app/api/inngest/route.ts` retorna al menos `2` (import + registration).
    - Posicion en el array: la linea con `godentistScrapeInconsistent,` aparece DESPUES de la linea con `boldUpstreamBroken,`. Verificable con: `awk '/boldUpstreamBroken,/{a=NR} /godentistScrapeInconsistent,/{b=NR; print "bold at:", a, "godentist at:", b; exit}' src/app/api/inngest/route.ts` muestra b > a.
  </acceptance_criteria>

  <done>
    godentistScrapeInconsistent registrada en /api/inngest endpoint. tsc pasa. La function existira en el dashboard Inngest tras deploy.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inngest event bus <-> Inngest function | Standard Inngest contract. Sin nueva superficie. |
| Inngest function <-> agent_observability_events | Insert row con service role. Sin RLS bypass risk (intent). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-07-01 | Tampering | Event payload tampering | accept | Inngest signed events + service role solo dentro del proceso. No HTTP external. |
| T-v2-07-02 | Denial of service | Spam de events si canary dispara repetidamente | mitigate | Concurrency limit per workspaceId = single-flight. Un canary no puede generar mas de 1 handler invocation a la vez por workspace. |
| T-v2-07-03 | Information disclosure | PII (phones) almacenados en agent_observability_events payload | accept | Misma surface que otros payload JSONB de la tabla. Acceso solo service role. |
| T-v2-07-04 | Repudiation | Trail para forensics | accept | Logger + observability insert = audit trail completo. |
</threat_model>

<verification>
- tsc --noEmit pasa.
- Archivo nuevo godentist-scrape-inconsistent.ts existe y matchea pattern de bold-upstream-broken.
- Event type agregado dentro de GodentistEvents.
- Function registrada en route.ts functions array.
- Inngest dashboard mostrara la nueva function tras deploy (Plan 11).
</verification>

<success_criteria>
- [ ] Task 1: Archivo godentist-scrape-inconsistent.ts creado.
- [ ] Task 2: Event type agregado a events.ts dentro de GodentistEvents.
- [ ] Task 3: Function registrada en route.ts.
- [ ] tsc --noEmit pasa.
- [ ] Sin push a Vercel todavia (push unificado en Plan 11).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/07-SUMMARY.md` con:
- Lista de los 3 cambios.
- Output tsc --noEmit.
- Nota: "WhatsApp/email notification queda TODO V1.1. Por ahora, forensics via Inngest dashboard + SELECT FROM agent_observability_events WHERE event_type='godentist_scrape_inconsistent'."
</output>
</content>
</invoke>