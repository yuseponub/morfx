---
status: verifying
trigger: "Orders never auto-refresh in WhatsApp inbox UI when agent creates order. User must F5. 5+ previous fix attempts failed."
created: 2026-02-12T00:00:00Z
updated: 2026-02-12T01:15:00Z
---

## Current Focus

hypothesis: Polling every 10s in RecentOrdersList will reliably detect new orders since it bypasses the Realtime mechanism entirely.
test: Deploy to Vercel, user creates order via agent, observe if orders appear within 10-15 seconds without F5.
expecting: Orders list auto-updates within 10-15s. Diagnostic logs reveal whether Realtime ever fires (confirming root cause).
next_action: Deploy and verify with user

## Symptoms

expected: When the agent creates an order, the orders list in the contact panel should automatically refresh and show the new order without page reload.
actual: Orders NEVER appear automatically. User must always F5. Consistent, not intermittent.
errors: No known JS errors (user hasn't checked console yet).
reproduction: 1. Open WhatsApp inbox, select conversation. 2. Agent processes message leading to order creation. 3. Order created in DB but never appears in contact panel. 4. F5 -> order appears.
started: Has NEVER worked. 5+ commits tried to fix it. All approaches failed.

## Eliminated

- hypothesis: "useEffect doesn't depend on refreshKey"
  evidence: Line 377 of contact-panel.tsx shows [contactId, refreshKey] in deps array
  timestamp: 2026-02-12T00:30:00Z

- hypothesis: "Server action getRecentOrders returns cached/stale data"
  evidence: Server actions in Next.js 15 are not cached. Uses cookies() which opts out of caching. F5 uses same code path and works.
  timestamp: 2026-02-12T00:35:00Z

- hypothesis: "contactId is undefined or wrong"
  evidence: If contactId were undefined, RecentOrdersList wouldn't render at all (hasContact check). F5 works, confirming contact exists.
  timestamp: 2026-02-12T00:36:00Z

- hypothesis: "Stale closure in setTimeout callback"
  evidence: Uses functional updater setOrdersRefreshKey(k => k + 1) which always reads latest state. setOrdersRefreshKey is stable (useState setter).
  timestamp: 2026-02-12T00:37:00Z

- hypothesis: "Component unmounts/remounts on conversation update"
  evidence: ContactPanel has no key prop, rightPanel state is stable, conversation?.id doesn't change. useEffect deps [conversation?.id, contactId] are stable.
  timestamp: 2026-02-12T00:38:00Z

- hypothesis: "Supabase Realtime not enabled for orders/conversations tables"
  evidence: Both tables in supabase_realtime publication. Migrations confirm.
  timestamp: 2026-02-12T00:39:00Z

## Evidence

- timestamp: 2026-02-12T00:30:00Z
  checked: RecentOrdersList useEffect dependency array
  found: refreshKey IS in dependency array [contactId, refreshKey] at line 377
  implication: If refreshKey changes, useEffect WILL fire

- timestamp: 2026-02-12T00:32:00Z
  checked: contact-panel.tsx realtime subscription setup
  found: Two channels: conv-order-refresh (conversations UPDATE) and orders-direct (orders INSERT by contact_id)
  implication: Both SHOULD trigger setOrdersRefreshKey(k => k + 1)

- timestamp: 2026-02-12T00:34:00Z
  checked: Supabase Realtime replica identity
  found: NO REPLICA IDENTITY FULL set on any table. Default = primary key only.
  implication: Orders INSERT filter on contact_id may not work without REPLICA IDENTITY FULL.

- timestamp: 2026-02-12T00:40:00Z
  checked: use-conversations.ts useEffect dependency array
  found: Line 304: [workspaceId, fetchConversations, conversations] — includes conversations reference
  implication: Every conversation update triggers channel teardown/recreation in this hook, potentially causing WebSocket instability

- timestamp: 2026-02-12T00:42:00Z
  checked: No diagnostic logging in contact-panel realtime handlers
  found: Zero console.log statements in the realtime callbacks
  implication: Cannot confirm if events are actually received. No observability.

- timestamp: 2026-02-12T00:45:00Z
  checked: 5+ previous fix attempts (bd2898c through 1398b59)
  found: All approaches relied on Supabase Realtime as trigger mechanism (direct orders, messages proxy, conversation UPDATE)
  implication: Realtime is fundamentally unreliable in this context. Need a non-Realtime approach.

- timestamp: 2026-02-12T01:10:00Z
  checked: Fix implementation
  found: Added 10s polling in RecentOrdersList + diagnostic logging on Realtime channels
  implication: Polling bypasses Realtime entirely. Diagnostic logs will confirm if Realtime ever fires.

## Resolution

root_cause: Supabase Realtime events for conversations UPDATE and orders INSERT never reliably reach the contact-panel component's subscription handlers. Despite the code being logically correct (refreshKey in deps, functional state updater, correct channel setup), the events don't fire. Contributing factors: (1) orders INSERT filter on contact_id fails without REPLICA IDENTITY FULL, (2) potential WebSocket instability from use-conversations.ts constantly tearing down and recreating channels (conversations in deps array), (3) possible Supabase Realtime delivery issues with multiple overlapping subscriptions on same table.

fix: Added lightweight polling (every 10s) directly in RecentOrdersList component. Polls getRecentOrders and compares order IDs via ref - only updates state if orders actually changed. Keeps existing Realtime triggers as bonus for instant refresh. Added diagnostic console.log to Realtime handlers to confirm root cause.

verification: Pending user test
files_changed:
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
