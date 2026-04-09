---
phase: 43-mobile-app
plan: 02
subsystem: infra
tags: [expo, expo-router, react-native, eas-build, android-keystore, typescript, mobile]

# Dependency graph
requires:
  - phase: 43-mobile-app
    provides: "Plan 01 established phase scope, stack choices (Expo SDK 54, expo-router v6, TS strict), and the `app.morfx.mobile` identifier lock"
provides:
  - "apps/mobile/ workspace bootstrapped with Expo SDK 54, React Native 0.81, expo-router v6, TypeScript strict"
  - "eas.json with development / preview / production profiles (apk / apk / aab)"
  - "EAS project initialized (projectId bbbaad3e-180c-4743-b6d6-207c3b92bf17, owner @morfxjose)"
  - "Android signing keystore LOCKED via EAS Managed Credentials on 2026-04-09 (SHA-256 recorded in README)"
  - "First signed preview APK built and sideloaded on user's physical Android device — bootstrap screen verified"
  - "Expo Go bootstrap verified on user's iPhone via tunnel mode"
  - "expo-updates wired and runtimeVersion policy set (appVersion) — foundation for OTA channel routing in later plans"
affects: [43-03, 43-04, 43-05, 43-06, 43-07, 43-08, 43-09, 43-10a, 43-10b, 43-11, 43-12, 43-13, 43-14, 43-15, all-future-mobile-work]

# Tech tracking
tech-stack:
  added:
    - "expo@~54.0.33"
    - "expo-router@~6.0.23"
    - "react-native@0.81.5"
    - "react@19.1.0"
    - "expo-updates@~29.0.16 (required by EAS when channel is set in eas.json; part of Expo Go prebuilt set)"
    - "eas-cli (user-side, not a repo dependency)"
  patterns:
    - "Mobile app lives at apps/mobile/ as an isolated npm workspace (NOT part of root pnpm-workspace.yaml) — root build/dev commands do not touch it"
    - "EAS Managed Credentials: Expo servers hold the single source-of-truth Android keystore; local repo never contains *.jks files (.gitignore enforces)"
    - "Keystore fingerprints pinned human-readably in README.md as an audit trail — if eas credentials output ever diverges from README, publishing is blocked"
    - "Three EAS profiles: development (dev client apk), preview (sideload apk, used during $0 phase), production (aab, reserved for Play Store)"
    - "expo-updates runtimeVersion policy 'appVersion' — forces OTA channel match on version bumps, preventing incompatible JS bundles from hitting older native binaries"

key-files:
  created:
    - ".planning/phases/43-mobile-app/43-02-SUMMARY.md"
  modified:
    - "apps/mobile/README.md (fingerprints + EAS project URL + keystore lock date recorded)"
    - "apps/mobile/app.json (eas.projectId, updates.url, runtimeVersion added by eas-cli init + expo install expo-updates)"
    - "apps/mobile/package.json (expo-updates added)"
    - "apps/mobile/package-lock.json (expo-updates tree)"

key-decisions:
  - "Keystore locked to EAS Managed JKS on 2026-04-09 — never rotate (Pitfall 2, irreversible)"
  - "android.package and ios.bundleIdentifier locked to app.morfx.mobile permanently"
  - "Accept the EAS expo-updates install prompt: expo-updates is in the Expo Go prebuilt set, so installing it does not break the Pitfall 3 constraint of 'no custom dev client during $0 phase'"
  - "Use `npx expo start --tunnel` (not plain `expo start`) when serving from WSL2 to an iPhone — LAN mode is unreachable through the WSL2 NAT"
  - "Interactive EAS steps (login, init, build) were delegated to the user via checkpoint, not executed by the agent (respects Regla 6 and the plan's autonomous=false contract)"

patterns-established:
  - "Pattern 1: Keystore audit — paste MD5/SHA-1/SHA-256 fingerprints into README.md after first build so any rotation is detectable by grep"
  - "Pattern 2: Checkpoint delegation — any step that requires interactive Expo/EAS CLI login is returned to the orchestrator as a human-action checkpoint; the agent never runs eas-cli itself"
  - "Pattern 3: WSL2 mobile dev — always use `--tunnel` for iPhone testing from WSL2; document this so future phases don't waste time on the LAN path"

# Metrics
duration: ~2h (spanning user-side EAS build + keystore lock + device verification)
completed: 2026-04-09
---

# Phase 43 Plan 02: Mobile Bootstrap + EAS + Keystore Summary

**Expo SDK 54 + expo-router v6 project at apps/mobile/ with EAS Managed Android keystore locked (SHA-256 8A:C0:B5:54...84:07), first preview APK sideloaded on user's Android, and Expo Go verified on iPhone via WSL2 tunnel mode.**

## Performance

- **Started:** 2026-04-09 (earlier today, Tasks 1 and 2 committed as a27e457 and 9ef5437)
- **Completed:** 2026-04-09
- **Tasks:** 4 (Task 1 bootstrap, Task 2 eas.json + README, Task 3 keystore lock, Task 4 device verification)
- **Files modified in Task 3:** 4 (README, app.json, package.json, package-lock.json)

## Accomplishments

- `apps/mobile/` exists as a standalone Expo SDK 54 workspace inside the morfx monorepo, NOT coupled to the root pnpm-workspace
- React Native 0.81.5, expo-router v6, React 19.1.0, TypeScript strict
- `eas.json` defines development (dev client apk), preview (sideload apk), production (aab) profiles
- EAS project created on Expo Cloud: projectId `bbbaad3e-180c-4743-b6d6-207c3b92bf17`, owner `@morfxjose`, URL https://expo.dev/accounts/morfxjose/projects/morfx-mobile
- Android signing keystore LOCKED via EAS Managed Credentials (JKS, key alias `44f5c123d7fdcf266ca4d9fedf1f652c`, generated 2026-04-09)
- Keystore fingerprints pinned in `apps/mobile/README.md`:
  - MD5: `58:2B:0C:2E:D3:7F:45:A6:8E:D5:54:AE:BA:4E:D9:18`
  - SHA-1: `31:95:0A:C8:96:16:72:06:DB:6D:D9:BF:7A:2B:13:71:1F:C7:BE:91`
  - SHA-256: `8A:C0:B5:54:E7:C1:4D:5D:0B:8B:B9:70:98:E2:30:AD:7A:76:75:E5:74:88:8E:29:32:6F:11:CC:1C:EF:84:07`
- First EAS Android build completed: https://expo.dev/accounts/morfxjose/projects/morfx-mobile/builds/bb6e817a-cabd-4440-9f2d-a3d30c81dffc
- Signed preview APK sideloaded on user's physical Android device — "MorfX Mobile — bootstrap OK" screen rendered
- Expo Go + `npx expo start --tunnel` verified on user's iPhone — bootstrap screen rendered
- Orchestrator ran an automated SHA-256 cross-check between `eas credentials` output and `apps/mobile/README.md` — **byte-for-byte match, PASSED**

## Task Commits

1. **Task 1: Create apps/mobile Expo SDK 54 project** — `a27e457` (feat)
2. **Task 2: eas.json + README placeholder** — `9ef5437` (chore)
3. **Task 3: Lock Android keystore + record fingerprints in README** — `050ccbd` (feat)

**Plan metadata:** (appended below after SUMMARY and STATE are written)

_Task 4 (device verification) produced no code changes — it was a runtime check only, so no separate commit. Its evidence is documented in this SUMMARY._

## Files Created/Modified

- `apps/mobile/` — entire Expo SDK 54 bootstrap tree (from Task 1)
- `apps/mobile/eas.json` — three build profiles (from Task 2)
- `apps/mobile/README.md` — Plan 02 committed the full Plan 02 README in Task 2; Task 3 filled in the fingerprints/project URL/build URL placeholders
- `apps/mobile/app.json` — Task 1 set name/slug/bundleIdentifier/package/scheme; Task 3 picked up `expo.extra.eas.projectId` + `expo.updates.url` + `expo.runtimeVersion` from `eas-cli init` and `expo install expo-updates`
- `apps/mobile/package.json` + `package-lock.json` — Task 3 picked up the `expo-updates` install from the EAS channel requirement

## Decisions Made

- **Lock keystore forever.** EAS Managed Credentials is the single source of truth. No local `.jks` file in the repo, no rotation, no second keystore for Play Store (Play App Signing will reuse this key as the upload key). Pitfall 2 of 43-RESEARCH.md is the explicit driver.
- **Install `expo-updates`.** EAS demanded it because `eas.json` uses `channel: "preview"` / `channel: "production"` in the profiles. `expo-updates` is inside the Expo Go prebuilt set, so installing it does NOT force a custom dev client and therefore does NOT break Pitfall 3 (no custom native modules during the $0 phase). This was the right call.
- **Use tunnel mode for iPhone testing from WSL2.** `npx expo start` binds to the WSL2 VM IP (172.17.181.58 in this case) which is unreachable from the user's iPhone on the regular LAN because of WSL2's NAT. `--tunnel` routes through Expo's servers and bypasses the NAT entirely. This is now the documented pattern for all future mobile dev from this repo on WSL2.
- **Delegate EAS CLI interaction to the user.** `eas login`, `eas init`, and `eas build` all require interactive Expo account authentication. The agent returned checkpoints instead of trying to run them. This honors both Regla 6 (no unauthorized production changes) and the plan's `autonomous: false` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed `expo-updates` per EAS channel requirement**

- **Found during:** Task 3 (EAS build preparation on user's machine)
- **Issue:** `eas.json` profiles use the `channel` field (development/preview/production). EAS refuses to build without `expo-updates` installed when a channel is set. The original Plan 02 text did not anticipate this prompt.
- **Fix:** Accepted the EAS prompt on the user's machine; `expo install expo-updates` added the dependency. `expo-updates` is part of the Expo Go prebuilt set so Pitfall 3 (no custom dev client) is respected.
- **Files modified:** `apps/mobile/package.json`, `apps/mobile/package-lock.json`, `apps/mobile/app.json` (runtimeVersion + updates.url written by expo install)
- **Verification:** First EAS build bb6e817a completed successfully; bootstrap APK runs on user's Android.
- **Committed in:** `050ccbd` (Task 3 commit)

**2. [Rule 3 - Blocking] iPhone verification required `--tunnel` mode (not plain `expo start`)**

- **Found during:** Task 4 (iPhone Expo Go verification)
- **Issue:** `npx expo start` from WSL2 advertised `exp://172.17.181.58:8081`, which was unreachable from the user's iPhone because WSL2 uses a private NAT subnet that the LAN cannot route to.
- **Fix:** Switched to `npx expo start --tunnel`. Expo's tunnel service proxied the connection and the iPhone loaded the bootstrap screen successfully.
- **Files modified:** None — this is a runtime flag, not a code change.
- **Verification:** "MorfX Mobile — bootstrap OK" rendered on iPhone through Expo Go.
- **Committed in:** Not applicable (runtime-only fix, documented in README for future sessions).

**3. [Rule 4 equivalent - delegated to user, not architectural] EAS CLI login/init/build run by user, not by agent**

- **Found during:** Task 2 end / Task 3 start
- **Issue:** The plan text implied the agent might run `eas init` and `eas build` itself. Those commands require interactive Expo account authentication, which the agent cannot perform (Regla 6: no unauthorized production-touching changes) and the plan's `autonomous: false` frontmatter already anticipated this.
- **Fix:** Agent returned a human-action checkpoint describing the exact commands. User ran them on their machine. Agent resumed with the resulting artifacts (projectId, build URL, fingerprints) and committed them here.
- **Files modified:** None in this step; the deferred work manifested as the Task 3 commit.
- **Verification:** Orchestrator cross-checked SHA-256 from `eas credentials` against README — byte-for-byte match.
- **Committed in:** `050ccbd` (Task 3 commit, contains the user-sourced values)

---

**Total deviations:** 3 auto-fixed / procedurally handled (2 Rule 3 blocking, 1 checkpoint protocol)
**Impact on plan:** None of the deviations changed scope. Deviation 1 added one mandatory Expo package that is part of Expo Go anyway. Deviation 2 is a runtime-only dev convenience. Deviation 3 is just the correct checkpoint protocol being exercised. All plan must-haves are satisfied.

## Issues Encountered

- None during planned work. The expo-updates prompt and tunnel-mode requirement were both unexpected but trivially handled and fully documented.

## User Setup Required

None new. The only user-side work was the already-completed EAS login/init/build flow, which has been run. Future plans will consume the `apps/mobile/` workspace as-is.

## Must-Haves Coverage

Walking the plan frontmatter's `must_haves.truths` list:

1. **`apps/mobile/` exists as a workspace inside the morfx monorepo with Expo SDK 54+ and TypeScript strict** — SATISFIED. `apps/mobile/package.json` pins `expo@~54.0.33`, `react-native@0.81.5`, `typescript@~5.9.2`; `tsconfig.json` extends Expo's strict base.
2. **`npx expo start` from `apps/mobile/` opens a working dev server with Expo Go on the user's iPhone (scan QR) and an Android emulator/device** — SATISFIED. iPhone verified via `--tunnel`. Android verified via sideloaded preview APK.
3. **`eas.json` defines three profiles: development (dev client apk), preview (sideload apk), production (aab)** — SATISFIED. Committed in `9ef5437` (Task 2).
4. **EAS Managed Credentials has been initialized and the Android keystore is generated + stored on Expo's servers** — SATISFIED. JKS keystore, key alias `44f5c123d7fdcf266ca4d9fedf1f652c`, generated 2026-04-09, stored on Expo servers, confirmed via `eas credentials`.
5. **`android.package` in `app.json` is locked to `app.morfx.mobile` and will not be changed for the life of the app** — SATISFIED. `apps/mobile/app.json` line `"package": "app.morfx.mobile"`. README section carries the LOCKED warning.
6. **First `eas build --profile preview --platform android` produces a signed `.apk` and the user has sideloaded it on their Android device successfully** — SATISFIED. Build bb6e817a-cabd-4440-9f2d-a3d30c81dffc. User confirmed "bootstrap OK" rendered on physical Android.
7. **`eas credentials` shows one and only one Android keystore fingerprint and the user has recorded it in the README** — SATISFIED. Orchestrator cross-checked SHA-256 byte-for-byte between `eas credentials` and `apps/mobile/README.md` — MATCH.

All seven truths satisfied. Plan 02 is complete.

## Next Phase Readiness

- `apps/mobile/` is the foundation for every subsequent Phase 43 plan (03 through 15). All plans can now assume:
  - The workspace exists
  - The keystore is locked and future EAS builds will be signed with the same identity
  - expo-updates is present for channel-based OTA routing
  - `eas build --profile preview --platform android` is a one-liner to get a new signed APK
- **Critical invariant for all future work:** Never run `eas credentials → remove keystore`. Never change `android.package` or `ios.bundleIdentifier`. Never commit a local `.jks` file.
- No blockers for Plan 03.

---
*Phase: 43-mobile-app*
*Completed: 2026-04-09*
