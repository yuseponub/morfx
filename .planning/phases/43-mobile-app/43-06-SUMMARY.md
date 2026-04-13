---
phase: 43-mobile-app
plan: 06
title: Workspace switcher (WorkspaceContext + BottomSheet + key-based remount)
wave: 2
completed: 2026-04-12
requires:
  - phase: 43-02
    provides: Expo SDK 54 bootstrap + EAS managed credentials
  - phase: 43-04
    provides: Auth flow + Supabase session + api-client singleton
provides:
  - WorkspaceContext provider (workspaceId, workspaceName, memberships, setWorkspaceId, refresh, isLoading, error)
  - Channel registry for Realtime teardown on workspace switch
  - WorkspaceSwitcher button in inbox header + BottomSheetModal (40% snap)
  - Key-based remount of (tabs) Stack.Screen on workspace change
  - /api/mobile/workspaces endpoint (JWT-only auth, no x-workspace-id required)
affects:
  - 43-07 (inbox cache read path — uses workspaceId from context)
  - 43-08 (conversation detail — remounts on workspace switch)
  - 43-09 (send message — uses workspaceId from context)
  - 43-11 (three-state bot toggle — workspace-scoped)
subsystem: mobile/workspace
tags: [expo-router, react-context, bottom-sheet, realtime, workspace-switcher, auth-routing]
tech-stack:
  added:
    - "@gorhom/bottom-sheet ^5"
  patterns:
    - WorkspaceContext with channel registry for Realtime teardown
    - Key-based remount (workspaceId as React key on Stack.Screen)
    - Declarative Redirect + imperative router.replace only after navigator mounted
    - Supabase onAuthStateChange prevAuthed guard to prevent redirect loops
    - Lazy Supabase client via Proxy pattern for eas update export compatibility
    - /api/mobile/* middleware bypass for Next.js session middleware

key-files:
  created:
    - apps/mobile/src/lib/workspace/context.tsx
    - apps/mobile/src/lib/workspace/registry.ts
    - apps/mobile/src/components/workspace/WorkspaceSwitcher.tsx
    - src/app/api/mobile/workspaces/route.ts
  modified:
    - apps/mobile/src/app/(auth)/_layout.tsx
    - apps/mobile/src/app/(tabs)/_layout.tsx
    - apps/mobile/src/app/_layout.tsx
    - apps/mobile/src/app/index.tsx
    - apps/mobile/src/lib/supabase/client.ts
    - src/middleware.ts

key-decisions:
  - "Key-based remount (workspaceId as React key on (tabs) Stack.Screen) for clean Realtime teardown"
  - "WorkspaceContext fetches /api/mobile/workspaces with JWT-only auth (no x-workspace-id — endpoint returns all memberships)"
  - "Declarative Redirect for initial route; imperative router.replace only after navigator mounted (expo-router constraint)"
  - "Supabase onAuthStateChange: track prevAuthed boolean to suppress duplicate SIGNED_IN events and prevent redirect loops"
  - "morfx.app -> www.morfx.app 307 redirect strips auth headers — mobile API base URL hardcoded to www.morfx.app"
  - "Lazy Supabase client via Proxy pattern (access trap defers import) for eas update export compatibility"
  - "src/middleware.ts bypasses /api/mobile/* routes (no Next.js session cookie needed for JWT-based mobile API)"

patterns-established:
  - "Workspace channel registry: register(channel) + teardownAll() called on WorkspaceContext.setWorkspaceId"
  - "expo-router auth routing: declarative <Redirect> in layout + imperative replace only inside useMounted guard"
  - "Supabase auth loop prevention: prevAuthed ref tracks prior state, ignores redundant SIGNED_IN events"
  - "Mobile API auth: Authorization: Bearer <JWT> only — no x-workspace-id on endpoints that must enumerate all workspaces"
  - "EAS Build as reliable dev loop from WSL2 — ngrok unreliable, eas update preferred over tunnel"

metrics:
  duration: ~3h (including 9 fix commits during Android APK verification)
  completed: 2026-04-12
---

# Phase 43 Plan 06: Workspace Switcher Summary

**WorkspaceContext with channel-registry teardown, BottomSheetModal picker (40% snap), key-based remount of the tabs navigator, and /api/mobile/workspaces JWT endpoint — verified on Android APK across 4 real workspaces (Somnio, Varixcenter, GoDentist, GoDentist Valoraciones)**

## Performance

- **Duration:** ~3h (including 9 fix commits during Android APK verification via EAS Build)
- **Started:** 2026-04-12
- **Completed:** 2026-04-12 (user confirmed Android APK via EAS Build)
- **Tasks:** 3
- **Files modified:** ~12

## Accomplishments

- WorkspaceContext provider exposes `{ workspaceId, workspaceName, memberships, setWorkspaceId, refresh, isLoading, error }` — wraps the tabs root layout, survives navigation
- Channel registry (`registry.ts`) decouples Realtime channels from screens; `setWorkspaceId` calls `registry.teardownAll()` before switching so stale subscriptions don't leak
- WorkspaceSwitcher renders in the inbox header; tap opens a `@gorhom/bottom-sheet` BottomSheetModal at 40% snap with a FlatList of all memberships; selecting one calls `setWorkspaceId` + dismisses sheet
- `/api/mobile/workspaces` endpoint uses JWT-only auth (no `x-workspace-id` required) and returns all workspace memberships for the authenticated user
- 4 workspaces verified on real Android APK: Somnio, Varixcenter, GoDentist, GoDentist Valoraciones

## Task Commits

Each task was committed atomically:

1. **Task 1: WorkspaceContext + useWorkspace + channel registry** - `89571c2` (feat)
2. **Task 2: WorkspaceSwitcher button + bottom sheet** - `0b274c1` (feat)
3. **Task 3: Verify workspace switch on device** - User confirmed 2026-04-12 (Android APK via EAS Build)

**Fix commits during verification:**
- `13fda84` — add missing (auth) route group layout
- `dc47de0` — workspaces endpoint JWT-only auth (no x-workspace-id required)
- `c0e8839` — fix auth routing and workspace provider timing
- `8c4341a` — remove imperative router.replace from login
- `b3ef8c9` — add root index with Redirect for initial route
- `16eb4a3` — add router.replace on auth state change after navigator mount
- `16a6ae1` — prevent redirect loop from supabase auth state events
- `ed5db24` — bypass web session middleware for /api/mobile/* routes
- `b93091e` — lazy supabase client + workspace error display

## Files Created/Modified

- `apps/mobile/src/lib/workspace/context.tsx` — WorkspaceContext + WorkspaceProvider + useWorkspace hook; fetches /api/mobile/workspaces, manages selected workspace state, triggers registry teardown on switch
- `apps/mobile/src/lib/workspace/registry.ts` — Channel registry: `register(channel)` + `teardownAll()` for clean Realtime unsubscribe on workspace switch
- `apps/mobile/src/components/workspace/WorkspaceSwitcher.tsx` — Button (workspace name pill) + BottomSheetModal with 40% snap FlatList of all memberships
- `src/app/api/mobile/workspaces/route.ts` — GET endpoint, JWT-only auth, returns all workspace memberships for the user
- `apps/mobile/src/app/_layout.tsx` — Lazy Supabase client (Proxy pattern), onAuthStateChange with prevAuthed loop-prevention guard, router.replace only after navigator mounted
- `apps/mobile/src/app/index.tsx` — Root index with `<Redirect href="/(tabs)/inbox" />` for initial route resolution
- `apps/mobile/src/app/(auth)/_layout.tsx` — Added missing route group layout (was causing 404 on auth routes)
- `apps/mobile/src/app/(tabs)/_layout.tsx` — WorkspaceProvider wrapper; Stack.Screen keyed by workspaceId for automatic remount on switch
- `apps/mobile/src/lib/supabase/client.ts` — Lazy client via Proxy pattern (access trap defers module import) for eas update export compatibility
- `src/middleware.ts` — Added `/api/mobile/*` bypass so Next.js session middleware doesn't intercept JWT-based mobile API routes

## Decisions Made

- **Key-based remount** over imperative unsubscribe per-screen: `workspaceId` as React `key` on the (tabs) `Stack.Screen` triggers full unmount/remount of the tabs navigator tree, guaranteeing all child components re-fetch for the new workspace. Simpler and more reliable than coordinating teardown across all screens.
- **JWT-only auth on /api/mobile/workspaces**: The workspaces endpoint cannot require `x-workspace-id` because its purpose is to enumerate all workspaces the user belongs to — there is no "current" workspace yet at the point of the call.
- **Declarative `<Redirect>` + guarded imperative `router.replace`**: expo-router requires that initial routing be declarative (via `<Redirect>` in layout or index). Imperative `router.replace` inside `onAuthStateChange` is only safe after the navigator has mounted; calling it before mount causes silent no-ops or race crashes. A `navigatorMounted` ref gates all imperative calls.
- **prevAuthed guard on onAuthStateChange**: Supabase fires `SIGNED_IN` multiple times during session restore and token refresh. Without tracking whether the user was already authenticated, each event triggers a redundant `router.replace`, causing visible flicker or infinite redirect loops.
- **www.morfx.app as API base URL**: `morfx.app` performs a 307 redirect to `www.morfx.app`. That redirect is transparent for browser fetch but strips `Authorization` headers on React Native fetch. The mobile API client now hardcodes `www.morfx.app` to skip the redirect hop.
- **Lazy Supabase client via Proxy**: `eas update` (OTA export) evaluates all module imports at bundle time. The Supabase client constructor reads `AsyncStorage`, which is unavailable at export time. Wrapping the client in a `Proxy` defers the actual import/construction until first property access at runtime, making the export step clean.
- **Next.js middleware bypass for /api/mobile/***: The existing `src/middleware.ts` applies Next.js session logic (reading `sb-*` cookies) to all API routes. Mobile routes authenticate via `Authorization: Bearer <JWT>`, not cookies. The middleware bypass ensures it does not interfere with or reject mobile requests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing (auth) route group layout**
- **Found during:** Task 3 verification (Android APK)
- **Issue:** expo-router requires a `_layout.tsx` inside every route group folder. The `(auth)/` group was missing its layout, causing 404/blank screen on the login route.
- **Fix:** Created `apps/mobile/src/app/(auth)/_layout.tsx` with a minimal `<Stack>` layout.
- **Files modified:** `apps/mobile/src/app/(auth)/_layout.tsx`
- **Committed in:** `13fda84`

**2. [Rule 3 - Blocking] /api/mobile/workspaces required x-workspace-id header incorrectly**
- **Found during:** Task 3 verification
- **Issue:** The endpoint was using the shared `getMobileAuth` helper which requires `x-workspace-id`. That header is not available when listing workspaces (the user has no active workspace yet).
- **Fix:** Replaced with JWT-only auth (decode Bearer token, query workspace_members directly).
- **Files modified:** `src/app/api/mobile/workspaces/route.ts`
- **Committed in:** `dc47de0`

**3. [Rule 3 - Blocking] Imperative router.replace in login screen caused routing race**
- **Found during:** Task 3 verification
- **Issue:** Login screen called `router.replace('/(tabs)/inbox')` imperatively on submit success, racing with the `onAuthStateChange` handler in root layout which did the same. This caused double navigation or stale-navigator errors.
- **Fix:** Removed imperative replace from login; auth state change in root layout is the single source of truth.
- **Files modified:** `apps/mobile/src/app/(auth)/login.tsx`
- **Committed in:** `8c4341a`

**4. [Rule 3 - Blocking] Root index had no initial route, causing blank screen on cold launch**
- **Found during:** Task 3 verification
- **Issue:** Without an `index.tsx` at the root, expo-router had no entry point to render before auth state resolved, leaving a blank screen.
- **Fix:** Created `apps/mobile/src/app/index.tsx` with `<Redirect href="/(tabs)/inbox" />`.
- **Files modified:** `apps/mobile/src/app/index.tsx`
- **Committed in:** `b3ef8c9`

**5. [Rule 1 - Bug] Supabase onAuthStateChange redirect loop**
- **Found during:** Task 3 verification
- **Issue:** Supabase fires `SIGNED_IN` on session restore AND token refresh. Without deduplication, each event triggered `router.replace` → navigation → another auth event → infinite loop.
- **Fix:** Added `prevAuthed` ref; only acts on auth state transitions (false→true or true→false).
- **Files modified:** `apps/mobile/src/app/_layout.tsx`
- **Committed in:** `16a6ae1`

**6. [Rule 3 - Blocking] Next.js middleware intercepting /api/mobile/* routes**
- **Found during:** Task 3 verification
- **Issue:** Next.js session middleware was running on mobile API routes and interfering with JWT-based auth (rejecting or modifying requests that lacked `sb-*` cookies).
- **Fix:** Added `!/api/mobile/`.test(pathname)` bypass condition to `src/middleware.ts`.
- **Files modified:** `src/middleware.ts`
- **Committed in:** `ed5db24`

**7. [Rule 3 - Blocking] Supabase client incompatible with eas update export**
- **Found during:** Task 3 verification (EAS Build export phase)
- **Issue:** `eas update` evaluates module imports at bundle time. The Supabase client constructor reads `AsyncStorage` which is not available in the export environment, causing build failure.
- **Fix:** Wrapped client in a `Proxy` (access trap) so construction is deferred to first runtime use.
- **Files modified:** `apps/mobile/src/lib/supabase/client.ts`
- **Committed in:** `b93091e`

---

**Total deviations:** 7 auto-fixed (4 blocking, 1 bug, 2 blocking+bug hybrid)
**Impact on plan:** All fixes were necessary for the APK to boot and authenticate correctly. No scope creep — every fix addressed a blocker on the planned verification path.

## Issues Encountered

- **WSL2 networking / ngrok unreliable for EAS**: LAN mode does not work from WSL2 (NAT bridge). ngrok tunnels drop under load. EAS Build + `eas update` (OTA) proved to be the reliable development loop for Android verification from WSL2 — the device pulls JS bundle directly from Expo's CDN.
- **morfx.app → www.morfx.app 307 strips auth headers**: React Native `fetch` follows 307 redirects but does NOT forward `Authorization` headers (browser security behavior inherited by RN). Discovered during workspace list fetch failures. Fixed by hardcoding `www.morfx.app` as the API base URL.
- **expo-router routing constraints**: The framework has a hard split between declarative routing (layouts, `<Redirect>`) and imperative routing (`router.replace`). Imperative calls before the navigator mounts are silently ignored. The fix required understanding the mount lifecycle and guarding all imperative calls with a `navigatorMounted` ref.

## User Setup Required

None — no new environment variables or external service configuration required beyond what was already set up for Plans 02/04.

## Next Phase Readiness

- Plan 43-07 (inbox list) can now read `workspaceId` from `useWorkspace()` and call `/api/mobile/conversations`.
- Plan 43-08 (conversation detail) benefits from key-based remount: switching workspaces automatically destroys and recreates the detail screen.
- Channel registry is ready for Realtime subscriptions introduced in Plans 43-07 and 43-08 — they should call `registry.register(channel)` on mount.
- No blockers.

---
*Phase: 43-mobile-app*
*Completed: 2026-04-12*
