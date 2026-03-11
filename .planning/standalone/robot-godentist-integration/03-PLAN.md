---
phase: standalone-robot-godentist
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
  - godentist/robot-godentist/src/api/server.ts
  - godentist/robot-godentist/src/types/index.ts
autonomous: true

must_haves:
  truths:
    - "Robot receives POST /api/confirm-appointment with patient name, date, sucursal and returns success/fail"
    - "Robot navigates to appointments page, searches by date+sucursal, finds patient row, and attempts to change Estado"
    - "Robot takes diagnostic screenshots at every step for debugging the Estado change mechanism"
    - "Concurrency guard prevents confirm from running while scrape is active (and vice versa)"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "confirmAppointment() method"
      contains: "confirmAppointment"
    - path: "godentist/robot-godentist/src/api/server.ts"
      provides: "POST /api/confirm-appointment endpoint"
      contains: "confirm-appointment"
    - path: "godentist/robot-godentist/src/types/index.ts"
      provides: "ConfirmAppointmentRequest and ConfirmAppointmentResponse types"
      contains: "ConfirmAppointmentRequest"
  key_links:
    - from: "godentist/robot-godentist/src/api/server.ts"
      to: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      via: "adapter.confirmAppointment()"
      pattern: "confirmAppointment"
---

<objective>
Add a POST /api/confirm-appointment endpoint to the GoDentist robot that logs into the Dentos portal, navigates to the appointments page for a given date/sucursal, finds a patient row by name, and changes the Estado from "Sin Confirmar" to "Confirmada".

Purpose: Enable confirming patient appointments directly from the MorfX WhatsApp UI without manually opening the Dentos portal.
Output: New robot endpoint + adapter method, deployed to Railway.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-godentist-integration/CONTEXT.md
@godentist/robot-godentist/src/adapters/godentist-adapter.ts
@godentist/robot-godentist/src/api/server.ts
@godentist/robot-godentist/src/types/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add types + confirmAppointment() adapter method</name>
  <files>
    godentist/robot-godentist/src/types/index.ts
    godentist/robot-godentist/src/adapters/godentist-adapter.ts
  </files>
  <action>
    1. In types/index.ts, add:
       ```typescript
       export interface ConfirmAppointmentRequest {
         workspaceId: string
         credentials: Credentials
         patientName: string    // Full name to search in grid (case-insensitive match)
         date: string           // DD-MM-YYYY format for the date filter
         sucursal: string       // Sucursal name to select in combo
       }

       export interface ConfirmAppointmentResponse {
         success: boolean
         patientName: string
         previousEstado?: string
         newEstado?: string
         error?: string
         screenshots: string[]  // List of screenshot filenames taken during process
       }
       ```

    2. In godentist-adapter.ts, add a public method `confirmAppointment(patientName: string, date: string, sucursal: string)`:

       **Flow:**
       a. Navigate to APPOINTMENTS_URL (same as scrapeAppointments)
       b. Call existing `setDate(date)` to set the date filter
       c. Find and select the sucursal using existing `selectSucursal()` — need to create a Sucursal object: `{ value: sucursal, label: sucursal }`
       d. Call existing `clickBuscar()` to load the grid
       e. Wait 3s for grid to load, take screenshot "confirm-grid-loaded"
       f. Search through table rows to find the row where the patient name cell matches (case-insensitive, trimmed). Use the same `table tbody tr` + `td` selector pattern from extractAppointments().
       g. If no matching row found, return { success: false, error: 'Paciente no encontrado en la tabla' }
       h. Once row is found, take screenshot "confirm-row-found"
       i. **EXPLORATORY PHASE - Estado change mechanism:**
          - First, identify the Estado cell in the row (use estadoKeywords matching like extractAppointments does)
          - Check if the Estado cell has a clickable element (link, button, icon, .x-form-trigger)
          - Try approach 1: Click directly on the Estado cell text, wait 1s, take screenshot "confirm-after-estado-click"
          - Try approach 2: Look for a dropdown arrow (.x-form-trigger, .x-grid3-col-estado img, button) within or near the Estado cell
          - Try approach 3: Look for an edit icon/button in the row (common ExtJS pattern: pencil icon, "Editar" button)
          - Try approach 4: Double-click on the Estado cell (ExtJS RowEditor pattern)
          - After each attempt, check if a dropdown/combo appeared with text "Confirmada" visible
          - If a dropdown appears with "Confirmada" option visible, click it, wait 1s, take screenshot "confirm-estado-changed"
          - If none of the approaches reveal an editable estado, log all attempts and return { success: false, error: 'No se pudo encontrar mecanismo para cambiar estado' }
       j. After successful change, take screenshot "confirm-success"
       k. Return { success: true, patientName, previousEstado: 'Sin Confirmar', newEstado: 'Confirmada', screenshots: [...all screenshot names] }
       l. On any error, take screenshot "confirm-error", return { success: false, error: message, screenshots: [...] }

       **IMPORTANT:** Track all screenshot filenames in an array and return them. This is crucial for debugging the portal UI.
       **IMPORTANT:** Use pagination awareness — if the patient is not on the first page, iterate pages using existing extractAllPages/clickNextPage pattern. But for the confirm action, iterate manually: check current page rows, if not found click next, repeat until found or no more pages.
       **IMPORTANT:** The Estado column position is NOT fixed. Use the same heuristic as extractAppointments: scan cells for estadoKeywords. But also need the cell INDEX to know which td to interact with. Store both the estado text AND the cell index.

    The method should be resilient: wrap everything in try/catch, always take screenshots on failure.
  </action>
  <verify>
    Run `cd godentist/robot-godentist && npx tsc --noEmit` to verify TypeScript compiles without errors.
  </verify>
  <done>
    confirmAppointment() method exists on GoDentistAdapter with full exploratory logic for finding and changing the Estado. Types are exported. TypeScript compiles.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add POST /api/confirm-appointment endpoint</name>
  <files>
    godentist/robot-godentist/src/api/server.ts
  </files>
  <action>
    Add a new POST endpoint `/api/confirm-appointment` to server.ts following the exact same pattern as `/api/scrape-appointments`:

    1. Parse body as ConfirmAppointmentRequest (import the type)
    2. Validate required fields: workspaceId, credentials.username, credentials.password, patientName, date, sucursal
    3. Check concurrency guard: if activeJob is set, return 409 with "Another job is in progress"
    4. Set activeJob = workspaceId
    5. Create GoDentistAdapter, init, login (same pattern as scrape endpoint)
    6. If login fails, return 401
    7. Call adapter.confirmAppointment(patientName, date, sucursal)
    8. Return the ConfirmAppointmentResponse directly
    9. In finally block: close adapter, set activeJob = null

    The endpoint must:
    - Return 200 with { success: true, ... } on successful confirmation
    - Return 200 with { success: false, error: '...', screenshots: [...] } when confirmation fails (not a server error, just couldn't confirm)
    - Return 409 if another job is running
    - Return 401 if login fails
    - Return 500 only on unexpected errors
  </action>
  <verify>
    Run `cd godentist/robot-godentist && npx tsc --noEmit` to verify TypeScript compiles. Then check that the endpoint is registered by reading the file.
  </verify>
  <done>
    POST /api/confirm-appointment endpoint exists, validates inputs, uses concurrency guard, calls adapter.confirmAppointment(), returns structured response with screenshots list.
  </done>
</task>

</tasks>

<verification>
1. `cd godentist/robot-godentist && npx tsc --noEmit` passes
2. Types ConfirmAppointmentRequest and ConfirmAppointmentResponse are exported from types/index.ts
3. confirmAppointment() method exists on GoDentistAdapter
4. POST /api/confirm-appointment endpoint exists in server.ts with concurrency guard
5. The confirm method takes diagnostic screenshots at every step
</verification>

<success_criteria>
- Robot compiles without TypeScript errors
- New endpoint accepts patientName, date, sucursal, credentials, workspaceId
- Adapter method navigates to correct page, searches for patient, attempts estado change with multiple strategies
- Screenshots are taken at every diagnostic step and returned in response
- Concurrency guard prevents parallel execution with scrape
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-godentist-integration/03-SUMMARY.md`
</output>
