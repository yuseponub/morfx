---
phase: standalone-robot-godentist
plan: 04
type: execute
wave: 2
depends_on: ["03"]
files_modified:
  - src/app/actions/godentist.ts
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
autonomous: true

must_haves:
  truths:
    - "User sees a 'Confirmar cita' button in the WhatsApp chat header ONLY for GoDentist workspace"
    - "Clicking the button calls the robot to confirm the appointment in Dentos portal"
    - "Button is disabled/hidden when there is no matching appointment or appointment is already confirmed"
    - "User sees toast feedback on success or failure"
  artifacts:
    - path: "src/app/actions/godentist.ts"
      provides: "confirmAppointment() server action"
      contains: "confirmAppointment"
    - path: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      provides: "Confirmar cita button for GoDentist workspace"
      contains: "Confirmar cita"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      to: "src/app/actions/godentist.ts"
      via: "confirmAppointment() server action call"
      pattern: "confirmAppointment"
    - from: "src/app/actions/godentist.ts"
      to: "ROBOT_URL/api/confirm-appointment"
      via: "fetch POST"
      pattern: "confirm-appointment"
---

<objective>
Add a server action and UI button so GoDentist workspace users can confirm a patient's appointment directly from the WhatsApp chat header. The button looks up the contact's phone in the latest scrape history, validates status is "Sin Confirmar", and calls the robot to change the Estado in the Dentos portal.

Purpose: Eliminate the need to manually open the Dentos portal to confirm individual appointments.
Output: Server action + button in chat header, visible only for GoDentist workspace.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-godentist-integration/CONTEXT.md
@.planning/standalone/robot-godentist-integration/03-SUMMARY.md
@src/app/actions/godentist.ts
@src/app/(dashboard)/whatsapp/components/chat-header.tsx
@src/lib/whatsapp/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add confirmAppointment() server action</name>
  <files>src/app/actions/godentist.ts</files>
  <action>
    Add a new server action `confirmAppointment(contactPhone: string, contactName: string)` to the existing godentist.ts file:

    1. Auth check (same pattern as scrapeAppointments): get user, get workspaceId from cookie
    2. Normalize phone: strip leading "+" if present (scrape data stores as "573005090030", conversations store as "+573005090030")
    3. Look up the LATEST scrape from `godentist_scrape_history` for this workspace:
       ```
       admin.from('godentist_scrape_history')
         .select('appointments, scraped_date')
         .eq('workspace_id', workspaceId)
         .order('created_at', { ascending: false })
         .limit(1)
         .single()
       ```
    4. Search the appointments JSONB array for a match by phone (normalize both sides: strip "+" and compare). The appointments array contains objects with {nombre, telefono, hora, sucursal, estado}.
    5. If no matching appointment found, return { error: 'No se encontro cita para este contacto en el ultimo scrape' }
    6. If appointment.estado already includes "confirmada" (case-insensitive), return { error: 'La cita ya esta confirmada' }
    7. If appointment.estado includes "cancelada" (case-insensitive), return { error: 'La cita esta cancelada' }
    8. Format the date for the robot: scraped_date is YYYY-MM-DD, robot expects DD-MM-YYYY. Convert it.
    9. Call `fetch(ROBOT_URL + '/api/confirm-appointment', { method: 'POST', body: JSON.stringify({ workspaceId, credentials: { username: 'JROMERO', password: '123456' }, patientName: appointment.nombre, date: ddmmyyyy, sucursal: appointment.sucursal }) })`
    10. Parse response. If res.ok and body.success, return { success: true, data: body }
    11. If !res.ok, return { error: `Robot error (${res.status}): ${text}` }
    12. If body.success === false, return { error: body.error || 'Error desconocido', screenshots: body.screenshots }

    Also add a helper action `getAppointmentForContact(contactPhone: string)` that:
    1. Same auth/workspace check
    2. Looks up latest scrape history
    3. Searches appointments by phone
    4. Returns { data: { nombre, hora, sucursal, estado, scraped_date } | null }
    This is used by the UI to determine if the button should be visible/enabled.

    Return type for confirmAppointment:
    ```typescript
    { error?: string; success?: boolean; data?: { patientName: string; previousEstado?: string; newEstado?: string; screenshots?: string[] } }
    ```
  </action>
  <verify>
    Run `npx tsc --noEmit` from project root to verify TypeScript compiles.
  </verify>
  <done>
    confirmAppointment() and getAppointmentForContact() server actions exist in godentist.ts. Phone normalization handles +57 vs 57 format. Date conversion YYYY-MM-DD to DD-MM-YYYY works. Both actions validate auth and workspace.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add "Confirmar cita" button to chat header</name>
  <files>src/app/(dashboard)/whatsapp/components/chat-header.tsx</files>
  <action>
    Add a "Confirmar cita" button to chat-header.tsx that is ONLY visible for the GoDentist workspace.

    **Workspace check:**
    - GoDentist workspace ID = '36a74890-aad6-4804-838c-57904b1c9328'
    - Check `conversation.workspace_id === GODENTIST_WORKSPACE_ID`
    - Define const at top of file: `const GODENTIST_WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'`

    **State management:**
    - Add state: `const [appointmentInfo, setAppointmentInfo] = useState<{ nombre: string; hora: string; sucursal: string; estado: string; scraped_date: string } | null>(null)`
    - Add state: `const [isConfirming, setIsConfirming] = useState(false)`
    - Add state: `const [appointmentLoading, setAppointmentLoading] = useState(false)`

    **useEffect to load appointment info (only for GoDentist workspace):**
    ```
    useEffect(() => {
      if (conversation.workspace_id !== GODENTIST_WORKSPACE_ID) return
      const phone = conversation.contact?.phone || conversation.phone
      if (!phone) return
      setAppointmentLoading(true)
      getAppointmentForContact(phone).then(result => {
        if ('data' in result && result.data) setAppointmentInfo(result.data)
        else setAppointmentInfo(null)
        setAppointmentLoading(false)
      })
    }, [conversation.id, conversation.workspace_id])
    ```

    **Button handler:**
    ```
    const handleConfirmAppointment = async () => {
      const phone = conversation.contact?.phone || conversation.phone
      const name = conversation.contact?.name || conversation.profile_name || ''
      if (!phone || !name) return
      setIsConfirming(true)
      const result = await confirmAppointment(phone, name)
      setIsConfirming(false)
      if (result.success) {
        toast.success('Cita confirmada exitosamente en el portal')
        // Update local state to reflect confirmation
        setAppointmentInfo(prev => prev ? { ...prev, estado: 'Confirmada' } : null)
      } else {
        toast.error(result.error || 'Error al confirmar cita')
      }
    }
    ```

    **Button placement:**
    - Place BEFORE the AssignDropdown in the actions row (right side of header)
    - Only render if `conversation.workspace_id === GODENTIST_WORKSPACE_ID`
    - Use CalendarCheck icon from lucide-react (add to imports)
    - Button styling: variant="ghost", size="sm" (not icon-only, show text)
    - Show appointment info in title tooltip: "Confirmar cita de {nombre} - {hora} - {sucursal}"

    **Button states:**
    - Hidden: workspace is not GoDentist OR appointmentLoading OR appointmentInfo is null
    - Disabled: appointmentInfo.estado already includes "confirmada" (case-insensitive) OR isConfirming
    - Active: appointmentInfo.estado includes "sin confirmar" (case-insensitive) or similar unconfirmed status
    - Loading: isConfirming is true -> show spinner + "Confirmando..."
    - After success: button text changes to "Confirmada" with check icon, disabled

    **Imports to add:**
    - `import { CalendarCheck } from 'lucide-react'`
    - `import { confirmAppointment, getAppointmentForContact } from '@/app/actions/godentist'`
    - `import { Loader2 } from 'lucide-react'` (if not already imported)

    **Button JSX (inside the actions div, before AssignDropdown):**
    ```tsx
    {conversation.workspace_id === GODENTIST_WORKSPACE_ID && appointmentInfo && (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={isConfirming || appointmentInfo.estado.toLowerCase().includes('confirmada')}
        onClick={handleConfirmAppointment}
        title={`Confirmar cita: ${appointmentInfo.nombre} - ${appointmentInfo.hora} - ${appointmentInfo.sucursal}`}
      >
        {isConfirming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CalendarCheck className="h-3.5 w-3.5" />
        )}
        {isConfirming
          ? 'Confirmando...'
          : appointmentInfo.estado.toLowerCase().includes('confirmada')
            ? 'Confirmada'
            : 'Confirmar cita'
        }
      </Button>
    )}
    ```
  </action>
  <verify>
    Run `npx tsc --noEmit` from project root. Visually inspect chat-header.tsx to confirm the button only renders for GoDentist workspace and handles all states correctly.
  </verify>
  <done>
    "Confirmar cita" button appears in WhatsApp chat header ONLY for GoDentist workspace. Button loads appointment info from latest scrape, shows correct state (hidden/disabled/active/loading), calls confirmAppointment server action, shows toast feedback.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from project root
2. Button only visible when workspace_id === GoDentist workspace ID
3. Button hidden when no appointment found in latest scrape for this contact's phone
4. Button disabled when appointment already confirmed
5. Click triggers server action -> robot call -> toast feedback
6. Phone normalization handles "+573005090030" vs "573005090030" mismatch
</verification>

<success_criteria>
- GoDentist workspace users see "Confirmar cita" button in WhatsApp chat header for contacts with pending appointments
- Non-GoDentist workspaces never see the button
- Clicking button calls robot, changes Estado in Dentos portal, shows success/fail toast
- Button correctly reflects appointment status (hidden/active/confirmed/disabled)
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-godentist-integration/04-SUMMARY.md`
</output>
