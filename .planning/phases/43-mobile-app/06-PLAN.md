---
phase: 43-mobile-app
plan: 06
type: execute
wave: 4
depends_on: [3, 4, 5]
files_modified:
  - apps/mobile/src/lib/workspace/context.tsx
  - apps/mobile/src/lib/workspace/use-workspace.ts
  - apps/mobile/src/components/workspace/WorkspaceSwitcher.tsx
  - apps/mobile/src/components/workspace/WorkspaceSwitcherSheet.tsx
  - apps/mobile/src/lib/realtime/channel-registry.ts
  - apps/mobile/app/_layout.tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "A WorkspaceContext at the root layout holds { workspaceId, workspaceName, memberships }"
    - "On login, the last-used workspace is restored from AsyncStorage; if none, the first membership is picked"
    - "Switching workspace updates the context, persists to AsyncStorage, tears down all active Supabase Realtime channels, clears per-workspace query caches, and re-fetches from GET /api/mobile/workspaces"
    - "Switching workspace does NOT call router.replace('/') — the tab stack stays mounted and only re-renders with the new workspaceId as a key"
    - "Switching workspace takes <1s on a warm app and shows no white flash of the old workspace's data"
    - "A WorkspaceSwitcher button is visible in the inbox header showing the current workspace name"
  artifacts:
    - apps/mobile/src/lib/workspace/context.tsx
    - apps/mobile/src/components/workspace/WorkspaceSwitcher.tsx
  key_links:
    - "Every hook that depends on workspaceId (useConversations, useRealtimeInbox, etc.) keys on it; switching workspace re-runs them"
---

<objective>
Implement multi-workspace switching without a full app reload per Research Open Question #6. This is a prototype-first task because RN state reset on workspace change is easy to get subtly wrong (realtime channels, query caches, in-memory selection). We lock the pattern here so later UI plans can rely on it.

Output: WorkspaceContext provider, switcher UI (button in header + bottom sheet list), and a channel-registry helper that every future Realtime subscription registers with so switching workspace can tear them all down in one call.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create WorkspaceContext + useWorkspace hook + channel registry</name>
  <files>
    apps/mobile/src/lib/workspace/context.tsx
    apps/mobile/src/lib/workspace/use-workspace.ts
    apps/mobile/src/lib/realtime/channel-registry.ts
  </files>
  <action>
  1. `src/lib/realtime/channel-registry.ts`: a tiny registry
     ```ts
     import { supabase } from '@/lib/supabase' // MOBILE client from apps/mobile/src/lib/supabase.ts — NOT the web's src/lib/supabase/
     import type { RealtimeChannel } from '@supabase/supabase-js'

     const channels = new Set<RealtimeChannel>()
     export function registerChannel(ch: RealtimeChannel) { channels.add(ch); return () => { channels.delete(ch) } }
     export async function teardownAllChannels() { for (const ch of channels) await supabase.removeChannel(ch); channels.clear() }
     ```
     IMPORTANT: The `supabase` import MUST resolve to `apps/mobile/src/lib/supabase.ts` (the mobile client created in Plan 04). It MUST NOT import from the web's `src/lib/supabase/*` path — that module uses Next.js server helpers and will not work in React Native. The path alias `@/lib/supabase` in the mobile `tsconfig.json` (Plan 02 Task 1) points to `apps/mobile/src/lib/*`, so this import resolves correctly inside the mobile workspace.
     EVERY Realtime subscription in later plans MUST call `registerChannel` so we can tear down en-masse on workspace switch or logout.
  2. `src/lib/workspace/context.tsx`: React Context + Provider holding `{ workspaceId, workspaceName, memberships, setWorkspaceId, refresh }`. The Provider:
     - On mount, fetches `GET /api/mobile/workspaces` via mobileApi.
     - Reads the last-selected workspace id from AsyncStorage key `mobile:selectedWorkspaceId`. If still valid (exists in memberships), uses it; else uses memberships[0].
     - `setWorkspaceId(nextId)`: (a) calls `teardownAllChannels()`, (b) persists to AsyncStorage via `setSelectedWorkspaceId`, (c) updates local state. Because api-client reads the workspace id from AsyncStorage + in-memory singleton on every call, subsequent API requests use the new workspace automatically.
  3. `src/lib/workspace/use-workspace.ts`: export `useWorkspace()` hook returning the context value. Throw if used outside the provider.

  Wire the provider into `app/_layout.tsx` below the auth check: only mount `WorkspaceProvider` when a user session exists. Child tabs see `workspaceId` as a stable key; pass it as a React `key` to the tabs group so switching workspace remounts the tab tree with clean state (no stale in-memory caches).</action>
  <verify>`npx tsc --noEmit` passes. Manual: log in, open dev menu, inspect WorkspaceContext value via React DevTools OR a small debug Text node showing `workspaceId`.</verify>
  <done>WorkspaceContext works, channel registry exists, provider is in the root layout.</done>
</task>

<task type="auto">
  <name>Task 2: Build WorkspaceSwitcher button + bottom sheet list</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/components/workspace/WorkspaceSwitcher.tsx
    apps/mobile/src/components/workspace/WorkspaceSwitcherSheet.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `npx expo install @gorhom/bottom-sheet` (in Expo Go's prebuilt set via Reanimated + GestureHandler already installed).
  2. `WorkspaceSwitcher.tsx`: a button showing the current workspace name + a chevron-down icon. Tapping it `.present()`s the `WorkspaceSwitcherSheet`. Use theme colors.
  3. `WorkspaceSwitcherSheet.tsx`: `BottomSheetModal` with snap points `['40%']`. Lists memberships from `useWorkspace()`, highlights the current one, and tapping a row calls `setWorkspaceId(id)` + dismisses the sheet.
  4. Add i18n keys `workspace.switcher.title`, `workspace.switcher.current`.
  5. Wrap `app/_layout.tsx`'s root in `BottomSheetModalProvider` so any sheet anywhere in the app works.</action>
  <verify>`npx tsc --noEmit` passes. Visual test in Task 3.</verify>
  <done>Switcher UI exists and triggers context update.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: Verify workspace switch on both devices</name>
  <files>n/a</files>
  <action>The user's test workspace membership needs at least 2 workspaces. If not, ask user to add the test user to a second workspace on the web first.

  Then on both devices:
  1. Log in, see current workspace name in header
  2. Tap switcher → bottom sheet lists memberships
  3. Pick the other workspace → sheet closes, header updates to new name
  4. Switch happens in <1s with no visible stale data from the previous workspace
  5. Switch back, confirm it's symmetric

  Fix any glitches before marking done.</action>
  <verify>User confirms switching is clean on both iOS and Android.</verify>
  <done>Multi-workspace switching works without full reload.</done>
</task>

</tasks>

<verification>
- Workspace switch tears down all Realtime channels via channel-registry
- Switch persists to AsyncStorage
- api-client picks up the new workspace id on the next request
- No router.replace('/') is called on switch — tabs stay mounted via React key remount
- Bottom sheet provider is mounted once at the root
</verification>

<success_criteria>
User can switch between workspaces from the inbox header, no full app reload, all state correctly scoped to the new workspace.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-06-SUMMARY.md` with: state reset strategy used (key-based remount + channel teardown), timing observed, any gotchas.
</output>
