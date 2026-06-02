---
phase: 43-mobile-app
plan: 10b
type: execute
wave: 8
depends_on: [10a]
files_modified:
  - apps/mobile/package.json
  - apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx
  - apps/mobile/src/components/crm-panel/WindowIndicator.tsx
  - apps/mobile/src/components/crm-panel/ContactBlock.tsx
  - apps/mobile/src/components/crm-panel/TagEditor.tsx
  - apps/mobile/src/components/crm-panel/RecentOrders.tsx
  - apps/mobile/src/components/crm-panel/OrderRow.tsx
  - apps/mobile/src/components/crm-panel/PipelineStagePicker.tsx
  - apps/mobile/src/components/crm-panel/CreateOrderSheet.tsx
  - apps/mobile/src/hooks/useContactPanel.ts
  - apps/mobile/app/chat/[id].tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "Right-side drawer opens from the chat screen via @react-navigation/drawer with drawerPosition='right'"
    - "Drawer shows: 24h window indicator, contact block (avatar, inline-editable name, phone, address, tags, 'Ver en CRM' deep link, unknown-contact 'Crear contacto' button), recent orders block, create order button"
    - "Each of the following parity items from 43-RESEARCH.md In-Chat CRM Parity Inventory is implemented: header + close, window indicator, contact block (no email per explicit exclusion), inline name edit, phone, address+city, tags via TagBadge, Ver en CRM link, unknown-contact create flow, recent orders (stage badge with picker, COP total, relative time ES, recompra button, view button, per-order tags add/remove), Ver todos link, empty state, loading skeleton, Crear pedido button, foreground refetch + 30s polling + realtime channel mirror of the web pattern"
    - "Task creation button is DEFERRED per Research Open Question #4 (product call) — not shipped in v1, documented as v1.1"
    - "Optimistic UI: stage change reflects instantly, reverts on server error"
    - "Dark mode is verified in the human-verify checkpoint (mandatory from v1 per 43-CONTEXT.md)"
  artifacts:
    - apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx
    - apps/mobile/src/hooks/useContactPanel.ts
  key_links:
    - "Parity inventory is the lock — every checkbox must be ticked before marking done"
    - "Every endpoint consumed here is shipped in Plan 10a"
---

<objective>
Ship the in-chat CRM drawer UI that mirrors the web WhatsApp contact panel per the parity inventory in 43-RESEARCH.md. The drawer slides in from the right edge of the chat screen via `@react-navigation/drawer` with `drawerPosition="right"` (Research Pattern 4). Every field + action from the web's `contact-panel.tsx` is implemented (minus email which is explicitly excluded, and minus Task creation which is deferred to v1.1).

This plan is the UI half of the split Plan 10 (backend in 10a). All endpoints consumed here were shipped in Plan 10a.

Output: a complete right-side drawer with contact info, pipeline move, tag edit, recent orders, create order sheet.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: useContactPanel hook + drawer layout + contact block + window indicator</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/hooks/useContactPanel.ts
    apps/mobile/src/components/crm-panel/ContactPanelDrawer.tsx
    apps/mobile/src/components/crm-panel/WindowIndicator.tsx
    apps/mobile/src/components/crm-panel/ContactBlock.tsx
    apps/mobile/src/components/crm-panel/TagEditor.tsx
    apps/mobile/app/chat/[id].tsx
  </files>
  <action>
  1. `npx expo install @react-navigation/drawer` (Expo Go compatible).
  2. Restructure `app/chat/[id].tsx` to use a Drawer navigator with `drawerPosition="right"`, `drawerType="slide"`, drawer content = `<ContactPanelDrawer conversationId={id} />`. Main screen is the existing chat (list + composer).
  3. Add a header button "info" icon that calls `navigation.openDrawer()` — no edge swipe because swipes collide with the message list. Only the button opens it.
  4. `useContactPanel(conversationId)`: fetches contact + orders + pipeline stages + tags on mount, exposes refresh, and runs Realtime channel `panel-realtime:${conversationId}` + AppState foreground refetch + 30s polling (mirror the web's reliability pattern in `contact-panel.tsx` — Research Parity Inventory explicitly calls this out).
  5. `ContactPanelDrawer.tsx`: the container, scrollable. Renders child blocks in order: header (title + close), window indicator, contact block, recent orders, create order button.
  6. `WindowIndicator.tsx`: computes hours remaining on the 24h WhatsApp window from `last_customer_message_at`. Green if <24h, red if expired. Spanish labels.
  7. `ContactBlock.tsx`: avatar, inline-editable name (tap to edit, `TextInput` appears, Enter/Escape), phone, address+city if present, `<TagEditor>` for conversation tags, "Ver en CRM" link (opens web URL via `Linking.openURL(`https://morfx.app/crm/contactos/${id}`)`), unknown-contact state with "Crear contacto" button (opens a sheet — same flow as web). NO EMAIL (user exclusion).
  8. `TagEditor.tsx`: renders tag pills with X to remove, and a "+" button that opens a bottom sheet with the full tag list + search. Tapping a tag adds it. All with optimistic UI + revert on error.</action>
  <verify>`npx tsc --noEmit` passes. Drawer opens visually.</verify>
  <done>Drawer + contact block + tag editor ship.</done>
</task>

<task type="auto">
  <name>Task 2: RecentOrders, OrderRow, PipelineStagePicker, CreateOrderSheet</name>
  <files>
    apps/mobile/src/components/crm-panel/RecentOrders.tsx
    apps/mobile/src/components/crm-panel/OrderRow.tsx
    apps/mobile/src/components/crm-panel/PipelineStagePicker.tsx
    apps/mobile/src/components/crm-panel/CreateOrderSheet.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `RecentOrders.tsx`: "Pedidos recientes" header, renders up to 5 `<OrderRow>`, shows loading skeleton (3 pulse rows), empty state "No hay pedidos recientes", "Ver todos" link at bottom (for v1 opens web URL via Linking — standalone orders screen is deferred per 43-CONTEXT.md Out of Scope).
  2. `OrderRow.tsx`: stage badge (clickable → opens `<PipelineStagePicker>`), COP total formatted (`new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(total)`), relative created_at (`formatDistanceToNow`, `locale: es`), recompra button (calls POST /orders/:id/recompra, shows a stage picker after), view button (for v1 opens web URL), tags with add/remove same pattern as TagEditor.
  3. `PipelineStagePicker.tsx`: BottomSheet with searchable list of stages, each a pressable row with color dot + name. On tap: optimistic local stage change + POST /orders/:id/stage. Revert on error with a toast.
  4. `CreateOrderSheet.tsx`: BottomSheet with a minimal form — for v1 keep it simple: just a submit button that calls POST /api/mobile/orders with `{ contactId, conversationId, stage_id: (first stage), total: 0 }`. Full order editing is intentionally deferred (parity inventory says "Full order detail edit lives in ViewOrderSheet — separate screen, NOT in mobile v1"). A toast says "Pedido creado — edítalo en la web" and opens the web link.
     Rationale to document in the file header: full order composition is out of scope per CONTEXT.md "no standalone CRM screens on mobile." The Crear Pedido button is kept because it's in the parity inventory, but the editor UI isn't.
  5. i18n keys for all labels.</action>
  <verify>`npx tsc --noEmit` passes.</verify>
  <done>Recent orders section fully interactive.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: Verify full parity inventory on both devices + dark mode</name>
  <files>n/a</files>
  <action>Using the Parity Inventory checklist from 43-RESEARCH.md, tick every item on both devices:
  - Header + close
  - Window indicator updates correctly
  - Contact block: name inline edit saves, phone shows, address shows, tags render + add + remove
  - "Ver en CRM" opens web
  - Unknown-contact: find a conversation without a saved contact, verify "Crear contacto" flow works
  - Recent orders loads, empty state shows when empty, skeleton shows while loading
  - Stage badge opens picker → pick new stage → optimistic → confirm persisted on web
  - Recompra creates a duplicate order
  - View button opens web
  - Order tags add/remove work
  - "Ver todos" opens web
  - Crear pedido creates a minimal order + opens web
  - Task creation: CONFIRMED NOT PRESENT (deferred to v1.1)
  - No email anywhere
  - **Switch to dark mode (Settings or OS) — verify no hardcoded colors, drawer + all sub-components render correctly in dark theme.**

  Realtime: from the web, move a stage → mobile drawer reflects within 30s (polling) or instantly (realtime).

  Fix anything broken before marking done.</action>
  <verify>User confirms every parity inventory item + dark mode looks correct.</verify>
  <done>CRM drawer shipped at full parity with web.</done>
</task>

</tasks>

<verification>
- `drawerPosition="right"` confirmed
- All mutations go through Plan 10a endpoints (which go through src/lib/domain/)
- Research Pattern 1 (realtime + foreground refetch + 30s polling) implemented to match the web's existing pattern
- Parity inventory 100% ticked (except deferred: Task button, Full order editor, Email)
- Dark mode verified on both devices
</verification>

<success_criteria>
Drawer opens from right, shows everything the web panel shows (minus the explicitly excluded items), every action works, state stays fresh, dark mode renders cleanly.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-10b-SUMMARY.md` with: full parity checklist (ticked), deferred items documented, dark mode screenshot confirmation.
</output>
