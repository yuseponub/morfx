---
phase: godentist-scraping-structural-v2
plan: 08
type: execute
wave: 4
depends_on: [01, 06]
files_modified:
  - src/app/actions/godentist.ts
autonomous: true
requirements:
  - D-04

must_haves:
  truths:
    - "Existe una nueva exported async function getScheduledRemindersGroupedByScrape(dateFilter?: string) en src/app/actions/godentist.ts"
    - "La funcion retorna { error?, data?: ScrapeWithReminders[], orphans?: ScheduledReminderEntry[] } donde ScrapeWithReminders incluye scrape (con inconsistent + inconsistency_details), reminders[], stats { pending, sent, failed, cancelled }"
    - "La query reuses el auth+cookie+workspaceId pattern existente del archivo (lineas 108-115)"
    - "La query filtra siempre por workspace_id en ambas tablas (godentist_scheduled_reminders + godentist_scrape_history)"
    - "La query soporta orphans bucket (reminders con scrape_history_id IS NULL — data legacy pre-D-09)"
    - "ScrapeWithReminders type es EXPORTED para que la UI lo importe en Plan 09"
    - "TypeScript compila sin errores"
  artifacts:
    - path: "src/app/actions/godentist.ts"
      provides: "getScheduledRemindersGroupedByScrape server-action + ScrapeWithReminders exported type"
      contains:
        - "export interface ScrapeWithReminders"
        - "export async function getScheduledRemindersGroupedByScrape"
        - "byScrapeId"
        - "orphans"
        - "scrape_history_id"
        - "inconsistent"
        - "inconsistency_details"
  key_links:
    - from: "getScheduledRemindersGroupedByScrape"
      to: "godentist_scheduled_reminders + godentist_scrape_history tables (joined in 2 steps)"
      via: "admin.from(...).select"
      pattern: "godentist_scheduled_reminders|godentist_scrape_history"
    - from: "ScrapeWithReminders type (exported)"
      to: "UI tab programacion (Plan 09)"
      via: "import"
      pattern: "export interface ScrapeWithReminders"
---

<objective>
Crear la query nueva `getScheduledRemindersGroupedByScrape` en `src/app/actions/godentist.ts` que la UI tab "programacion" (Plan 09) consumira para mostrar cards-por-scrape replicando el patron del tab "Historial Confirmaciones" (D-04 mandato).

Logica de la query (per PATTERNS.md §4):
1. Fetch reminders (workspace-scoped, opcionalmente filtrado por fecha_cita).
2. Collect distinct scrape_history_ids no-null.
3. Fetch scrape rows en otra query (workspace-scoped) — incluye `inconsistent`, `inconsistency_details`, `total_citas`, `created_at`, `sucursales`, `total_appointments`.
4. Group reminders por scrape_history_id. Reminders con `scrape_history_id IS NULL` van al bucket `orphans` (data legacy).
5. Calcular stats {pending, sent, failed, cancelled} por scrape.
6. Sort by scrape.created_at DESC (mas reciente primero).
7. Retornar `{ data: ScrapeWithReminders[], orphans: ScheduledReminderEntry[] }`.

Purpose: La UI actual del tab programacion (lineas 798-880+ de confirmaciones-panel.tsx) es flat-list. CONTEXT.md D-04 mandata cards-por-scrape replicando el patron del tab Historial Confirmaciones. La query es el back-end de ese rediseno. El componente UI viene en Plan 09.

Output: ~80 lineas de codigo nuevo en src/app/actions/godentist.ts. Sin commit todavia.
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
<!-- Existing getScheduledReminders signature (line 782) — analog for auth/workspace/admin pattern -->
```typescript
export async function getScheduledReminders(fechaCita?: string): Promise<{ error?: string; data?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }
  const admin = createAdminClient()
  let q = admin.from('godentist_scheduled_reminders').select('...').eq('workspace_id', workspaceId)
  if (fechaCita) q = q.eq('fecha_cita', fechaCita)
  const { data, error } = await q.order('scheduled_at', { ascending: true }).limit(500)
  if (error) return { error: error.message }
  return { data: data as ScheduledReminderEntry[] }
}
```

<!-- Existing ScheduledReminderEntry type (search in file) -->
```typescript
interface ScheduledReminderEntry {
  id: string
  nombre: string
  telefono: string
  hora_cita: string
  sucursal: string
  fecha_cita: string
  scheduled_at: string
  status: string  // 'pending' | 'sent' | 'failed' | 'cancelled'
  error?: string | null
  sent_at?: string | null
  created_at: string
  scrape_history_id?: string | null  // FK (nullable for legacy rows)
}
```

<!-- Existing getFollowupPreview pattern (lines 835-880) — analog for 2-step join -->
```typescript
// Step 1: fetch scrape row by id (workspace-scoped)
// Step 2: process and return
```

<!-- godentist_scrape_history schema (post-Plan 01 migration) -->
- id, workspace_id, scraped_date, sucursales (TEXT[]), appointments (JSONB), total_appointments, created_at
- send_results JSONB, sent_at, followup_results JSONB, followup_sent_at
- inconsistent BOOLEAN NOT NULL DEFAULT false  (NEW Plan 01)
- inconsistency_details JSONB                  (NEW Plan 01)
- total_citas INTEGER                          (NEW Plan 01)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar interface ScrapeWithReminders + funcion getScheduledRemindersGroupedByScrape al server-action</name>

  <read_first>
    - src/app/actions/godentist.ts lineas 1-50 (imports + interface ScheduledReminderEntry)
    - src/app/actions/godentist.ts lineas 782-820 (getScheduledReminders — analog auth/workspace pattern + select columns)
    - src/app/actions/godentist.ts lineas 835-880 (getFollowupPreview — analog 2-step query pattern)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §4 (snippet verbatim completo)
  </read_first>

  <files>src/app/actions/godentist.ts</files>

  <action>
**Cambio 1 — Agregar interface `ScrapeWithReminders` (cerca de las otras interfaces, ANTES de `scrapeAppointments` linea 108 — buscar `interface ScheduledReminderEntry` y agregar despues):**

```typescript

/**
 * Per CONTEXT.md D-04: shape consumed by UI tab "programacion" (Plan 09).
 * Replicates the cards-por-scrape pattern of tab "Historial Confirmaciones"
 * (confirmaciones-panel.tsx lines 680-792).
 *
 * Includes the inconsistent flag + inconsistency_details so the UI can render
 * a red AlertTriangle badge when D-08 canary fired (also blocks downstream sends).
 */
export interface ScrapeWithReminders {
  scrape: {
    id: string
    scraped_date: string
    sucursales: string[]
    total_appointments: number
    created_at: string
    inconsistent: boolean
    inconsistency_details: Record<string, unknown> | null
    total_citas: number | null
  }
  reminders: ScheduledReminderEntry[]
  stats: {
    pending: number
    sent: number
    failed: number
    cancelled: number
  }
}
```

**Cambio 2 — Agregar la funcion server-action.** Localizar la funcion `getScheduledReminders` (linea ~782). Insertar la nueva funcion `getScheduledRemindersGroupedByScrape` INMEDIATAMENTE DESPUES de `getScheduledReminders` (despues de su closing brace).

```typescript

/**
 * Per CONTEXT.md D-04 + PATTERNS.md §4: returns reminders grouped by their
 * source scrape, with per-scrape stats and the inconsistent flag. UI tab
 * "programacion" (Plan 09) consumes this to render cards-per-scrape replicating
 * the tab "Historial Confirmaciones" pattern.
 *
 * Workspace-scoped (CLAUDE.md REGLA 3). Returns orphans bucket for reminders
 * with scrape_history_id IS NULL (legacy data pre-Plan 01).
 *
 * @param dateFilter — optional YYYY-MM-DD filter on godentist_scheduled_reminders.fecha_cita.
 *                     If omitted, returns ALL workspace reminders up to limit.
 */
export async function getScheduledRemindersGroupedByScrape(
  dateFilter?: string,
): Promise<{ error?: string; data?: ScrapeWithReminders[]; orphans?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()

  // Step 1: fetch reminders, workspace-scoped, optionally date-filtered.
  let remQuery = admin
    .from('godentist_scheduled_reminders')
    .select('id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at, scrape_history_id')
    .eq('workspace_id', workspaceId)
  if (dateFilter) remQuery = remQuery.eq('fecha_cita', dateFilter)
  const { data: rems, error: remErr } = await remQuery
    .order('scheduled_at', { ascending: true })
    .limit(2000)  // wider than flat getScheduledReminders (500) since grouped covers wider date range
  if (remErr) return { error: remErr.message }

  // Step 2: collect distinct scrape_history_ids, fetch scrape rows in one batch.
  const scrapeIds = [...new Set((rems || [])
    .map(r => r.scrape_history_id)
    .filter((id): id is string => Boolean(id))
  )]

  let scrapes: Array<{
    id: string
    scraped_date: string
    sucursales: string[]
    total_appointments: number
    created_at: string
    inconsistent: boolean
    inconsistency_details: Record<string, unknown> | null
    total_citas: number | null
  }> = []

  if (scrapeIds.length > 0) {
    const { data: scrapeRows, error: scrapeErr } = await admin
      .from('godentist_scrape_history')
      .select('id, scraped_date, sucursales, total_appointments, created_at, inconsistent, inconsistency_details, total_citas')
      .in('id', scrapeIds)
      .eq('workspace_id', workspaceId)
    if (scrapeErr) return { error: scrapeErr.message }
    scrapes = (scrapeRows || []) as typeof scrapes
  }

  // Step 3: group reminders by scrape_history_id; collect orphans (NULL FK).
  const byScrapeId = new Map<string, ScheduledReminderEntry[]>()
  const orphans: ScheduledReminderEntry[] = []
  for (const r of (rems || []) as ScheduledReminderEntry[]) {
    if (!r.scrape_history_id) {
      orphans.push(r)
      continue
    }
    if (!byScrapeId.has(r.scrape_history_id)) byScrapeId.set(r.scrape_history_id, [])
    byScrapeId.get(r.scrape_history_id)!.push(r)
  }

  // Step 4: build ScrapeWithReminders entries with stats per scrape.
  const grouped: ScrapeWithReminders[] = []
  for (const scrape of scrapes) {
    const scrapeReminders = byScrapeId.get(scrape.id) || []
    const stats = { pending: 0, sent: 0, failed: 0, cancelled: 0 }
    for (const r of scrapeReminders) {
      if (r.status === 'pending') stats.pending++
      else if (r.status === 'sent') stats.sent++
      else if (r.status === 'failed') stats.failed++
      else if (r.status === 'cancelled') stats.cancelled++
    }
    grouped.push({ scrape, reminders: scrapeReminders, stats })
  }

  // Step 5: sort by scrape.created_at DESC (most recent first).
  grouped.sort((a, b) => b.scrape.created_at.localeCompare(a.scrape.created_at))

  return { data: grouped, orphans }
}
```

**Style notes:**
- Indent 2 espacios.
- Punto y coma final (consistente con resto del archivo).
- JSDoc obligatorio.
- Type narrowing con `id is string` para satisfacer TS estricto.
- `as typeof scrapes` para cast del select (Supabase JS client retorna shape generico).
- `byScrapeId.get(...)!` non-null assertion despues de `has()` check (consistente con resto del file — verificar).
- Mensajes de error en espanol (consistente).
- limit(2000) consciente: la flat fn usa limit(500) pero la grouped cubre fechas wider — cap a 2000 evita runaway queries.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-08-1.log | head -30; STATUS=$?; grep -c "export interface ScrapeWithReminders" src/app/actions/godentist.ts; grep -c "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts; grep -c "const byScrapeId = new Map" src/app/actions/godentist.ts; grep -c "orphans: ScheduledReminderEntry\[\] = \[\]" src/app/actions/godentist.ts; grep -c "inconsistency_details" src/app/actions/godentist.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - `grep -c "export interface ScrapeWithReminders" src/app/actions/godentist.ts` retorna `1`.
    - `grep -c "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts` retorna `1`.
    - Auth/workspace pattern presente: `grep -A 8 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c "morfx_workspace"` retorna `1`.
    - 2-step query (no nested joins): `grep -c "from('godentist_scheduled_reminders')" src/app/actions/godentist.ts` retorna al menos `2` (getScheduledReminders + getScheduledRemindersGroupedByScrape) AND `grep -A 50 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c "from('godentist_scrape_history')"` retorna `1`.
    - workspace_id filter en ambas queries: `grep -A 70 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c ".eq('workspace_id', workspaceId)"` retorna `2`.
    - Orphans bucket presente: `grep -c "const orphans: ScheduledReminderEntry\[\]" src/app/actions/godentist.ts` retorna `1`.
    - Stats calculation: `grep -A 80 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c "pending: 0, sent: 0, failed: 0, cancelled: 0"` retorna `1`.
    - Sort DESC: `grep -A 90 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c "b.scrape.created_at.localeCompare(a.scrape.created_at)"` retorna `1`.
    - inconsistent + inconsistency_details + total_citas en select: `grep -A 50 "export async function getScheduledRemindersGroupedByScrape" src/app/actions/godentist.ts | grep -c "inconsistent, inconsistency_details, total_citas"` retorna `1`.
  </acceptance_criteria>

  <done>
    Interface + funcion exportadas. tsc pasa. Plan 09 puede ahora importar ambos.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI client <-> Server action | Server action solo accessible via authenticated user + workspace cookie. Sin nueva superficie. |
| Server action <-> Postgres | 2 queries con workspace_id filter en cada una. Sin JOIN nativo (evita Supabase nested-select edge cases per PATTERNS §4). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-08-01 | Information disclosure | Server action exposes reminder data + scrape audit | accept | Auth+workspace gate consistente con resto del file. CLAUDE.md REGLA 3 satisfecho. |
| T-v2-08-02 | Denial of service | limit(2000) en main query | mitigate | Cap explicito previene runaway. Worst-case 2000 rows = ~200KB JSON. Aceptable. |
| T-v2-08-03 | Information disclosure | inconsistency_details JSONB visible al operador via UI | accept | Operador es dueno del workspace (auth gate). Misma surface que appointments JSONB del mismo scrape (pre-existente). |
</threat_model>

<verification>
- tsc --noEmit pasa.
- Interface + funcion exportadas.
- 2-step query workspace-scoped en ambas tablas.
- Orphans bucket + stats + sort DESC.
</verification>

<success_criteria>
- [ ] Task 1: Interface ScrapeWithReminders + funcion getScheduledRemindersGroupedByScrape agregadas y exportadas.
- [ ] tsc --noEmit pasa.
- [ ] Sin push a Vercel todavia.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/08-SUMMARY.md` con:
- Path absoluto + line ranges del interface y la funcion nuevas.
- Output tsc --noEmit.
- Nota: "Plan 09 puede ahora redisenar el tab programacion consumiendo getScheduledRemindersGroupedByScrape + tipo ScrapeWithReminders."
</output>
</content>
</invoke>