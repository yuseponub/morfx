# MorfX Mobile (apps/mobile)

Native iOS + Android app for MorfX. Phase 43 — WhatsApp inbox + bot toggle +
in-chat CRM side panel as the first mobile MVP.

- **Stack:** Expo SDK 54, React Native 0.81, expo-router v6, TypeScript strict
- **Package name (Android):** `app.morfx.mobile` — **LOCKED, never change**
- **Bundle identifier (iOS):** `app.morfx.mobile` — **LOCKED, never change**
- **Scheme:** `morfx`
- **Isolated workspace:** standalone npm project inside the morfx monorepo.
  Does NOT participate in the root `pnpm-workspace.yaml`. Running
  `npm run build` or `pnpm run build` at the repo root does not touch this
  directory.

## Requirements

- Node.js 20.x (Expo SDK 54 requires Node 20+)
- An Expo account (https://expo.dev) for EAS Build
- On Android: any recent phone with "Install unknown apps" enabled
- On iOS: Expo Go from the App Store during the $0 development phase

## Get started

```bash
cd apps/mobile
npm install
npx expo start
```

Then:

- **iPhone:** open Expo Go, scan the QR, load `morfx-mobile`.
- **Android:** use `adb` + Expo Go, or install the signed preview APK below.

The bootstrap screen should display: **"MorfX Mobile — bootstrap OK"**.

## Build profiles (`eas.json`)

| Profile     | Distribution | Artifact  | Channel     | Purpose                                        |
| ----------- | ------------ | --------- | ----------- | ---------------------------------------------- |
| development | internal     | apk       | development | Dev client for on-device debugging             |
| preview     | internal     | apk       | preview     | Sideloadable signed APK for $0 Android testing |
| production  | store        | app-bundle| production  | Google Play upload (when account exists)       |

Build an Android preview APK (this is what you sideload during development):

```bash
npx eas-cli build --profile preview --platform android
```

## --------------------------------------------------------------------

## ⚠️  NEVER RESET THE ANDROID KEYSTORE — READ THIS FIRST  ⚠️

## --------------------------------------------------------------------

This project uses **EAS Managed Credentials**. On the very first Android
build, EAS asks:

> "Generate a new Android Keystore?"

You answer **YES — exactly once, ever**. EAS stores that keystore on its
servers and reuses it for every subsequent build: development APK,
preview APK, production AAB, forever.

**WHY THIS MATTERS (Pitfall 2 — Research Day 1, HIGH severity, irreversible):**

Android identifies an app by `(package name, signing certificate)`. If the
APK that a user sideloads today is signed with keystore A, and tomorrow's
Play Store release is signed with keystore B, Android treats them as
**two different apps**. Every existing user would have to:

1. Manually uninstall the sideloaded version
2. Lose all local app state (cached conversations, pending outbox messages,
   login session, draft replies)
3. Download and install the Play Store version from scratch

This is the single most expensive mistake you can make in this phase, and
it is **irreversible** — once users have installed keystore A, you are
committed to keystore A for the life of the app.

**ABSOLUTELY NEVER:**

- Run `eas credentials` → `Android` → `Remove keystore` (unless the app has
  literally zero installed users and you are starting over)
- Run `eas credentials` → `Android` → `Set up a new keystore` on top of an
  existing one
- Generate a keystore locally and overwrite the EAS-managed one
- Change `android.package` in `app.json` (package name is half of the app
  identity — changing it is equivalent to shipping a brand new app)
- Commit any `*.jks`, `*.keystore`, `credentials.json`, or
  `google-services.json` file to git (`.gitignore` blocks these on purpose)

**WHEN YOU PUBLISH TO THE PLAY STORE LATER:**

Google Play now requires **Play App Signing**. When you upload the first
AAB, Google will ask for your "upload certificate" — that IS the
EAS-managed keystore from below. Upload it as-is. Google then manages the
final app signing key on their side while the EAS keystore remains your
upload key. **Do NOT generate a new keystore for the Play Store release.**

**TO EXPORT THE KEYSTORE** (backup / leaving EAS):

```bash
npx eas-cli credentials
# Platform: Android
# Profile: production
# Action: Download keystore
```

Store the downloaded `.jks` file in a secure password manager — never in
git, never in the repo, never in a shared folder.

## --------------------------------------------------------------------

## 🔐 Android keystore fingerprint (fill in after first EAS build)

Once the first `eas build --profile preview --platform android` completes
and generates the managed keystore, run:

```bash
npx eas-cli credentials
# Platform: Android  →  Profile: production  →  copy SHA-256
```

Paste the values below (this is a human-auditable proof that the keystore
was locked on day 1 and has never been rotated since):

```
Key Alias:           44f5c123d7fdcf266ca4d9fedf1f652c
MD5 Fingerprint:     58:2B:0C:2E:D3:7F:45:A6:8E:D5:54:AE:BA:4E:D9:18
SHA-1 fingerprint:   31:95:0A:C8:96:16:72:06:DB:6D:D9:BF:7A:2B:13:71:1F:C7:BE:91
SHA-256 fingerprint: 8A:C0:B5:54:E7:C1:4D:5D:0B:8B:B9:70:98:E2:30:AD:7A:76:75:E5:74:88:8E:29:32:6F:11:CC:1C:EF:84:07
Keystore type:       EAS Managed (JKS, stored on Expo servers)
Locked on:           2026-04-09
Locked by:           morfxjose
First build URL:     https://expo.dev/accounts/morfxjose/projects/morfx-mobile/builds/bb6e817a-cabd-4440-9f2d-a3d30c81dffc
```

If the SHA-256 you see in `eas credentials` later ever differs from the
value pasted above, **STOP** and do not publish anything — the keystore
was rotated and you risk stranding existing users.

## EAS Project ID

The EAS project ID is created by running `npx eas-cli init` and is
automatically written into `app.json` under `expo.extra.eas.projectId`.
Because that requires interactive Expo login, it is NOT done by the
bootstrap automation — the user must run it locally. See the Phase 43 Plan
02 checkpoint for the exact commands.

```
EAS projectId: bbbaad3e-180c-4743-b6d6-207c3b92bf17
Owner account: @morfxjose
Project URL:   https://expo.dev/accounts/morfxjose/projects/morfx-mobile
```

## Troubleshooting

- **`Cannot find module @/hooks/use-color-scheme`:** the default template's
  scaffolding (hooks/, components/, constants/) was removed on purpose.
  Any file that still imports from `@/hooks/...` is a leftover and should
  be deleted.
- **`react-native-reanimated` build errors on first run:** make sure
  `babel.config.js` keeps `babel-preset-expo` (Reanimated's plugin is
  bundled with it in SDK 54+).
- **`expo-doctor` warnings:** run `npx expo install --fix` to realign
  versions, then re-run `npx expo-doctor`.

## Pitfall reminders (from Phase 43 Research)

- **Pitfall 2 (keystore):** see the huge warning above.
- **Pitfall 3 (Expo Go prebuilt set):** during the $0 dev phase, do NOT
  install any library that requires a custom dev client. Specifically:
  no `@nozbe/watermelondb`, no `react-native-mmkv`, no
  `react-native-firebase`, no custom native modules. Use `expo-sqlite`,
  `expo-secure-store`, `expo-notifications`, and the other prebuilt
  modules that ship inside Expo Go.

---

Phase: `.planning/phases/43-mobile-app/`
