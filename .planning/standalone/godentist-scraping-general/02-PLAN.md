---
phase: standalone/godentist-scraping-general
plan: 02
type: execute
wave: 2
depends_on: ["01"]
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
@src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
@src/app/actions/godentist.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Date picker + action selector + Programacion tab + timezone fix</name>
  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>
  <action>
    Modify the existing `confirmaciones-panel.tsx`. This is a single large component file (~811 lines). Changes are additive to existing functionality.

    **1. New imports:**
    - Add imports from godentist.ts: `scheduleReminders`, `getScheduledReminders`, `cancelScheduledReminder`, `type ScheduledReminderEntry`, `type ScheduleResult`
    - Add `Calendar` icon from lucide-react
    - Keep all existing imports

    **2. Extend Tab type:**
    ```typescript
    type Tab = 'scrape' | 'history' | 'programacion'
    ```

    **3. Date picker state (add to existing state):**
    ```typescript
    const [scrapeDate, setScrapeDate] = useState<string>('')  // YYYY-MM-DD or empty for auto
    ```

    **4. Date picker UI** - Add BEFORE the sucursal toggle chips and the "Obtener citas" button, when `phase === 'idle'`:
    - Section with label "Fecha del scrape"
    - Three quick buttons: "Hoy", "Manana", "Otra fecha"
    - When "Hoy" clicked: set scrapeDate to today (Colombia time)
    - When "Manana" clicked: set scrapeDate to tomorrow (Colombia time)
    - When "Otra fecha" clicked: show an `<input type="date">` field
    - Helper to get today in Colombia:
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
    - Show selected date as a badge/label below the buttons
    - If no date selected (empty), show text: "Se usara el proximo dia habil (por defecto)"

    **5. Modify handleScrape** to pass scrapeDate:
    ```typescript
    const res = await scrapeAppointments(Array.from(activeSucursales), scrapeDate || undefined)
    ```

    **6. Action selector UI** - In the `phase === 'preview'` section, REPLACE the single "Enviar confirmaciones" button with an action choice:
    - Two buttons side by side:
      - "Enviar confirmaciones" (Send icon) - existing behavior
      - "Programar recordatorios" (Clock icon) - new behavior
    - Both buttons show the count of selected appointments
    - "Enviar confirmaciones" calls existing `handleSend()`
    - "Programar recordatorios" calls new `handleSchedule()`:
      ```typescript
      async function handleSchedule() {
        setPhase('sending')  // reuse sending state for loading
        setError('')

        const toSchedule = appointments.filter((_, i) => selected.has(i))
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
    - Add state: `const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null)`
    - In `phase === 'done'`, check if `scheduleResult` exists (show schedule summary) or `result` exists (show send summary)
    - Schedule summary shows: X programados, Y omitidos (con razon)
    - Add "Ver programacion" button in schedule done state that switches to programacion tab

    **7. Programacion tab content:**
    - Add new state:
      ```typescript
      const [reminders, setReminders] = useState<ScheduledReminderEntry[]>([])
      const [remindersLoading, setRemindersLoading] = useState(false)
      const [cancellingId, setCancellingId] = useState<string | null>(null)
      ```
    - Load reminders when tab switches to 'programacion' (same pattern as history tab)
    - Split into two sections:
      **a. Pendientes** (status === 'pending'):
      - Table/card list with columns: Nombre, Telefono, Hora cita, Hora envio, Sucursal
      - Each row has a "Cancelar" button (red, small)
      - "Hora envio" shows `scheduled_at` formatted in Colombia timezone: `new Date(r.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
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
      - Show count badge "N pendientes"
      **b. Historial** (status !== 'pending'):
      - Table/card list with: Nombre, Telefono, Sucursal, Estado (badge: sent=green, failed=red, cancelled=gray), Fecha envio
      - No actions, read-only
      - Badge colors: sent -> green, failed -> red/destructive, cancelled -> gray/secondary
    - Empty states: "No hay recordatorios programados" / "No hay historial de recordatorios"
    - Refresh button at top of tab

    **8. Tab navigation update:**
    - Add "Programacion" tab button alongside "Nuevo scrape" and "Historial"
    - Use Clock icon for Programacion tab

    **9. Timezone fix** (R5 from CONTEXT.md):
    - In the history tab, find all `created_at` and `sent_at` displays
    - Replace raw date display with: `new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
    - Same for `sent_at`: `new Date(entry.sent_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })`
    - Verify scraped_date display (already YYYY-MM-DD string, no conversion needed)

    **10. Reset function update:**
    - Add `setScheduleResult(null)` to `handleReset()`
    - Add `setScrapeDate('')` to `handleReset()`

    **Styling guidelines:**
    - Use existing shadcn/ui components (Button, Card, Badge, Input)
    - Tailwind classes consistent with existing panel style
    - Quick date buttons: `variant="outline"` with `variant="default"` for selected
    - Action buttons: primary color for both, icons differentiate
    - Status badges match existing pattern (green for success, red for error)
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - No React key warnings in the component
    - Component renders without errors in dev server (port 3020)
  </verify>
  <done>
    Date picker with Hoy/Manana/calendar appears before scrape button.
    After scrape, two action buttons: "Enviar confirmaciones" and "Programar recordatorios".
    Programacion tab shows pending reminders with cancel, and history of executed reminders.
    All timestamps display in Colombia timezone.
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
- Scheduling calculates correct send time (1h before, validation >= now + 15min)
- Programacion tab shows pending (with cancel) and history (read-only)
- All timestamps in America/Bogota timezone
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-scraping-general/02-SUMMARY.md`
</output>
