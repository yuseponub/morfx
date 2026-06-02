---
phase: 43-mobile-app
plan: 04
type: execute
wave: 3
depends_on: [2, 3]
files_modified:
  - apps/mobile/package.json
  - apps/mobile/src/lib/supabase.ts
  - apps/mobile/src/lib/api-client.ts
  - apps/mobile/src/lib/session.ts
  - apps/mobile/src/lib/i18n/index.ts
  - apps/mobile/src/lib/i18n/es.json
  - apps/mobile/src/lib/theme/index.ts
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/(auth)/login.tsx
  - apps/mobile/app/(tabs)/_layout.tsx
  - apps/mobile/app/(tabs)/inbox.tsx
  - apps/mobile/app/+not-found.tsx
  - apps/mobile/.env.example
autonomous: false
must_haves:
  truths:
    - "Supabase JS client is configured with AsyncStorage session persistence and expo-secure-store for refresh token"
    - "Email+password login screen at /(auth)/login works against production Supabase Auth"
    - "After login, user lands on /(tabs)/inbox with an empty state placeholder"
    - "On cold start, if a session exists in storage, the user is auto-routed to /(tabs)/inbox without seeing login"
    - "Logout from a settings menu clears the session and routes back to /(auth)/login"
    - "All user-visible strings come from a translation function t('key') — no hard-coded Spanish outside es.json"
    - "Theme provider follows system dark/light mode and exposes a useTheme() hook"
    - "api-client.ts sends Authorization: Bearer + x-workspace-id on every request and calls GET /api/mobile/health + /me on app start"
  artifacts:
    - apps/mobile/src/lib/supabase.ts
    - apps/mobile/src/lib/api-client.ts
    - apps/mobile/app/(auth)/login.tsx
  key_links:
    - "Every later mobile feature plan uses api-client.ts for HTTP and the t() function for strings"
---

<objective>
Wire the mobile app to Supabase Auth (email+password), establish a session-restore flow, scaffold the root layout with dark mode + i18n, and build the login screen. After this plan, the user can log in on both their Android sideload apk and Expo Go on iPhone and land on an empty inbox placeholder.

This plan is the foundation for all later UI work — the HTTP client, theme, i18n, and auth guard all live here.

Output: login screen, api-client, theme provider, i18n scaffold, auth-guarded tab layout.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install auth + i18n deps and configure Supabase client</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/lib/supabase.ts
    apps/mobile/src/lib/session.ts
    apps/mobile/.env.example
  </files>
  <action>From `apps/mobile/`:
  1. `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage expo-secure-store react-native-url-polyfill expo-localization` and `npm install zod i18next react-i18next date-fns`.
  2. Create `src/lib/supabase.ts` using the Research "Code Examples" Supabase client snippet. Use `AsyncStorage` for session, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`. Read `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `process.env`. Import `react-native-url-polyfill/auto` at the top.
  3. Create `src/lib/session.ts` with `getCurrentSession()` and `signOut()` helpers that wrap `supabase.auth.getSession()` and `supabase.auth.signOut()`. Also export `onAuthStateChange(callback)` that wraps the Supabase listener.
  4. Create `apps/mobile/.env.example` with `EXPO_PUBLIC_SUPABASE_URL=` and `EXPO_PUBLIC_SUPABASE_ANON_KEY=`. Instruct in the README (append) that the user must copy it to `.env.local` in `apps/mobile/` and fill in the same values used by the web app (they're in the main repo's `.env`).</action>
  <verify>`npx tsc --noEmit` in `apps/mobile/` passes. `apps/mobile/src/lib/supabase.ts` has `storage: AsyncStorage` and `detectSessionInUrl: false`.</verify>
  <done>Supabase client configured, session helpers exist, env example documented.</done>
</task>

<task type="auto">
  <name>Task 2: Build api-client.ts, theme provider, i18n scaffold</name>
  <files>
    apps/mobile/src/lib/api-client.ts
    apps/mobile/src/lib/theme/index.ts
    apps/mobile/src/lib/i18n/index.ts
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `src/lib/api-client.ts`: export a `mobileApi` object with `get(path)`, `post(path, body)`, `patch(path, body)`, `delete(path)`. Each method:
     - Reads `EXPO_PUBLIC_API_BASE_URL` from env (default `https://morfx.app`).
     - Calls `supabase.auth.getSession()` to get the current access token.
     - Reads the currently selected workspace id from a simple in-memory singleton + AsyncStorage fallback (`mobile:selectedWorkspaceId`).
     - Sends `Authorization: Bearer <token>`, `x-workspace-id: <ws>`, `Content-Type: application/json`.
     - Throws typed errors on non-2xx responses (`MobileApiError` with status + body).
     Also export `setSelectedWorkspaceId(id)` and `getSelectedWorkspaceId()` that persist to AsyncStorage. These are used by the workspace switcher in Plan 6.
     Include a small `health()` helper that hits `/api/mobile/health` without auth (for cold-start smoke test).
  2. `src/lib/theme/index.ts`: export `lightTheme`, `darkTheme` (color tokens matching web MorfX palette — pick reasonable defaults if not obvious; user can tune later), a `ThemeProvider` React context that subscribes to `Appearance.addChangeListener`, and a `useTheme()` hook. Default follows system. Expose a `setThemeOverride('light' | 'dark' | 'system')` for settings.
  3. `src/lib/i18n/index.ts`: initialize `i18next` with the `es` locale from `es.json`, fallback language `es`. Export `t()` function and `useTranslation()` re-export. Call `getLocales()` from `expo-localization` to respect system but force Spanish for now (with a comment that Plan 12 will add language switching UI).
  4. `src/lib/i18n/es.json`: seed keys — `auth.login.title`, `auth.login.email`, `auth.login.password`, `auth.login.submit`, `auth.login.error`, `inbox.title`, `inbox.empty`, `common.logout`, `common.loading`. This is the starting glossary — every later plan adds its own keys here.</action>
  <verify>`npx tsc --noEmit` passes. `cat apps/mobile/src/lib/i18n/es.json | python3 -m json.tool` parses successfully.</verify>
  <done>api-client handles auth headers automatically, theme provider exists, i18n initialized with seed Spanish strings.</done>
</task>

<task type="auto">
  <name>Task 3: Build root layout, login screen, auth guard, empty inbox stub</name>
  <files>
    apps/mobile/app/_layout.tsx
    apps/mobile/app/(auth)/login.tsx
    apps/mobile/app/(tabs)/_layout.tsx
    apps/mobile/app/(tabs)/inbox.tsx
    apps/mobile/app/+not-found.tsx
  </files>
  <action>
  1. `app/_layout.tsx`: root layout that wraps the tree in `GestureHandlerRootView`, `ThemeProvider`, `I18nextProvider`. Uses `SplashScreen.preventAutoHideAsync()` until session restore completes. After `supabase.auth.getSession()` resolves: if session exists, route to `/(tabs)/inbox`, else route to `/(auth)/login`. Use expo-router's `<Stack />` at the root with groups for `(auth)` and `(tabs)`.
  2. `app/(auth)/login.tsx`: email + password `TextInput`s (with `autoCapitalize="none"`, `keyboardType="email-address"`, `secureTextEntry` on password), submit button. On submit, call `supabase.auth.signInWithPassword({ email, password })`. On success, router navigates to `/(tabs)/inbox`. On error, show inline error using `t('auth.login.error')`. All strings via `t()`. Use theme colors from `useTheme()`.
  3. `app/(tabs)/_layout.tsx`: a `<Tabs />` layout with ONE tab for v1: "Inbox". Icon via `lucide-react-native` (install it: `npx expo install lucide-react-native react-native-svg`). Include a header right-button for settings/logout (or put logout in the inbox empty state for now — simplest).
  4. `app/(tabs)/inbox.tsx`: empty state that shows `t('inbox.empty')` and a "Logout" button calling `signOut()` + router.replace to login. This is a placeholder — Plan 7 replaces it with the real inbox list.
  5. `app/+not-found.tsx`: simple 404 screen.
  </action>
  <verify>`npx expo-doctor` passes. `npx tsc --noEmit` passes. Visually confirmed in Task 4.</verify>
  <done>Auth flow code is in place. All strings go through t().</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Verify login + session restore + logout on both devices</name>
  <files>n/a</files>
  <action>Have the user test on BOTH devices (Expo Go iPhone + sideload Android apk from Plan 2):
  1. Cold launch → lands on login screen
  2. Enter valid credentials → lands on empty inbox with "no conversations" placeholder
  3. Close app, reopen → should land directly on inbox (session restored)
  4. Tap logout → returns to login screen
  5. Enter invalid credentials → sees error

  Note: the Android apk does NOT have the new code yet — it was built in Plan 2 before this code existed. For Android testing, rebuild via `npx eas-cli build --profile preview --platform android` OR use `npx expo start` with the Expo Go equivalent for Android (Expo Go for Android also works if the user doesn't want to wait on a new build).

  If anything fails, diagnose and fix before marking complete.</action>
  <verify>User confirms all 5 flows work on both devices.</verify>
  <done>Auth + session restore + logout proven end-to-end on iOS (Expo Go) and Android.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- Login + session restore + logout work on both devices
- All user-visible strings pulled from `es.json` via `t()`
- Theme follows system dark/light mode
- api-client includes Bearer token and x-workspace-id automatically
</verification>

<success_criteria>
User can log in, be remembered across restarts, see an empty inbox placeholder, and log out — on both iPhone (Expo Go) and Android (sideload apk).
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-04-SUMMARY.md` with: auth flow diagram (sketched in text), theme decisions, i18n seed keys, how api-client gets its bearer token.
</output>
