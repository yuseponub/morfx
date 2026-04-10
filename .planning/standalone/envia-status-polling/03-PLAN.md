---
phase: envia-status-polling
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/actions/order-tracking.ts
  - src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
autonomous: false

must_haves:
  truths:
    - "User can see tracking history for an Envia order in the order detail sheet"
    - "Tracking section shows estado, timestamp, and novedades for each state change"
    - "Tracking section only appears for orders with carrier events (not all orders)"
  artifacts:
    - path: "src/app/actions/order-tracking.ts"
      provides: "Server action to fetch carrier events for an order"
      exports: ["getOrderTrackingEvents"]
    - path: "src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx"
      provides: "Tracking history UI component"
      exports: ["OrderTrackingSection"]
    - path: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      provides: "Modified order sheet with tracking section integrated"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx"
      to: "src/app/actions/order-tracking.ts"
      via: "server action call"
      pattern: "getOrderTrackingEvents"
    - from: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      to: "src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx"
      via: "component import"
      pattern: "OrderTrackingSection"
---

<objective>
Build the tracking UI: a server action to fetch carrier events and a tracking section component displayed in the order detail sheet.

Purpose: Let users see the real-time tracking history of Envia shipments directly in the order detail view.
Output: Tracking section visible in order sheets for orders with carrier events.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/envia-status-polling/CONTEXT.md
@.planning/standalone/envia-status-polling/RESEARCH.md
@src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
@src/app/actions/order-notes.ts
@src/lib/domain/carrier-events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server action + tracking UI component</name>
  <files>
    src/app/actions/order-tracking.ts
    src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx
  </files>
  <action>
**1. Create `src/app/actions/order-tracking.ts`:**

Server action following the pattern in `order-notes.ts`. Uses `'use server'` directive.

Export `getOrderTrackingEvents(orderId: string)` that:
- Gets auth context (createClient + getUser + workspace membership)
- Calls `getCarrierEventsByOrder(ctx, orderId)` from domain layer
- Returns the events array or empty array on error

Return type: `Array<{ id: string; estado: string; cod_estado: number; novedades: any[]; created_at: string }>`

**2. Create `src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx`:**

Client component (`'use client'`) that displays tracking history for an order.

Props: `{ orderId: string; carrier: string | null }`

Behavior:
- Only render if carrier contains 'envia' (case-insensitive check)
- On mount, call `getOrderTrackingEvents(orderId)` to fetch events
- Show a loading skeleton while fetching
- If no events, show a subtle message: "Sin eventos de tracking aun"
- If events exist, show a vertical timeline with:
  - Each event as a row: estado badge + timestamp (formatted with date-fns es locale, "d MMM yyyy, HH:mm")
  - If novedades array is non-empty, show them as sub-items with novedad text
  - Most recent event at the top

UI structure (following existing section pattern from order-sheet.tsx):
```tsx
<section className="space-y-3">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
    <ActivityIcon className="h-4 w-4" />
    Tracking Envia
  </h3>
  {/* Timeline of events */}
  <div className="space-y-2">
    {events.map(event => (
      <div key={event.id} className="flex items-start gap-3 text-sm">
        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{event.estado}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
          </div>
          {event.novedades?.length > 0 && (
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {event.novedades.map((n, i) => (
                <li key={i}>- {n.novedad}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    ))}
  </div>
</section>
```

Use `ActivityIcon` or `RadioIcon` from lucide-react for the section header icon. Keep it simple -- this is an observation tool, not a feature-rich dashboard.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Server action exports getOrderTrackingEvents
    - Component exports OrderTrackingSection
    - Component only renders for envia carrier
  </verify>
  <done>
    - Server action fetches carrier events for an order with proper auth
    - Tracking section component shows timeline of state changes with novedades
    - Component conditionally renders only for envia orders
  </done>
</task>

<task type="auto">
  <name>Task 2: Integrate tracking section into order-sheet.tsx</name>
  <files>
    src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
  </files>
  <action>
Add the OrderTrackingSection component to order-sheet.tsx, placed AFTER the Shipping section and BEFORE the Description section.

1. Import OrderTrackingSection:
```typescript
import { OrderTrackingSection } from './order-tracking-section'
```

2. After the shipping section closing `</section>` (around line 460) and before the description conditional block, add:

```tsx
{/* Tracking Envia -- only renders if carrier is envia */}
{order.carrier && (
  <>
    <Separator />
    <OrderTrackingSection orderId={order.id} carrier={order.carrier} />
  </>
)}
```

The OrderTrackingSection component internally checks if carrier contains 'envia' and renders nothing if not. The outer `order.carrier &&` check avoids rendering the component at all for orders without a carrier, saving an unnecessary server action call.

Do NOT modify any other part of order-sheet.tsx -- only add the import and the section insertion.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - OrderTrackingSection is imported and rendered in order-sheet.tsx
    - Placement is after Shipping section, before Description
    - No other changes to order-sheet.tsx
  </verify>
  <done>
    - Tracking section appears in order detail sheet for orders with a carrier
    - Only shows content for envia orders (component handles internally)
    - Existing order-sheet functionality unchanged
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of tracking section</name>
  <what-built>Tracking section in order detail sheet showing Envia state change history.</what-built>
  <how-to-verify>
    1. Push to Vercel: `git push origin main`
    2. Open an order that has carrier='envia' and a tracking_number
    3. Open the order detail sheet
    4. Verify the "Tracking Envia" section appears after the Shipping section
    5. At this point it should show "Sin eventos de tracking aun" (no events yet since the cron hasn't run)
    6. Verify the section does NOT appear for orders without carrier='envia'
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues to fix.</resume-signal>
</task>

</tasks>

<verification>
- [ ] `npx tsc --noEmit` passes
- [ ] Server action getOrderTrackingEvents works with auth
- [ ] OrderTrackingSection renders for envia orders
- [ ] OrderTrackingSection does not render for non-envia orders
- [ ] Section is positioned after Shipping in order-sheet.tsx
- [ ] User visually confirms the section appears correctly
</verification>

<success_criteria>
Tracking section visible in order detail sheet for Envia orders. Shows timeline of state changes (initially empty, will populate once cron runs). Non-envia orders unaffected.
</success_criteria>

<output>
After completion, create `.planning/standalone/envia-status-polling/03-SUMMARY.md`
</output>
