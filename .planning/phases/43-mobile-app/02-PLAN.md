---
phase: 43-mobile-app
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/package.json
  - apps/mobile/app.json
  - apps/mobile/eas.json
  - apps/mobile/tsconfig.json
  - apps/mobile/.gitignore
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/index.tsx
  - apps/mobile/README.md
  - package.json
autonomous: false
must_haves:
  truths:
    - "`apps/mobile/` exists as a workspace inside the morfx monorepo with Expo SDK 54+ and TypeScript strict"
    - "`npx expo start` from `apps/mobile/` opens a working dev server with Expo Go on the user's iPhone (scan QR) and an Android emulator/device"
    - "`eas.json` defines three profiles: development (dev client apk), preview (sideload apk), production (aab)"
    - "EAS Managed Credentials has been initialized and the Android keystore is generated + stored on Expo's servers"
    - "`android.package` in `app.json` is locked to `app.morfx.mobile` and will not be changed for the life of the app"
    - "First `eas build --profile preview --platform android` produces a signed `.apk` and the user has sideloaded it on their Android device successfully"
    - "`eas credentials` shows one and only one Android keystore fingerprint and the user has recorded it in the README"
  artifacts:
    - apps/mobile/package.json
    - apps/mobile/app.json
    - apps/mobile/eas.json
    - apps/mobile/README.md
  key_links:
    - "The locked keystore is the identity anchor for EVERY later build. Play App Signing opt-in will reuse this key at Play Store upload time."
---

<objective>
Bootstrap the mobile app as a new Expo SDK 54+ project at `apps/mobile/` inside the morfx monorepo. Initialize EAS Build. LOCK the Android signing keystore on the very first build via EAS Managed Credentials, opt in to Google Play App Signing conceptually (documented in README for future Play upload). Produce a sideloadable `.apk` for Android and verify Expo Go works on the user's iPhone. This plan is the single most consequential one in the phase because a keystore mistake here is catastrophic and irreversible (43-RESEARCH.md Pitfall 2).

Purpose: establish the mobile project skeleton, the cloud build pipeline, and the signing identity — all before any feature code exists, so every subsequent plan inherits these safely.

Output: `apps/mobile/` directory with a runnable Expo app, EAS initialized, Android keystore locked in the cloud, first sideload `.apk` installed on the user's Android device.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/mobile/ Expo SDK 54+ project with TS strict and expo-router</name>
  <files>
    apps/mobile/package.json
    apps/mobile/app.json
    apps/mobile/tsconfig.json
    apps/mobile/.gitignore
    apps/mobile/app/_layout.tsx
    apps/mobile/app/index.tsx
    apps/mobile/babel.config.js
    apps/mobile/metro.config.js
    package.json
  </files>
  <action>Run `cd apps && npx create-expo-app@latest mobile --template default --no-install` (use --no-install because we'll install in the monorepo-aware way). Then:
  1. Edit `apps/mobile/app.json`:
     - `expo.name`: "MorfX"
     - `expo.slug`: "morfx-mobile"
     - `expo.ios.bundleIdentifier`: "app.morfx.mobile"
     - `expo.android.package`: "app.morfx.mobile" (LOCK — do not change ever per Research "Application ID decision")
     - `expo.scheme`: "morfx"
     - `expo.userInterfaceStyle`: "automatic" (dark mode follow system)
     - `expo.orientation`: "portrait"
     - `expo.plugins`: include "expo-router"
     - `expo.experiments.typedRoutes`: true
  2. Edit `apps/mobile/tsconfig.json` to extend `expo/tsconfig.base` and set `"strict": true`, `"baseUrl": "."`, and path alias `"@/*": ["src/*"]`.
  3. Install deps from inside `apps/mobile/`: `npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar react-native-reanimated react-native-gesture-handler`. Then `npm install --save-dev typescript @types/react`.
  4. Create `apps/mobile/app/_layout.tsx` as a minimal expo-router root with `<Stack />` inside `GestureHandlerRootView`.
  5. Create `apps/mobile/app/index.tsx` that renders a `<Text>MorfX Mobile — bootstrap OK</Text>` inside a SafeAreaView so we can prove the project runs.
  6. Add the root `package.json` (repo root) a `"workspaces"` entry if it doesn't have one, or document in `apps/mobile/README.md` that the sub-project is standalone (npm inside `apps/mobile/` only). Do NOT restructure the repo — additive only per Regla 6.
  7. Ensure `apps/mobile/.gitignore` covers `node_modules/`, `.expo/`, `.expo-shared/`, `dist/`, `credentials.json`, `*.jks`, `*.keystore`, `google-services.json`.

  Do NOT install any library outside the Expo Go prebuilt set (no WatermelonDB, no react-native-mmkv, no react-native-firebase). See Research Pitfall 3.</action>
  <verify>From inside `apps/mobile/`: `npx expo-doctor` exits 0. `npx tsc --noEmit` exits 0. `cat apps/mobile/app.json | grep "app.morfx.mobile"` prints two lines (ios + android).</verify>
  <done>`apps/mobile/` exists, TypeScript strict passes, `app.json` has locked bundle/package identifiers.</done>
</task>

<task type="auto">
  <name>Task 2: Initialize EAS, create eas.json profiles, configure Managed Credentials</name>
  <files>
    apps/mobile/eas.json
    apps/mobile/app.json
    apps/mobile/README.md
  </files>
  <action>From inside `apps/mobile/`:
  1. `npx eas-cli@latest login` — user already has an Expo account (verify with them if not; if not, pause and ask them to create one at expo.dev — no cost).
  2. `npx eas-cli init` — this creates/links an EAS projectId in `app.json` under `expo.extra.eas.projectId`.
  3. Write `apps/mobile/eas.json` with three build profiles per Research "Day 1 setup":
     - `development`: `developmentClient: true`, `distribution: "internal"`, android `buildType: "apk"`
     - `preview`: `distribution: "internal"`, android `buildType: "apk"` — this is the sideload profile
     - `production`: android `buildType: "app-bundle"` — AAB for Play Store (used months later)
     All profiles use `node: "20.x"` and explicitly set `channel` to match profile name for future EAS Update.
  4. Write `apps/mobile/README.md` with: project purpose, how to run dev (`npx expo start`), how to build preview apk (`eas build --profile preview --platform android`), a BIG WARNING section titled "NEVER RESET THE KEYSTORE" quoting Research Pitfall 2, and a placeholder for the keystore fingerprint to be recorded in Task 4.</action>
  <verify>`cat apps/mobile/eas.json` shows all three profiles. `cat apps/mobile/app.json | grep -A2 "eas"` shows a projectId. `cat apps/mobile/README.md | grep "NEVER RESET"` returns a line.</verify>
  <done>EAS initialized, eas.json profiles configured, README warns about the keystore.</done>
</task>

<task type="checkpoint:human-action">
  <name>Task 3: User runs first `eas build --profile preview --platform android` and sideloads apk</name>
  <files>n/a</files>
  <action>STOP. Instruct the user (in the chat) to run EXACTLY these commands from inside `apps/mobile/`:
  ```
  npx eas-cli build --profile preview --platform android
  ```
  When prompted "Generate a new Android Keystore?" — answer YES. This is the ONE and ONLY time a keystore will be generated for this app. EAS will store it in their cloud and reuse it forever.

  Wait for the build to finish (EAS will email + show a URL). Have the user download the `.apk`, transfer it to their Android device, and install it (enable "Install from unknown sources" if needed).

  Then ask the user to run `npx eas-cli credentials` → select Android → production → and COPY THE KEYSTORE FINGERPRINT (SHA-256). Paste it into `apps/mobile/README.md` under the placeholder.

  Do NOT proceed until: (a) the apk installs and opens to the "MorfX Mobile — bootstrap OK" screen on the user's Android device, AND (b) the keystore fingerprint is recorded in the README.</action>
  <verify>User confirms the apk installed and the bootstrap screen appears. README contains a real SHA-256 fingerprint.

  **Automated keystore fingerprint cross-check** (prevents README drift):
  1. Extract the fingerprint from the README: `grep -i "SHA-256" apps/mobile/README.md`
  2. Re-run `cd apps/mobile && npx eas-cli credentials` → Android → production → copy the SHA-256 fingerprint output.
  3. Compare the two byte-for-byte (normalize whitespace + case). They MUST be identical.
  4. If mismatch: HALT. Do not mark the task complete. Either the README was edited by hand or the keystore was rotated — investigate before continuing. Any keystore rotation is a Pitfall 2 violation (Play Store lockout).</verify>
  <done>Android sideload path is proven end-to-end. Keystore fingerprint is recorded, locked, and cross-checked against the live EAS credential.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: User verifies Expo Go works on iPhone</name>
  <files>n/a</files>
  <action>From inside `apps/mobile/`, instruct the user to:
  1. Install Expo Go from the App Store on their iPhone (free, no Apple Developer account required).
  2. Run `npx expo start` on the dev machine (Linux/WSL).
  3. Scan the QR code with the iPhone camera → opens in Expo Go.
  4. Confirm the "MorfX Mobile — bootstrap OK" screen renders.

  This proves the $0 iOS dev path works. Pause until user confirms.</action>
  <verify>User confirms the iPhone shows the bootstrap screen via Expo Go.</verify>
  <done>Both iOS (Expo Go) and Android (sideload apk) dev paths proven with no paid accounts.</done>
</task>

</tasks>

<verification>
- `apps/mobile/` is a clean Expo SDK 54+ project, TS strict, expo-router in place
- `eas.json` has development / preview / production profiles
- Android package name + iOS bundle identifier are both `app.morfx.mobile` and LOCKED
- EAS Managed Credentials holds the only Android keystore for this app; fingerprint recorded in README
- First preview apk runs on user's Android device
- Expo Go runs on user's iPhone
- No libraries outside Expo Go's prebuilt set have been installed
</verification>

<success_criteria>
Two devices (user's Android + user's iPhone) both successfully run the bootstrap screen. `eas credentials` shows one Android keystore. `apps/mobile/README.md` contains the keystore fingerprint + NEVER-RESET warning.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-02-SUMMARY.md` with: apps/mobile/ path confirmation, Expo SDK version, expo-router version, EAS projectId, Android keystore SHA-256, Android package name, iOS bundle identifier, screenshot/confirmation of bootstrap screen on both devices.
</output>
