---
phase: 43-mobile-app
plan: 04
name: auth-flow-app-shell
subsystem: mobile-auth
tags: [mobile, supabase-auth, async-storage, i18n, theme, expo-router, api-client]

# Dependency graph
requires:
  - phase: 43-02
    provides: Expo project scaffold with offline-first outbox
  - phase: 43-03
    provides: Mobile API skeleton (health, me, workspaces endpoints)
provides:
  - Supabase client with AsyncStorage session persistence
  - api-client with auto Bearer + x-workspace-id headers
  - Theme provider (system dark/light + override)
  - i18n scaffold with forced Spanish and seed keys
  - Auth-guarded root layout (login vs tabs)
  - Login screen with email+password
  - Empty inbox placeholder with logout
affects: [43-05, 43-06, 43-07, 43-08, 43-09, 43-10a, 43-10b, 43-11, 43-12, 43-13, 43-14, 43-15]

# Tech tracking
tech-stack:
  added:
    - "@supabase/supabase-js"
    - "@react-native-async-storage/async-storage"
    - expo-secure-store
    - react-native-url-polyfill
    - expo-localization
    - zod
    - i18next
    - react-i18next
    - date-fns
    - lucide-react-native
    - react-native-svg
  patterns:
    - AsyncStorage session persistence for Supabase auth (detectSessionInUrl: false)
    - api-client singleton with auto-injected Bearer + x-workspace-id headers
    - ThemeProvider with system-following + AsyncStorage override
    - Forced Spanish i18n with t() function (no hardcoded strings)
    - Expo Router group routing: (auth) vs (tabs) with SplashScreen guard

key-files:
  created:
    - apps/mobile/src/lib/supabase.ts
    - apps/mobile/src/lib/session.ts
    - apps/mobile/src/lib/api-client.ts
    - apps/mobile/src/lib/theme/index.ts
    - apps/mobile/src/lib/i18n/index.ts
    - apps/mobile/src/lib/i18n/es.json
    - apps/mobile/app/(auth)/login.tsx
    - apps/mobile/app/(tabs)/_layout.tsx
    - apps/mobile/app/(tabs)/inbox.tsx
    - apps/mobile/app/+not-found.tsx
    - apps/mobile/.env.example
  modified:
    - apps/mobile/app/_layout.tsx
    - apps/mobile/package.json
    - apps/mobile/src/lib/db/outbox.ts

key-decisions:
  - "AsyncStorage for session persistence (not expo-secure-store) — Supabase JS requires a synchronous-like storage adapter; AsyncStorage fits the contract"
  - "detectSessionInUrl: false — prevents Expo deep link collisions with Supabase OAuth callbacks"
  - "Forced Spanish (es) for i18n — Plan 12 will add language switching UI"
  - "MobileApiError class for typed HTTP error handling in api-client"
  - "System dark/light theme following by default, with AsyncStorage override via setThemeOverride()"
  - "outbox.ts static import of api-client (removed @ts-expect-error) for proper type safety"

patterns-established:
  - "Auth guard pattern: SplashScreen.preventAutoHideAsync() -> getSession() -> route to (tabs) or (auth)"
  - "All user-visible strings via t('key') from es.json — no hardcoded Spanish outside translation file"
  - "api-client.get/post/patch/delete auto-inject Authorization and x-workspace-id headers"
  - "ThemeProvider context with useTheme() hook for consistent styling"

# Metrics
duration: ~90min (across two executor sessions including checkpoint wait)
completed: 2026-04-09
---

# Phase 43 Plan 04: Auth Flow + App Shell Summary

**Supabase email+password auth with AsyncStorage session persistence, api-client with auto Bearer/workspace headers, system-following dark/light theme, i18n forced Spanish, and auth-guarded Expo Router layout**

## Auth Flow Diagram

```
Cold Start
    |
    v
SplashScreen.preventAutoHideAsync()
    |
    v
supabase.auth.getSession()
    |
    +-- session exists? --YES--> /(tabs)/inbox (SplashScreen.hideAsync)
    |
    +-- no session ---------> /(auth)/login (SplashScreen.hideAsync)
                                    |
                                    v
                              [email] + [password]
                              [Iniciar sesion] button
                                    |
                                    v
                        signInWithPassword({ email, password })
                                    |
                          +-- success? --YES--> router.replace('/(tabs)/inbox')
                          |
                          +-- error ----------> show t('auth.login.error') inline
                                    

/(tabs)/inbox
    |
    v
[Cerrar sesion] button
    |
    v
supabase.auth.signOut()
    |
    v
router.replace('/(auth)/login')
```

## Performance

- **Duration:** ~90 min (two executor sessions, checkpoint pause for device verification)
- **Tasks:** 4/4 (3 auto + 1 checkpoint:human-verify)
- **Files created:** 11
- **Files modified:** 3

## Accomplishments

- Supabase client configured with AsyncStorage persistence, `detectSessionInUrl: false`, `autoRefreshToken: true`
- api-client singleton: auto-injects `Authorization: Bearer <token>` + `x-workspace-id` headers on every request, `MobileApiError` class for typed errors, `health()` probe for cold-start smoke test
- Theme provider follows system dark/light with `useTheme()` hook and `setThemeOverride()` for user preference (persisted to AsyncStorage)
- i18n forced Spanish with seed keys: auth.login.*, inbox.*, common.* — all UI strings go through `t()` function
- Auth-guarded root layout: SplashScreen blocks until session check completes, then routes to tabs or auth
- Login screen with email+password validated end-to-end on two physical devices
- outbox.ts linkage fixed: removed `@ts-expect-error`, now statically imports `../api-client` for proper type safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Install auth+i18n deps + Supabase client** - `37ee2b5` (feat)
2. **Task 2: api-client, theme provider, i18n scaffold** - `230c78c` (feat)
3. **Task 3: Root layout, login, tabs, empty inbox** - `f35ea18` (feat)
4. **Task 4: Verify login + session restore + logout** - checkpoint:human-verify (user confirmed 2026-04-09)

## Files Created/Modified

### Created
- `apps/mobile/src/lib/supabase.ts` - Supabase client with AsyncStorage persistence
- `apps/mobile/src/lib/session.ts` - getCurrentSession(), signOut(), onAuthStateChange() helpers
- `apps/mobile/src/lib/api-client.ts` - HTTP client with auto Bearer + x-workspace-id, MobileApiError
- `apps/mobile/src/lib/theme/index.ts` - ThemeProvider, useTheme(), lightTheme/darkTheme tokens
- `apps/mobile/src/lib/i18n/index.ts` - i18next init forced Spanish, t() export
- `apps/mobile/src/lib/i18n/es.json` - Seed keys (auth.login.*, inbox.*, common.*)
- `apps/mobile/app/(auth)/login.tsx` - Email+password login screen with error handling
- `apps/mobile/app/(tabs)/_layout.tsx` - Tabs layout with single "Inbox" tab
- `apps/mobile/app/(tabs)/inbox.tsx` - Empty state placeholder + logout button
- `apps/mobile/app/+not-found.tsx` - 404 screen
- `apps/mobile/.env.example` - EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY

### Modified
- `apps/mobile/app/_layout.tsx` - Root layout with SplashScreen + auth guard + ThemeProvider + I18nextProvider
- `apps/mobile/package.json` - Added auth, i18n, theme dependencies
- `apps/mobile/src/lib/db/outbox.ts` - Removed @ts-expect-error, static import of api-client

## Supabase Client Config

```typescript
createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,        // Session persisted across app restarts
    autoRefreshToken: true,       // Auto-refresh before expiry
    persistSession: true,         // Writes session to AsyncStorage
    detectSessionInUrl: false,    // Prevents Expo deep link collisions
  },
})
```

## api-client Contract

- `mobileApi.get(path)`, `.post(path, body)`, `.patch(path, body)`, `.delete(path)` 
- Auto-reads session token via `supabase.auth.getSession()`
- Auto-reads workspace ID from in-memory singleton + AsyncStorage fallback (`mobile:selectedWorkspaceId`)
- Headers: `Authorization: Bearer <token>`, `x-workspace-id: <ws>`, `Content-Type: application/json`
- Throws `MobileApiError { status, body, message }` on non-2xx
- `health()` helper hits `/api/mobile/health` without auth
- `setSelectedWorkspaceId(id)` / `getSelectedWorkspaceId()` persist to AsyncStorage

## i18n Seed Keys

```json
{
  "auth": {
    "login": {
      "title": "Iniciar sesion",
      "email": "Correo electronico",
      "password": "Contrasena",
      "submit": "Iniciar sesion",
      "error": "Credenciales invalidas"
    }
  },
  "inbox": {
    "title": "Inbox",
    "empty": "No hay conversaciones"
  },
  "common": {
    "logout": "Cerrar sesion",
    "loading": "Cargando..."
  }
}
```

## Must-Haves Coverage

| Truth | Status | Evidence |
|-------|--------|----------|
| Supabase JS client configured with AsyncStorage + autoRefreshToken | PASS | `supabase.ts`: `storage: AsyncStorage`, `autoRefreshToken: true` |
| Email+password login at /(auth)/login works against prod Supabase | PASS | User verified on both devices |
| After login, user lands on /(tabs)/inbox with empty state | PASS | User verified: "empty inbox" screen shown |
| Cold start with existing session auto-routes to inbox | PASS | User verified: close+reopen goes straight to inbox |
| Logout clears session and routes to login | PASS | User verified: "Cerrar sesion" returns to login |
| All strings via t('key') — no hardcoded Spanish outside es.json | PASS | All UI text uses `t()` from i18next |
| Theme provider follows system dark/light with useTheme() hook | PASS | `theme/index.ts` subscribes to `Appearance.addChangeListener` |
| api-client sends Bearer + x-workspace-id on every request | PASS | `api-client.ts` reads session token + workspace ID per request |

## Device Verification Results

All 5 auth flows tested on 2 devices = 10/10 PASS:

| Flow | iPhone (Expo Go) | Android (Expo Go) |
|------|:-:|:-:|
| 1. Cold launch -> login screen | PASS | PASS |
| 2. Wrong credentials -> error | PASS | PASS |
| 3. Valid login -> empty inbox | PASS | PASS |
| 4. Close+reopen -> session restored | PASS | PASS |
| 5. Logout -> returns to login | PASS | PASS |

## Decisions Made

- **AsyncStorage over expo-secure-store for session:** Supabase JS client needs a storage adapter matching the `getItem/setItem/removeItem` interface. AsyncStorage fits natively; expo-secure-store has a different API shape.
- **detectSessionInUrl: false:** Essential in React Native / Expo — prevents the Supabase client from trying to parse OAuth redirect URLs from deep links, which would cause crashes.
- **Forced Spanish:** i18n is initialized but language switching UI deferred to Plan 12. All strings still go through `t()` for future-proofing.
- **outbox.ts fix:** Removed `@ts-expect-error` that was hiding a broken import. Static import of `../api-client` is now properly resolved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] outbox.ts @ts-expect-error removal**
- **Found during:** Task 2 (api-client creation)
- **Issue:** `outbox.ts` had `@ts-expect-error` suppressing a broken dynamic import of api-client that did not exist yet
- **Fix:** Replaced with static import `import { mobileApi } from '../api-client'`, removed @ts-expect-error
- **Files modified:** `apps/mobile/src/lib/db/outbox.ts`
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `230c78c` (Task 2 commit)

**2. [Rule 3 - Blocking] WSL2 tunnel mode required**
- **Found during:** Task 3 (device testing)
- **Issue:** WSL2 LAN IP not reachable from physical devices on same WiFi
- **Fix:** Used `npx expo start --tunnel` (ngrok) for device connectivity
- **Files modified:** None (runtime flag only)
- **Verification:** Both devices connected successfully via tunnel
- **Committed in:** N/A (no file changes)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both necessary for correct operation. No scope creep.

## Issues Encountered

- WSL2 networking requires `--tunnel` flag for Expo dev server — LAN mode does not work because WSL2 has its own virtual network adapter. This was already documented in Plan 02 SUMMARY and is the standard workflow for this dev environment.

## User Setup Required

None - Supabase credentials already configured in `.env.local` from Plan 02 setup.

## Next Phase Readiness

- Auth foundation complete: login, session restore, logout all verified on both devices
- api-client ready for all future plans to make authenticated HTTP requests
- i18n scaffold ready: future plans add keys to `es.json` and use `t()` throughout
- Theme provider ready: all future screens use `useTheme()` for colors
- Next plan (05): Push notification registration + Inngest delivery pipeline

---
*Phase: 43-mobile-app*
*Plan: 04*
*Completed: 2026-04-09*
