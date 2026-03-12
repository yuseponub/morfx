---
phase: standalone/godentist-scraping-general
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
autonomous: false

must_haves:
  truths:
    - "Host can select any date (today, tomorrow, or calendar) before scraping"
    - "After scrape preview, host chooses between sending confirmations or scheduling reminders"
    - "Programacion tab shows pending reminders with cancel button"
    - "Programacion tab shows history of sent/failed/cancelled reminders"
    - "All timestamps in the UI display in Colombia timezone"
  artifacts:
    - path: "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
      provides: "Date picker, action selector, Programacion tab, timezone fix"
      min_lines: 900
  key_links:
    - from: "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
      to: "src/app/actions/godentist.ts"
      via: "imports scheduleReminders, getScheduledReminders, cancelScheduledReminder"
      pattern: "import.*scheduleReminders.*from.*godentist"
---

<objective>
Add date picker, post-scrape action selector (confirm vs schedule reminders), new Programacion tab, and fix timezone display across the entire confirmaciones panel.

Purpose: The host can scrape any date, choose what to do with results (send now or schedule later), and manage scheduled reminders from a dedicated tab.
Output: Complete UI for the GoDentist scraping general feature.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-general/CONTEXT.md
@.planning/standalone/godentist-scraping-general/01-SUMMARY.md
@.planning/standalone/godentist-scraping-general/02-SUMMARY.md
@src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
@src/app/actions/godentist.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Date picker + action selector + schedule result display</name>
  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>
  <action>
    Modify the existing `confirmaciones-panel.tsx` (~811 lines). Changes are additive.

    **1. New imports:**
    - Add imports from godentist.ts: `scheduleReminders`, `type ScheduleResult`
    - Add `Calendar`, `Clock` icons from lucide-react
    - Keep all existing imports

    **2. New state variables** (add alongside existing state):
    ```typescript
    const [scrapeDate, setScrapeDate] = useState<string>('')  // YYYY-MM-DD or empty for auto
    const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null)
    ```

    **3. Date picker helpers** (add as functions inside or outside component):
    ```typescript
    function getColombiaToday(): string {
      return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    }
    function getColombiaTomorrow(): string {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      return d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    }
    ```

    **4. Date picker UI** - Add BEFORE the sucursal toggle chips, when `phase === 'idle'`:
    - Section with label "Fecha del scrape"
    - Three quick buttons: "Hoy", "Manana", "Otra fecha"
    - When "Hoy" clicked: set scrapeDate to `getColombiaToday()`
    - When "Manana" clicked: set scrapeDate to `getColombiaTomorrow()`
    - When "Otra fecha" clicked: show an `<input type="date">` field
    - Show selected date as badge below buttons
    - If no date selected (empty), show text: "Se usara el proximo dia habil (por defecto)"
    - Quick date buttons: `variant="outline"` with `variant="default"` for selected

    **5. Modify handleScrape** to pass scrapeDate:
    ```typescript
    const res = await scrapeAppointments(Array.from(activeSucursales), scrapeDate || undefined)
    ```

    **6. Action selector UI** - In `phase === 'preview'` section, REPLACE the single "Enviar confirmaciones" button with two buttons side by side:
    - "Enviar confirmaciones" (Send icon) - existing behavior, calls existing `handleSend()`
    - "Programar recordatorios" (Clock icon) - calls new `handleSchedule()`
    - Both show count of selected appointments

    **7. handleSchedule function:**
    ```typescript
    async function handleSchedule() {
      setPhase('sending')  // reuse sending state for loading
      setError('')

      const toSchedule = appointments.filter((_, i) => selected.has(i))
      // scrapeDate is the date picker state variable (YYYY-MM-DD or empty)
      // Use scrapeDate if set, otherwise derive from scrape result date label
      const date = scrapeDate || scrapeDateLabel  // scrapeDateLabel comes from scrape response
      // historyId comes from the scrapeAppointments server action response (res.data.historyId)
      const res = await scheduleReminders(toSchedule, date, historyId)

      if (res.error || !res.data) {
        setError(res.error || 'Error desconocido')
        setPhase('preview')
        return
      }

      setScheduleResult(res.data)
      setPhase('done')
    }
    ```
    **Clarification on variables:**
    - `date`: The `scrapeDate` state variable set by the date picker. If empty, fall back to the date label returned in the scrape response.
    - `historyId`: Returned from the `scrapeAppointments()` server action call (stored in component state from the scrape response, e.g., `res.data.historyId`). Check existing code for how historyId is stored after scrape -- likely already in state or derivable from scrape result.

    **8. Done phase update** - In `phase === 'done'`, check if `scheduleResult` exists:
    - If scheduleResult: show "X programados, Y omitidos" with detail list (skipped items show reason)
    - Add "Ver programacion" button that switches to programacion tab
    - If result (existing): show existing send confirmation summary

    **9. Reset function update:**
    - Add `setScheduleResult(null)` and `setScrapeDate('')` to `handleReset()`

    **Styling:** Use existing shadcn/ui components (Button, Card, Badge, Input). Tailwind classes consistent with existing panel style.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Date picker renders in idle phase
    - Action selector shows two buttons in preview phase
  </verify>
  <done>
    Date picker with Hoy/Manana/calendar appears before scrape button.
    After scrape, two action buttons appear: "Enviar confirmaciones" and "Programar recordatorios".
    Schedule result shows programmed/skipped counts with reasons.
  </done>
</task>

<task type="auto">
  <name>Task 2: Programacion tab + timezone fix</name>
  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>
  <action>
    Continue modifying `confirmaciones-panel.tsx`. Build on Task 1 changes.

    **1. Extend Tab type:**
    ```typescript
    type Tab = 'scrape' | 'history' | 'programacion'
    ```

    **2. New state for reminders:**
    ```typescript
    const [reminders, setReminders] = useState<ScheduledReminderEntry[]>([])
    const [remindersLoading, setRemindersLoading] = useState(false)
    const [cancellingId, setCancellingId] = useState<string | null>(null)
    ```

    **3. New imports** (add to existing):
    - `getScheduledReminders`, `cancelScheduledReminder`, `type ScheduledReminderEntry` from godentist.ts

    **4. Tab navigation update:**
    - Add "Programacion" tab button alongside "Nuevo scrape" and "Historial"
    - Use Clock icon for Programacion tab

    **5. Reminders loader** (same pattern as history tab):
    ```typescript
    // Load reminders when tab switches to 'programacion'
    useEffect(() => {
      if (activeTab === 'programacion') {
        loadReminders()
      }
    }, [activeTab])

    async function loadReminders() {
      setRemindersLoading(true)
      const res = await getScheduledReminders()
      if (res.data) setReminders(res.data)
      setRemindersLoading(false)
    }
    ```

    **6. Programacion tab content** - Two sections:

    **a. Pendientes** (status === 'pending'):
    - Filter: `reminders.filter(r => r.status === 'pending')`
    - Count badge: "N pendientes"
    - Table/card list: Nombre, Telefono, Hora cita, Hora envio, Sucursal
    - "Hora envio" formatted: `new Date(r.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
    - Each row: "Cancelar" button (red, small)
    - Cancel handler:
      ```typescript
      async function handleCancelReminder(id: string) {
        setCancellingId(id)
        const res = await cancelScheduledReminder(id)
        if (res.success) {
          setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r))
        }
        setCancellingId(null)
      }
      ```
    - Empty state: "No hay recordatorios pendientes"

    **b. Historial** (status !== 'pending'):
    - Filter: `reminders.filter(r => r.status !== 'pending')`
    - Table/card list: Nombre, Telefono, Sucursal, Estado (badge), Fecha envio
    - Badge colors: sent -> green, failed -> red/destructive, cancelled -> gray/secondary
    - No actions, read-only
    - Empty state: "No hay historial de recordatorios"

    - Refresh button at top of tab

    **7. Timezone fix** (R5 from CONTEXT.md):
    - In the history tab, find all `created_at` and `sent_at` displays
    - Replace raw date display with: `new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
    - Same for `sent_at`: `new Date(entry.sent_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
    - Verify scraped_date display (already YYYY-MM-DD string, no conversion needed)

    **Styling:** Status badges match existing pattern (green for success, red for error). Use existing shadcn/ui components.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - No React key warnings in the component
    - Component renders without errors in dev server (port 3020)
    - Programacion tab appears in navigation
  </verify>
  <done>
    Programacion tab shows pending reminders with cancel and history of executed reminders.
    All timestamps display in Colombia timezone (both history and programacion tabs).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete GoDentist scraping general feature: date picker, action selector, scheduling via Inngest, Programacion tab</what-built>
  <how-to-verify>
    1. Go to /confirmaciones
    2. Verify date picker appears with "Hoy", "Manana", and calendar option
    3. Select a date and click "Obtener citas" -- verify robot scrapes for that date
    4. In preview, verify two action buttons appear: "Enviar confirmaciones" and "Programar recordatorios"
    5. Select some appointments and click "Programar recordatorios"
    6. Verify scheduling result shows (count programmed, count skipped with reason)
    7. Switch to "Programacion" tab -- verify pending reminders appear with cancel button
    8. Cancel one reminder -- verify it moves to history section as "cancelled"
    9. Check timestamps in History tab -- should show Colombia timezone
    10. NOTE: Template recordatorio_cita_godentist must exist in WhatsApp Business for actual sends to work. Scheduling works regardless.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. Date picker correctly calculates today/tomorrow in Colombia timezone
3. Action selector shows both options after scrape
4. Programacion tab loads and displays reminders
5. Cancel button updates status to cancelled
6. All timestamps in Colombia timezone
</verification>

<success_criteria>
- Host selects date before scrape (or uses default)
- Host chooses action: send confirmations OR schedule reminders
- Programacion tab shows pending (with cancel) and history (read-only)
- All timestamps in America/Bogota timezone
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-scraping-general/03-SUMMARY.md`
</output>
